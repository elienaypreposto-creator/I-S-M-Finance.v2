import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {scrollTopParaCentralizar} from "./rolar-ate-elemento";

describe("scrollTopParaCentralizar", () => {
    const base = {scrollTop: 0, scrollHeight: 2000, clientHeight: 400, conteinerTop: 100, elementoAltura: 40};

    it("centraliza a linha dentro do contêiner", () => {
        // Linha no conteúdo em 1000 (= 1100 na tela − 100 do contêiner): topo = 1000 − (400 − 40)/2.
        assert.equal(scrollTopParaCentralizar({...base, elementoTop: 1100}), 820);
    });

    it("considera o quanto o contêiner já rolou", () => {
        assert.equal(scrollTopParaCentralizar({...base, scrollTop: 500, elementoTop: 600}), 820);
    });

    it("não passa do começo nem do fim do conteúdo", () => {
        assert.equal(scrollTopParaCentralizar({...base, elementoTop: 120}), 0);
        assert.equal(scrollTopParaCentralizar({...base, elementoTop: 2050}), 1600);
    });
});
