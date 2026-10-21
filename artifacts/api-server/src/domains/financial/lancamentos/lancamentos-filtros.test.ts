import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {PgDialect} from "drizzle-orm/pg-core";
import {exportLancamentosQuerySchema, listLancamentosQuerySchema} from "./schemas";
import {escaparLike, montarWhereLancamentos} from "./lancamentos.filtros";

const dialect = new PgDialect();
const compilar = (filtros: Parameters<typeof montarWhereLancamentos>[1]) =>
    dialect.sqlToQuery(montarWhereLancamentos(7, filtros));

describe("listLancamentosQuerySchema (ISMF-32)", () => {
    it("aceita status em CSV, sem repetição e validado no enum", () => {
        const q = listLancamentosQuerySchema.parse({status: "pendente, atrasado,pendente"});
        assert.deepEqual(q.status, ["pendente", "atrasado"]);
    });

    it("continua aceitando um status só (chamadas antigas)", () => {
        assert.deepEqual(listLancamentosQuerySchema.parse({status: "pago"}).status, ["pago"]);
    });

    it("rejeita status fora do enum", () => {
        assert.throws(() => listLancamentosQuerySchema.parse({status: "pendente,quitado"}));
    });

    it("converte faixa de valor e ids novos", () => {
        const q = listLancamentosQuerySchema.parse({
            valor_min: "100.5",
            valor_max: "200",
            plano_conta_id: "3",
            departamento_id: "4",
            centro_custo_id: "5",
        });
        assert.equal(q.valor_min, 100.5);
        assert.equal(q.valor_max, 200);
        assert.equal(q.plano_conta_id, 3);
        assert.equal(q.departamento_id, 4);
        assert.equal(q.centro_custo_id, 5);
    });

    it("rejeita faixa invertida (mín > máx) e valor negativo", () => {
        assert.throws(() => listLancamentosQuerySchema.parse({valor_min: "500", valor_max: "100"}), /valor_min/);
        assert.throws(() => listLancamentosQuerySchema.parse({valor_min: "-1"}));
    });

    it("aceita faixa com mín = máx", () => {
        const q = listLancamentosQuerySchema.parse({valor_min: "100", valor_max: "100"});
        assert.equal(q.valor_min, 100);
    });

    it("rejeita ids não positivos", () => {
        assert.throws(() => listLancamentosQuerySchema.parse({departamento_id: "0"}));
        assert.throws(() => listLancamentosQuerySchema.parse({plano_conta_id: "abc"}));
    });

    it("mantém o teto de 200 por página na listagem", () => {
        assert.throws(() => listLancamentosQuerySchema.parse({limit: "5000"}));
    });

    it("export ignora paginação e valida a mesma faixa", () => {
        const q = exportLancamentosQuerySchema.parse({limit: "5000", page: "9", status: "atrasado"});
        assert.deepEqual(q, {status: ["atrasado"]});
        assert.throws(() => exportLancamentosQuerySchema.parse({valor_min: "9", valor_max: "1"}));
    });
});

describe("montarWhereLancamentos (ISMF-32)", () => {
    it("sem filtros fica só o escopo da empresa", () => {
        const {sql, params} = compilar({});
        assert.match(sql, /"lancamentos"\."empresa_id" = \$1/);
        assert.deepEqual(params, [7]);
    });

    it("combina status (IN), faixa de valor de face, ids, tipo, período e busca", () => {
        const {sql, params} = compilar({
            tipo: "CP",
            status: ["pendente", "atrasado"],
            conta_id: 1,
            parceiro_id: 2,
            plano_conta_id: 3,
            departamento_id: 4,
            centro_custo_id: 5,
            valor_min: 10,
            valor_max: 99.9,
            data_inicio: "2026-10-01",
            data_fim: "2026-10-31",
            search: "acme",
        });
        assert.match(sql, /"lancamentos"\."status" in \(\$\d+, \$\d+\)/);
        assert.match(sql, /"lancamentos"\."valor" >= \$\d+/);
        assert.match(sql, /"lancamentos"\."valor" <= \$\d+/);
        for (const col of ["conta_id", "parceiro_id", "plano_conta_id", "departamento_id", "centro_custo_id"]) {
            assert.match(sql, new RegExp(`"lancamentos"\\."${col}" = \\$\\d+`), col);
        }
        assert.match(sql, /"lancamentos"\."vencimento" >= \$\d+/);
        assert.match(sql, /"lancamentos"\."vencimento" <= \$\d+/);
        assert.deepEqual(params.slice(0, 3), [7, "CP", "pendente"]);
        assert.ok(params.includes("10") && params.includes("99.9"), "valores vão como texto numérico");
    });

    it("a busca procura na descrição, no nº do documento e no nome do parceiro", () => {
        const {sql, params} = compilar({search: "Acme"});
        assert.match(sql, /"lancamentos"\."descricao" ilike \$2/);
        assert.match(sql, /"lancamentos"\."numero_documento" ilike \$3/);
        assert.match(sql, /"parceiros"\."nome" ilike \$4/);
        assert.deepEqual(params, [7, "%Acme%", "%Acme%", "%Acme%"]);
    });

    it("status vazio não restringe", () => {
        assert.doesNotMatch(compilar({status: []}).sql, /status/);
    });
});

describe("escaparLike", () => {
    it("escapa %, _ e barra invertida", () => {
        assert.equal(escaparLike("50%_a\\b"), "50\\%\\_a\\\\b");
        assert.equal(escaparLike("normal"), "normal");
    });
});
