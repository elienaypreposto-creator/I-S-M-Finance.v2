import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {formatarEixoMoeda as formatarComNbsp} from "./eixo-moeda.ts";

/** Compara com espaço comum; o primeiro teste confere que são não separáveis. */
const formatarEixoMoeda = (v: number) => formatarComNbsp(v).replace(/\u00a0/g, " ");

describe("formatarEixoMoeda", () => {
    it("não tem espaço comum (o Recharts quebraria o rótulo em duas linhas)", () => {
        assert.equal(formatarComNbsp(150_000).includes(" "), false);
        assert.equal(formatarComNbsp(150_000), "R$\u00a0150\u00a0mil");
    });

    it("usa vírgula decimal e sufixo em português", () => {
        assert.equal(formatarEixoMoeda(1_500_000), "R$ 1,5 mi");
        assert.equal(formatarEixoMoeda(2_000_000), "R$ 2 mi");
        assert.equal(formatarEixoMoeda(150_000), "R$ 150 mil");
        assert.equal(formatarEixoMoeda(1_000), "R$ 1 mil");
        assert.equal(formatarEixoMoeda(950), "R$ 950");
        assert.equal(formatarEixoMoeda(0), "R$ 0");
    });

    it("mantém o sinal de negativo junto do R$", () => {
        assert.equal(formatarEixoMoeda(-1_250_000), "-R$ 1,3 mi");
        assert.equal(formatarEixoMoeda(-20_000), "-R$ 20 mil");
    });

    it("milhares de milhões seguem em mi com separador de milhar", () => {
        assert.equal(formatarEixoMoeda(1_234_000_000), "R$ 1.234 mi");
    });
});
