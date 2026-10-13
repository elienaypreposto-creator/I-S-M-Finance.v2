import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {prefixoDescricaoLista, rotuloTipoDocumento} from "./lancamento-documento.ts";
import {classeSaldo} from "./saldo.ts";

describe("prefixoDescricaoLista", () => {
    it("junta tipo abreviado, número e descrição", () => {
        assert.equal(
            prefixoDescricaoLista("nota_fiscal", "12345", "Manutenção servidor AWS"),
            "NF 12345 · Manutenção servidor AWS",
        );
    });

    it("mostra só a descrição quando não há documento", () => {
        assert.equal(prefixoDescricaoLista(null, null, "Aluguel"), "Aluguel");
    });

    it("mostra o prefixo sem descrição", () => {
        assert.equal(prefixoDescricaoLista("boleto", "99", "  "), "BOL 99");
    });
});

describe("rotuloTipoDocumento", () => {
    it("devolve o rótulo da guia de imposto", () => {
        assert.equal(rotuloTipoDocumento("guia_imposto"), "Guia de imposto");
    });
});

describe("classeSaldo", () => {
    it("verde, vermelho e neutro", () => {
        assert.equal(classeSaldo(1), "text-emerald-400");
        assert.equal(classeSaldo(-1), "text-red-400");
        assert.equal(classeSaldo(0), "text-muted-foreground");
    });
});
