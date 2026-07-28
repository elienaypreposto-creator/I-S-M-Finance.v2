import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    centsToDecimalString,
    diferencaConciliacaoCents,
    fromCents,
    realizadoSemJurosCents,
    sumCents,
    toCents,
} from "./money.js";

describe("money.ts — DEF-06 centavos inteiros", () => {
    it("toCents / fromCents: round-trip estável", () => {
        assert.equal(toCents("10.00"), 1000);
        assert.equal(toCents(10), 1000);
        assert.equal(toCents("0.01"), 1);
        assert.equal(fromCents(1000), 10);
        assert.equal(fromCents(1), 0.01);
        assert.equal(fromCents(toCents("1234.56")), 1234.56);
    });

    it("evita o clássico 0.1 + 0.2 !== 0.3", () => {
        const total = sumCents([toCents(0.1), toCents(0.2)]);
        assert.equal(total, 30);
        assert.equal(fromCents(total), 0.3);
        assert.equal(centsToDecimalString(total), "0.30");
    });

    it("sumCents acumula dezenas de valores sem erro de 2 centavos", () => {
        const valores = Array.from({length: 50}, () => "0.10");
        const total = sumCents(valores.map(toCents));
        assert.equal(total, 500);
        assert.equal(centsToDecimalString(total), "5.00");
    });

    it("centsToDecimalString formata com 2 casas", () => {
        assert.equal(centsToDecimalString(0), "0.00");
        assert.equal(centsToDecimalString(1162), "11.62");
        assert.equal(centsToDecimalString(200000), "2000.00");
        assert.equal(centsToDecimalString(-144795), "-1447.95");
    });
});

/**
 * Tabela-verdade §3.3 + sintomas DEF-01.
 * Diferença unificada: Σ(extrato) − Σ(lançamentos).
 * >0 EXCEDENTE → juros/multa; <0 FALTA → residual; =0 EXATO.
 */
describe("tabela-verdade §3.3", () => {
    it("caso 1: extrato 8.000 × lançamento 10.000 → falta 2.000 (residual)", () => {
        const delta = diferencaConciliacaoCents(toCents(8000), toCents(10000));
        assert.equal(delta, -200000);
        assert.ok(delta < 0);
        assert.equal(centsToDecimalString(-delta), "2000.00");
    });

    it("caso 2: extrato 8.000 × lançamento 6.838 → excedente 1.162 (juros)", () => {
        const delta = diferencaConciliacaoCents(toCents(8000), toCents(6838));
        assert.equal(delta, 116200);
        assert.ok(delta > 0);
        assert.equal(centsToDecimalString(delta), "1162.00");
    });

    it("caso 3 Modo B: lançamento 4.000 × 5 linhas × 1.000 → excedente 1.000 (juros)", () => {
        const somaExtrato = sumCents([1000, 1000, 1000, 1000, 1000].map(toCents));
        const delta = diferencaConciliacaoCents(somaExtrato, toCents(4000));
        assert.equal(delta, 100000);
        assert.ok(delta > 0);
        assert.equal(centsToDecimalString(delta), "1000.00");
    });

    it("caso 4: extrato 8.000 × lançamento 10.000 → residual 2.000 (obs. pagamento parcial)", () => {
        const delta = diferencaConciliacaoCents(toCents(8000), toCents(10000));
        assert.equal(delta, -200000);
        assert.ok(delta < 0);
    });

    it("caso 5: extrato 8.000 × 3 lançamentos = 6.552,05 → Δ=+1.447,95 (excedente / gap de cobertura)", () => {
        const somaLancamentos = toCents("6552.05");
        const delta = diferencaConciliacaoCents(toCents(8000), somaLancamentos);
        assert.equal(delta, 144795);
        assert.ok(delta > 0);
        assert.equal(centsToDecimalString(delta), "1447.95");
    });
});

/**
 * Card 62 / RN-G5 / FEAT-10 — juros fora do resultado da meta.
 * valor_quitado embute juros; realizado operacional = quitado − juros.
 */
describe("realizadoSemJurosCents — Card 62 / RN-G5", () => {
    it("6838 + juros 1162 (quitado 8000) → realizado 6838, juros 1162", () => {
        const quitado = toCents(8000);
        const juros = toCents(1162);
        const realizado = realizadoSemJurosCents(quitado, juros);
        assert.equal(realizado, toCents(6838));
        assert.equal(fromCents(realizado), 6838);
        assert.notEqual(realizado, quitado);
    });

    it("previsto 10000 / realizado 8000 (sem juros) → 80%", () => {
        const projetado = toCents(10000);
        const realizado = realizadoSemJurosCents(toCents(8000), toCents(0));
        const pct = Math.round((fromCents(realizado) / fromCents(projetado)) * 10000) / 100;
        assert.equal(pct, 80);
    });

    it("parcela 100k + juros 10k ≠ 110k no resultado", () => {
        const realizado = realizadoSemJurosCents(toCents(110000), toCents(10000));
        assert.equal(realizado, toCents(100000));
        assert.equal(fromCents(realizado), 100000);
    });
});
