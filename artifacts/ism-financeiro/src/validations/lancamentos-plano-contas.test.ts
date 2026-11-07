import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {naturezaCombinaComTipo, planoContasDoTipo} from "./lancamentos.schema.ts";

const plano = [
    {id: 1, tipo: "receita", categoria: "Receitas", subcategoria: "Serviços"},
    {id: 2, tipo: "despesa", categoria: "Despesas", subcategoria: "Alimentação"},
    {id: 3, tipo: "custo", categoria: "Custos", subcategoria: "Insumos"},
    {id: 4, categoria: "Sem natureza", subcategoria: null},
];

describe("plano de contas filtrado pelo tipo do lançamento", () => {
    it("a receber mostra receita; a pagar mostra custo e despesa", () => {
        assert.deepEqual(planoContasDoTipo(plano, "CR", []).map((p) => p.id), [1, 4]);
        assert.deepEqual(planoContasDoTipo(plano, "CP", []).map((p) => p.id), [2, 3, 4]);
    });

    it("QA: Alimentação (despesa) não aparece num CR, salvo se já for a categoria do título", () => {
        assert.ok(!planoContasDoTipo(plano, "CR", [""]).some((p) => p.id === 2));
        assert.deepEqual(planoContasDoTipo(plano, "CR", ["2"]).map((p) => p.id), [1, 2, 4]);
        assert.deepEqual(planoContasDoTipo(plano, "CR", [null, 2]).map((p) => p.id), [1, 2, 4]);
    });

    it("naturezaCombinaComTipo ignora caixa e aceita plano sem natureza", () => {
        assert.equal(naturezaCombinaComTipo("Receita", "CR"), true);
        assert.equal(naturezaCombinaComTipo("DESPESA", "CR"), false);
        assert.equal(naturezaCombinaComTipo(undefined, "CP"), true);
        assert.equal(naturezaCombinaComTipo("receita", "CP"), false);
    });
});
