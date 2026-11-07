import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {acharPlanoDuplicado, categoriaExistente, grupoDreCompativel, GRUPOS_DRE_POR_TIPO} from "./plano-contas-regras.ts";

describe("plano de contas — coerência tipo × linha da DRE", () => {
    it("receita não pode ir para despesa, custo ou dedução", () => {
        assert.equal(grupoDreCompativel("receita", "despesa"), false);
        assert.equal(grupoDreCompativel("receita", "custo"), false);
        assert.equal(grupoDreCompativel("receita", "deducao"), false);
        assert.equal(grupoDreCompativel("receita", "receita"), true);
        assert.equal(grupoDreCompativel("receita", "fora"), true);
    });

    it("custo e despesa não podem ir para Receita bruta", () => {
        assert.equal(grupoDreCompativel("despesa", "receita"), false);
        assert.equal(grupoDreCompativel("custo", "receita"), false);
        assert.equal(grupoDreCompativel("despesa", "deducao"), true);
    });

    it("vazio (segue o tipo) é sempre aceito", () => {
        for (const tipo of Object.keys(GRUPOS_DRE_POR_TIPO)) assert.equal(grupoDreCompativel(tipo, ""), true);
    });
});

describe("plano de contas — duplicata", () => {
    const contas = [
        {id: 1, tipo: "despesa", categoria: "Administrativas", subcategoria: "Aluguel"},
        {id: 2, tipo: "despesa", categoria: "Administrativas", subcategoria: "Energia"},
        {id: 3, tipo: "despesa", categoria: "Saúde", subcategoria: null},
    ];

    it("editar item de grupo com 2+ subcategorias sem mudar nada não é duplicata", () => {
        assert.equal(acharPlanoDuplicado(contas, contas[0]), undefined);
        assert.equal(acharPlanoDuplicado(contas, {...contas[1], subcategoria: "Energia elétrica"}), undefined);
    });

    it("mesma categoria + subcategoria (caixa/acento/espaços) é duplicata", () => {
        assert.equal(acharPlanoDuplicado(contas, {tipo: "despesa", categoria: " administrativas", subcategoria: "ALUGUEL "})?.id, 1);
        assert.equal(acharPlanoDuplicado(contas, {tipo: "despesa", categoria: "saude", subcategoria: ""})?.id, 3);
        assert.equal(acharPlanoDuplicado(contas, {id: 2, tipo: "despesa", categoria: "Administrativas", subcategoria: "aluguel"})?.id, 1);
    });

    it("categoriaExistente devolve a grafia já cadastrada", () => {
        assert.equal(categoriaExistente(contas, "despesa", "SAUDE"), "Saúde");
        assert.equal(categoriaExistente(contas, "custo", "Saúde"), undefined);
    });
});
