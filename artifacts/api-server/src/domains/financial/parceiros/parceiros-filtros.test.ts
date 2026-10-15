import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {PgDialect} from "drizzle-orm/pg-core";
import {listParceirosQuerySchema} from "./schemas";
import {montarWhereParceiros} from "./parceiros.filtros";
import {parseCsvPermitido} from "../../../utils/filtro-csv";

const dialect = new PgDialect();
const compilar = (q: Record<string, string>) =>
    dialect.sqlToQuery(montarWhereParceiros(5, listParceirosQuerySchema.parse(q)));

describe("listParceirosQuerySchema (ISMF-33)", () => {
    it("aceita tipo e tipo_pessoa", () => {
        const q = listParceirosQuerySchema.parse({tipo: "Fornecedor", tipo_pessoa: "PJ", status: "inativo"});
        assert.equal(q.tipo, "Fornecedor");
        assert.equal(q.tipo_pessoa, "PJ");
        assert.equal(q.status, "inativo");
    });

    it("rejeita pessoa e status fora do enum", () => {
        assert.throws(() => listParceirosQuerySchema.parse({tipo_pessoa: "XX"}));
        assert.throws(() => listParceirosQuerySchema.parse({status: "bloqueado"}));
    });
});

describe("montarWhereParceiros (ISMF-33)", () => {
    it("sem filtros fica só o escopo da empresa", () => {
        const {sql, params} = compilar({});
        assert.match(sql, /"parceiros"\."empresa_id" = \$1/);
        assert.deepEqual(params, [5]);
    });

    it("busca por nome ou pelos dígitos do CPF/CNPJ", () => {
        const {sql, params} = compilar({search: "12.345.678/0001"});
        assert.match(sql, /"parceiros"\."nome" ilike \$2/);
        assert.match(sql, /regexp_replace\(coalesce\("parceiros"\."cpf_cnpj", ''\), '\\D', '', 'g'\) like \$3/);
        assert.deepEqual(params, [5, "%12.345.678/0001%", "%123456780001%"]);
    });

    it("busca só de texto não compara CPF/CNPJ", () => {
        const {sql, params} = compilar({search: "Acme"});
        assert.doesNotMatch(sql, /regexp_replace/);
        assert.deepEqual(params, [5, "%Acme%"]);
    });

    it("status inativo casa só inativos; ativo casa o resto", () => {
        assert.match(compilar({status: "inativo"}).sql, /"parceiros"\."status" = \$2/);
        assert.match(compilar({status: "ativo"}).sql, /"parceiros"\."status" <> \$2/);
    });

    it("tipo usa contém no jsonb e pessoa compara tipo_pessoa", () => {
        const {sql, params} = compilar({tipo: "Fornecedor", tipo_pessoa: "PF"});
        assert.match(sql, /"parceiros"\."tipos" @> \$2::jsonb/);
        assert.match(sql, /"parceiros"\."tipo_pessoa" = \$3/);
        assert.deepEqual(params, [5, '["Fornecedor"]', "PF"]);
    });
});

describe("parseCsvPermitido", () => {
    const permitidos = ["pendente", "parcial", "conciliado"] as const;

    it("devolve a lista sem repetição", () => {
        assert.deepEqual(parseCsvPermitido("pendente, parcial,pendente", permitidos), ["pendente", "parcial"]);
    });

    it("ausente ou vazio não filtra", () => {
        assert.equal(parseCsvPermitido(undefined, permitidos), undefined);
        assert.equal(parseCsvPermitido(" , ", permitidos), undefined);
    });

    it("valor fora da lista ou formato inválido devolve null", () => {
        assert.equal(parseCsvPermitido("pendente,finalizado", permitidos), null);
        assert.equal(parseCsvPermitido(["pendente"], permitidos), null);
    });
});
