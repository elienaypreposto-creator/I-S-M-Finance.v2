import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {nivelDosRiscos, nivelSugeridoPorVencimento, riscosParaSalvar, type NiveisRisco} from "./riscos-lancamento";

const NIVEIS: NiveisRisco = {
    1: {label: "Nível 1 - Alerta", tags: ["Multas e Juros", "Perda de Desconto"]},
    2: {label: "Nível 2 - Risco Operacional", tags: ["Corte de Serviço"]},
    3: {label: "Nível 3 - Risco Jurídico", tags: ["Protesto"]},
};

describe("nivelSugeridoPorVencimento", () => {
    it("pelos dias de atraso", () => {
        assert.equal(nivelSugeridoPorVencimento("2026-11-07", "2026-11-07"), 0);
        assert.equal(nivelSugeridoPorVencimento("2026-11-10", "2026-11-07"), 0);
        assert.equal(nivelSugeridoPorVencimento("2026-11-06", "2026-11-07"), 1);
        assert.equal(nivelSugeridoPorVencimento("2026-10-23", "2026-11-07"), 1);
        assert.equal(nivelSugeridoPorVencimento("2026-10-22", "2026-11-07"), 2);
        assert.equal(nivelSugeridoPorVencimento("2026-09-08", "2026-11-07"), 3);
        assert.equal(nivelSugeridoPorVencimento("2026-09-01", "2026-11-07"), 4);
        assert.equal(nivelSugeridoPorVencimento("", "2026-11-07"), 0);
    });
});

describe("riscosParaSalvar", () => {
    it("nível sugerido sem tag marcada: grava o rótulo do nível (era gravado vazio)", () => {
        assert.deepEqual(riscosParaSalvar([], 1, NIVEIS), ["Nível 1 - Alerta"]);
    });

    it("com tags marcadas grava as tags", () => {
        assert.deepEqual(riscosParaSalvar(["Multas e Juros"], 1, NIVEIS), ["Multas e Juros"]);
        // Rótulo vindo do que estava salvo sai quando o usuário marca uma tag.
        assert.deepEqual(riscosParaSalvar(["Nível 1 - Alerta", "Perda de Desconto"], 1, NIVEIS), ["Perda de Desconto"]);
    });

    it("sem risco definido não grava nada", () => {
        assert.deepEqual(riscosParaSalvar([], 0, NIVEIS), []);
        assert.deepEqual(riscosParaSalvar(["Nível 1 - Alerta"], 0, NIVEIS), []);
    });
});

describe("nivelDosRiscos", () => {
    it("reabre no nível gravado (rótulo ou tags)", () => {
        assert.equal(nivelDosRiscos(["Nível 2 - Risco Operacional"], NIVEIS), 2);
        assert.equal(nivelDosRiscos(["Multas e Juros", "Protesto"], NIVEIS), 3);
        assert.equal(nivelDosRiscos(["outra"], NIVEIS), 0);
        assert.equal(nivelDosRiscos([], NIVEIS), 0);
        assert.equal(nivelDosRiscos(undefined, NIVEIS), 0);
    });
});
