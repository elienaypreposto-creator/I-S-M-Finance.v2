import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {rotuloStatus} from "./status-label.ts";

describe("rotuloStatus", () => {
    it("transforma o status cru da API em rótulo legível", () => {
        assert.equal(rotuloStatus("pago_parcial"), "Pago parcial");
        assert.equal(rotuloStatus("PAGO_PARCIAL"), "Pago parcial");
        assert.equal(rotuloStatus("PAGO"), "Pago");
        assert.equal(rotuloStatus("recebido"), "Recebido");
        assert.equal(rotuloStatus("pendente"), "Pendente");
    });

    it("status vazio vira traço", () => {
        assert.equal(rotuloStatus(""), "-");
        assert.equal(rotuloStatus(null), "-");
        assert.equal(rotuloStatus(undefined), "-");
    });
});

describe("rotuloStatus com o tipo do título", () => {
    it("parcial de conta a receber é Recebido parcial", () => {
        assert.equal(rotuloStatus("pago_parcial", "CR"), "Recebido parcial");
        assert.equal(rotuloStatus("pago_parcial", "CP"), "Pago parcial");
        assert.equal(rotuloStatus("pago_parcial", null), "Pago parcial");
        assert.equal(rotuloStatus("recebido", "CR"), "Recebido");
    });
});
