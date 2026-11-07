import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {acharNomeDuplicado, limparNome, normalizarNome, ordenarPorNome} from "./nomes.ts";

describe("nomes — comparação de cadastro", () => {
    it("limparNome tira espaços das pontas e junta os repetidos", () => {
        assert.equal(limparNome("  Filial   Centro "), "Filial Centro");
        assert.equal(limparNome(undefined), "");
    });

    it("normalizarNome ignora caixa, acento e espaços nas pontas", () => {
        assert.equal(normalizarNome("  SAÚDE "), "saude");
        assert.equal(normalizarNome("Recursos  Humanos"), normalizarNome("recursos humanos"));
    });

    it("acharNomeDuplicado ignora o próprio registro", () => {
        const itens = [{id: 1, nome: "Financeiro"}, {id: 2, nome: "Operações"}];
        assert.equal(acharNomeDuplicado(itens, " FINANCEIRO")?.id, 1);
        assert.equal(acharNomeDuplicado(itens, "operacoes")?.id, 2);
        assert.equal(acharNomeDuplicado(itens, "Financeiro", 1), undefined);
        assert.equal(acharNomeDuplicado(itens, "Marketing"), undefined);
    });

    it("ordenarPorNome ordena em pt-BR sem diferenciar caixa nem acento", () => {
        const nomes = ordenarPorNome([{nome: "zeta"}, {nome: "Água"}, {nome: "beta"}, {nome: "Filial 10"}, {nome: "Filial 2"}])
            .map((f) => f.nome);
        assert.deepEqual(nomes, ["Água", "beta", "Filial 2", "Filial 10", "zeta"]);
    });
});
