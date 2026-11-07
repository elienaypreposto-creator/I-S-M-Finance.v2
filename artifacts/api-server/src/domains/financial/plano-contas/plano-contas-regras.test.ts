import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {acharPlanoDuplicado, categoriaExistente, grupoDreCompativel} from "./plano-contas-regras.js";

describe("plano-contas-regras — coerência tipo × linha da DRE", () => {
    it("sem linha da DRE (segue o tipo) é sempre coerente", () => {
        assert.equal(grupoDreCompativel("receita", null), true);
        assert.equal(grupoDreCompativel("despesa", ""), true);
    });

    it("receita só entra em Receita bruta ou fora da DRE", () => {
        assert.equal(grupoDreCompativel("receita", "receita"), true);
        assert.equal(grupoDreCompativel("receita", "fora"), true);
        assert.equal(grupoDreCompativel("receita", "despesa"), false);
        assert.equal(grupoDreCompativel("receita", "custo"), false);
        assert.equal(grupoDreCompativel("receita", "deducao"), false);
    });

    it("custo e despesa não entram em Receita bruta", () => {
        for (const tipo of ["custo", "despesa", "Despesa"]) {
            assert.equal(grupoDreCompativel(tipo, "receita"), false);
            for (const grupo of ["deducao", "custo", "despesa", "fora"]) {
                assert.equal(grupoDreCompativel(tipo, grupo), true, `${tipo} → ${grupo}`);
            }
        }
    });
});

describe("plano-contas-regras — conta duplicada", () => {
    const contas = [
        {id: 1, tipo: "despesa", categoria: "Administrativas", subcategoria: "Aluguel"},
        {id: 2, tipo: "despesa", categoria: "Administrativas", subcategoria: "Energia"},
        {id: 3, tipo: "despesa", categoria: "Saúde", subcategoria: null},
        {id: 4, tipo: "receita", categoria: "Serviços", subcategoria: "Consultoria"},
    ];

    it("editar um item de grupo com várias subcategorias não acusa os irmãos", () => {
        const alvo = {id: 1, tipo: "despesa", categoria: "Administrativas", subcategoria: "Aluguel"};
        assert.equal(acharPlanoDuplicado(contas, alvo), undefined);
    });

    it("subcategoria nova no mesmo grupo é permitida", () => {
        const alvo = {tipo: "despesa", categoria: "administrativas", subcategoria: "Internet"};
        assert.equal(acharPlanoDuplicado(contas, alvo), undefined);
    });

    it("duplicata ignora caixa, acento e espaços nas pontas", () => {
        assert.equal(
            acharPlanoDuplicado(contas, {tipo: "despesa", categoria: "  ADMINISTRATIVAS ", subcategoria: "aluguel "})?.id,
            1,
        );
        assert.equal(acharPlanoDuplicado(contas, {tipo: "despesa", categoria: "saude", subcategoria: ""})?.id, 3);
        assert.equal(acharPlanoDuplicado(contas, {tipo: "receita", categoria: "servicos", subcategoria: "CONSULTORIA"})?.id, 4);
    });

    it("renomear para o nome de um irmão é duplicata", () => {
        const alvo = {id: 2, tipo: "despesa", categoria: "Administrativas", subcategoria: "aluguel"};
        assert.equal(acharPlanoDuplicado(contas, alvo)?.id, 1);
    });

    it("mesmo nome em outro tipo não é duplicata", () => {
        assert.equal(acharPlanoDuplicado(contas, {tipo: "custo", categoria: "Saúde", subcategoria: null}), undefined);
    });

    it("categoriaExistente devolve a grafia já cadastrada no mesmo tipo", () => {
        assert.equal(categoriaExistente(contas, "despesa", "SAUDE "), "Saúde");
        assert.equal(categoriaExistente(contas, "custo", "Saúde"), undefined);
    });
});
