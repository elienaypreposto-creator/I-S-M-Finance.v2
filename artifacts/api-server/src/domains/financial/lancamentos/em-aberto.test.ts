/**
 * Em aberto / quitado de um título (resumo "A receber / A pagar" de Lançamentos).
 * Run: npx tsx --test src/domains/financial/lancamentos/em-aberto.test.ts
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {PgDialect} from "drizzle-orm/pg-core";
import {
    emAbertoLinhaCents,
    emAbertoLinhaSql,
    emAbertoLiquidoSql,
    emAbertoNoPainelWhere,
    quitadoCents,
    quitadoSql,
    temResidualAtivoSql,
} from "./em-aberto";

// Título do QA: bruto 1.600, retenções 97,50 (líquido 1.502,50).
const base = {valor: "1600.00", valor_liquido: "1502.50", desconto: "0.00", juros: "0.00", valor_quitado: null};

describe("emAbertoLinhaCents", () => {
    it("pendente e atrasado: o valor da linha (bruto − desconto + juros)", () => {
        assert.equal(emAbertoLinhaCents({...base, status: "pendente"}), 160000);
        assert.equal(emAbertoLinhaCents({...base, status: "atrasado", desconto: "100.00", juros: "12.34"}), 151234);
    });

    it("pago, recebido e cancelado não estão em aberto", () => {
        for (const status of ["pago", "recebido", "cancelado"]) {
            assert.equal(emAbertoLinhaCents({...base, status, valor_quitado: "1502.50"}), 0, status);
        }
    });

    it("pago parcial: só o que falta quitar (QA: 500, pago 400 → 100)", () => {
        const parcial = {status: "pago_parcial", valor: "500.00", valor_liquido: "500.00", desconto: "0", juros: "0", valor_quitado: "400.00"};
        assert.equal(emAbertoLinhaCents(parcial), 10000);
        // Com retenção: o líquido é o que falta passar pelo banco.
        assert.equal(emAbertoLinhaCents({...base, status: "pago_parcial", valor_quitado: "1000.00"}), 50250);
        // Desconto concedido na conciliação reduz o que falta; nunca negativo.
        assert.equal(emAbertoLinhaCents({...parcial, desconto: "150.00"}), 0);
    });
});

describe("pago parcial com residual: o restante não conta duas vezes", () => {
    type Titulo = {id: number; status: string; valor: string; valor_quitado?: string | null; lancamento_origem_id?: number | null};

    /** Mesma regra de `temResidualAtivoSql`: há residual não cancelado apontando para o título. */
    const emAbertoTotal = (titulos: Titulo[]) =>
        titulos.reduce((soma, l) => {
            const tem_residual_ativo = titulos.some((r) => r.lancamento_origem_id === l.id && r.status !== "cancelado");
            return soma + emAbertoLinhaCents({...l, valor_liquido: l.valor, desconto: "0", juros: "0", tem_residual_ativo});
        }, 0);

    it("sem residual (vínculo parcial sem gerar residual): conta o restante", () => {
        assert.equal(emAbertoTotal([{id: 1, status: "pago_parcial", valor: "500.00", valor_quitado: "400.00"}]), 10000);
        assert.equal(emAbertoLinhaCents({...base, status: "pago_parcial", valor_quitado: "1000.00", tem_residual_ativo: false}), 50250);
    });

    it("com residual ativo: o restante fica só no residual", () => {
        const titulos = [
            {id: 1, status: "pago_parcial", valor: "500.00", valor_quitado: "400.00"},
            {id: 2, status: "atrasado", valor: "100.00", lancamento_origem_id: 1},
        ];
        assert.equal(emAbertoTotal(titulos), 10000);
        assert.equal(emAbertoLinhaCents({...base, status: "pago_parcial", valor_quitado: "1000.00", tem_residual_ativo: true}), 0);
    });

    it("com residual cancelado: o restante volta a contar no título", () => {
        const titulos = [
            {id: 1, status: "pago_parcial", valor: "500.00", valor_quitado: "400.00"},
            {id: 2, status: "cancelado", valor: "100.00", lancamento_origem_id: 1},
        ];
        assert.equal(emAbertoTotal(titulos), 10000);
    });

    it("cadeia de dois residuais: só o último em aberto (caso real 200.000 → 187.991)", () => {
        const titulos = [
            {id: 1, status: "pago_parcial", valor: "200000.00", valor_quitado: "9.00"},
            {id: 2, status: "pago_parcial", valor: "199991.00", valor_quitado: "12000.00", lancamento_origem_id: 1},
            {id: 3, status: "pendente", valor: "187991.00", lancamento_origem_id: 2},
        ];
        // Antes: 199.991 + 187.991 + 187.991.
        assert.equal(emAbertoTotal(titulos), 18799100);
    });
});

describe("quitadoCents", () => {
    it("soma o valor quitado de pago, recebido e pago parcial", () => {
        assert.equal(quitadoCents({status: "pago", valor_quitado: "1502.50"}), 150250);
        assert.equal(quitadoCents({status: "recebido", valor_quitado: 900}), 90000);
        assert.equal(quitadoCents({status: "pago_parcial", valor_quitado: "400"}), 40000);
    });

    it("aberto ou cancelado não conta (mesmo com resto de quitação antiga)", () => {
        assert.equal(quitadoCents({status: "pendente", valor_quitado: "10"}), 0);
        assert.equal(quitadoCents({status: "cancelado", valor_quitado: "10"}), 0);
    });
});

describe("SQL do resumo segue a mesma regra", () => {
    const dialect = new PgDialect();
    it("em aberto: só pendente, atrasado e o restante do pago parcial", () => {
        const {sql} = dialect.sqlToQuery(emAbertoLinhaSql);
        assert.match(sql, /in \('pendente', 'atrasado'\) then greatest\("lancamentos"\."valor"/);
        assert.match(sql, /= 'pago_parcial' then \(case when exists \(.*\) then 0 else greatest\("lancamentos"\."valor_liquido".*- coalesce\("lancamentos"\."valor_quitado", 0\), 0\) end\)/s);
        assert.match(sql, /else 0 end$/);
    });

    it("residual ativo: outro lançamento da mesma empresa, apontando para o título, não cancelado", () => {
        const {sql} = dialect.sqlToQuery(temResidualAtivoSql);
        assert.equal(
            sql,
            'exists (select 1 from "lancamentos" as "residual_ativo" where "residual_ativo"."lancamento_origem_id" = "lancamentos"."id"'
                + ' and "residual_ativo"."empresa_id" = "lancamentos"."empresa_id" and "residual_ativo"."status" <> \'cancelado\')',
        );
    });

    it("quitado: valor_quitado de pago, recebido e pago parcial", () => {
        const {sql} = dialect.sqlToQuery(quitadoSql);
        assert.match(sql, /in \('pago', 'recebido', 'pago_parcial'\) then coalesce\("lancamentos"\."valor_quitado", 0\)/);
    });
});

describe("Painel: vencidos e alertas incluem o restante do pago parcial", () => {
    const dialect = new PgDialect();
    it("WHERE: pendente, atrasado e pago parcial com saldo", () => {
        const {sql} = dialect.sqlToQuery(emAbertoNoPainelWhere);
        assert.match(sql, /in \('pendente', 'atrasado'\) or \("lancamentos"\."status" = 'pago_parcial' and \(case when exists \(.*"residual_ativo"\."status" <> 'cancelado'\) then 0 else greatest\(.*\) end\) > 0\)/s);
    });

    it("valor: líquido nos abertos, restante no pago parcial (0 com residual ativo)", () => {
        const {sql} = dialect.sqlToQuery(emAbertoLiquidoSql);
        assert.match(sql, /when "lancamentos"\."status" = 'pago_parcial' then \(case when exists \(.*\) then 0 else greatest\("lancamentos"\."valor_liquido".*- coalesce\("lancamentos"\."valor_quitado", 0\), 0\) end\) else "lancamentos"\."valor_liquido" end/s);
    });
});
