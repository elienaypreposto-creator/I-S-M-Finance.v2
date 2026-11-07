import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {sql, type SQL} from "drizzle-orm";
import {PgDialect} from "drizzle-orm/pg-core";
import {grupoDreDoLancamento, sqlValorDreCaixa, valorNaLinhaDreCents} from "./dre.js";

describe("dre.ts — linha da DRE pelo plano de contas", () => {
    it("grupo explícito vence o tipo da conta", () => {
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CP", grupoDre: "deducao", tipoPlano: "despesa"}), "deducao");
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CR", grupoDre: "fora", tipoPlano: "receita"}), "fora");
    });

    it("sem grupo, segue o tipo da conta (não o texto da categoria)", () => {
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CP", grupoDre: null, tipoPlano: "custo"}), "custo");
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CP", tipoPlano: "Despesa"}), "despesa");
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CR", tipoPlano: "receita"}), "receita");
    });

    it("sem plano (ou grupo inválido), segue a natureza do título", () => {
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CR"}), "receita");
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CP", tipoPlano: null}), "despesa");
        assert.equal(grupoDreDoLancamento({tipoLancamento: "CP", grupoDre: "imposto", tipoPlano: "xyz"}), "despesa");
    });

    it("sinal: receita soma entradas; deduções/custos/despesas somam saídas", () => {
        assert.equal(valorNaLinhaDreCents("receita", "CR", 1000), 1000);
        assert.equal(valorNaLinhaDreCents("receita", "CP", 300), -300); // devolução de venda
        assert.equal(valorNaLinhaDreCents("despesa", "CP", 500), 500);
        assert.equal(valorNaLinhaDreCents("despesa", "CR", 200), -200); // estorno de despesa
        assert.equal(valorNaLinhaDreCents("deducao", "CP", 90), 90);
        assert.equal(valorNaLinhaDreCents("custo", "CP", 70), 70);
    });

    it("fora da DRE não soma em linha nenhuma", () => {
        assert.equal(valorNaLinhaDreCents("fora", "CR", 100000), 0);
        assert.equal(valorNaLinhaDreCents("fora", "CP", 100000), 0);
    });
});

describe("dre.ts — regime de caixa na mesma base do Fluxo de Caixa", () => {
    const render = (s: SQL) => new PgDialect().sqlToQuery(s).sql.replace(/\s+/g, " ").trim();

    it("valor do título = valor_quitado (ou valor) + retenções; juros não são descontados", () => {
        const texto = render(sqlValorDreCaixa(sql`0`));
        assert.equal(texto, 'COALESCE("lancamentos"."valor_quitado", "lancamentos"."valor") + 0');
        assert.doesNotMatch(texto, /juros|GREATEST/);
    });

    it("julho/2026 do clone: os dois R$ 9,00 de 16/07 entram e a DRE fecha com o Fluxo (−96.018,00)", () => {
        // Quitados de julho (sem transferências): id, plano (tipo), valor_quitado, juros gravado.
        const julho = [
            {id: 9, tipoPlano: null, quitado: 5_400_000, juros: 0},
            {id: 10, tipoPlano: null, quitado: 2_700_000, juros: 0},
            {id: 17, tipoPlano: "custo", quitado: 1_000_000, juros: 0},
            {id: 23, tipoPlano: null, quitado: 500_000, juros: 0},
            {id: 7, tipoPlano: null, quitado: 900, juros: 900}, // tarifa: juros = quitado (dado errado)
            {id: 8, tipoPlano: null, quitado: 900, juros: 0},
        ];
        const fluxo = -julho.reduce((s, l) => s + l.quitado, 0);
        const resultado = (valor: (l: (typeof julho)[number]) => number) =>
            -julho.reduce((s, l) => s + valorNaLinhaDreCents(grupoDreDoLancamento({tipoLancamento: "CP", tipoPlano: l.tipoPlano}), "CP", valor(l)), 0);
        assert.equal(fluxo, -9_601_800);
        assert.equal(resultado((l) => l.quitado), fluxo);
        // Regra antiga (quitado − juros): o título 7 virava zero e a DRE dava −96.009,00.
        assert.equal(resultado((l) => Math.max(l.quitado - l.juros, 0)), -9_600_900);
    });

    it("recebimento (CR) em conta de custo abate o custo: a linha (−) CUSTO fica positiva", () => {
        // Clone: CR de 900.000 (fev) e 100.000 (set) na conta de custo 34343.
        const cst = valorNaLinhaDreCents(grupoDreDoLancamento({tipoLancamento: "CR", tipoPlano: "custo"}), "CR", 90_000_000);
        assert.equal(cst, -90_000_000);
        assert.equal(-cst, 90_000_000); // linha 4 da DRE = −cst
    });
});
