import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {grupoDreDoLancamento, valorNaLinhaDreCents} from "./dre.js";

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
