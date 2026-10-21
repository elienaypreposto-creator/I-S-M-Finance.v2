import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {hojeIsoLocal, somarDiasIso} from "./date-civil";

describe("hojeIsoLocal", () => {
    it("depois das 21h em São Paulo ainda é o mesmo dia (UTC já virou)", () => {
        assert.equal(hojeIsoLocal(new Date("2026-10-23T01:30:00Z")), "2026-10-22");
    });

    it("de manhã coincide com o dia UTC", () => {
        assert.equal(hojeIsoLocal(new Date("2026-10-22T12:00:00Z")), "2026-10-22");
    });
});

describe("somarDiasIso", () => {
    it("soma dias atravessando mês e ano", () => {
        assert.equal(somarDiasIso("2026-10-22", 7), "2026-10-29");
        assert.equal(somarDiasIso("2026-12-28", 7), "2027-01-04");
        assert.equal(somarDiasIso("2026-03-01", -1), "2026-02-28");
    });
});
