import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {acharNomeDuplicado, limparNome, normalizarNome} from "./nomes.js";

describe("nomes.ts — comparação de nomes de cadastro", () => {
    it("limparNome tira espaços das pontas e junta os repetidos", () => {
        assert.equal(limparNome("  Filial   Centro  "), "Filial Centro");
        assert.equal(limparNome(null), "");
        assert.equal(limparNome("   "), "");
    });

    it("normalizarNome ignora caixa, acento e espaços", () => {
        assert.equal(normalizarNome("  SAÚDE  "), "saude");
        assert.equal(normalizarNome("Saúde"), normalizarNome("saude"));
        assert.equal(normalizarNome("Recursos  Humanos"), normalizarNome("recursos humanos "));
        assert.notEqual(normalizarNome("Comercial"), normalizarNome("Comercial 2"));
    });

    it("acharNomeDuplicado acha o igual e ignora o próprio registro", () => {
        const itens = [{id: 1, nome: "Financeiro"}, {id: 2, nome: "Operações"}];
        assert.equal(acharNomeDuplicado(itens, "financeiro")?.id, 1);
        assert.equal(acharNomeDuplicado(itens, " OPERACOES ")?.id, 2);
        assert.equal(acharNomeDuplicado(itens, "FINANCEIRO", 1), undefined);
        assert.equal(acharNomeDuplicado(itens, "Marketing"), undefined);
    });
});
