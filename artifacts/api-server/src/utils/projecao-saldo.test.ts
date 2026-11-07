import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {projetarSaldoDiario} from "./projecao-saldo.js";

describe("projeção de saldo do Painel", () => {
    // Saldo geral do clone quando a divergência foi vista: R$ 68.721,47.
    const SALDO_GERAL = 6_872_147;

    it("primeiro ponto (hoje) é exatamente o saldo geral", () => {
        const {pontos} = projetarSaldoDiario(SALDO_GERAL, [{data: "2026-11-07", receber: "100.00", pagar: "40.00"}], "2026-11-07", 30);
        assert.equal(pontos[0]!.data, "2026-11-07");
        assert.equal(pontos[0]!.saldo, 68_721.47);
        // O que vence hoje aparece no dia e entra no saldo do ponto seguinte.
        assert.equal(pontos[0]!.receber, 100);
        assert.equal(pontos[0]!.pagar, 40);
        assert.equal(pontos[1]!.saldo, 68_781.47);
    });

    it("soma a receber e subtrai a pagar pelo vencimento, em centavos", () => {
        const {pontos, saldoFinalCents} = projetarSaldoDiario(
            1_000,
            [
                {data: "2026-11-09", receber: "0.10", pagar: "0"},
                {data: "2026-11-09", receber: "0.20", pagar: "0"}, // mesmo dia, duas linhas
                {data: "2026-11-10", receber: 0, pagar: "15.30"},
            ],
            "2026-11-08",
            3,
        );
        assert.deepEqual(
            pontos.map((p) => [p.data, p.saldo, p.receber, p.pagar]),
            [
                ["2026-11-08", 10, 0, 0],
                ["2026-11-09", 10, 0.3, 0],
                ["2026-11-10", 10.3, 0, 15.3],
                // Fecha a janela: saldo depois de tudo o que vence nela.
                ["2026-11-11", -5, 0, 0],
            ],
        );
        assert.equal(saldoFinalCents, -500);
    });

    it("vencimento fora da janela não entra; data como Date/timestamp vira o dia civil", () => {
        const {pontos, saldoFinalCents} = projetarSaldoDiario(
            0,
            [
                {data: "2026-12-31", receber: "999.00", pagar: 0},
                {data: "2026-11-08T00:00:00", receber: "5.00", pagar: 0},
            ],
            "2026-11-08",
            2,
        );
        assert.equal(pontos.length, 3);
        assert.equal(pontos[0]!.receber, 5);
        assert.equal(saldoFinalCents, 500);
    });

    it("virada de mês sem pular nem repetir dia", () => {
        const {pontos} = projetarSaldoDiario(0, [], "2026-11-29", 3);
        assert.deepEqual(pontos.map((p) => p.data), ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    });
});
