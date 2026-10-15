// Rodar com fusos diferentes:
//   TZ=America/Sao_Paulo tsx --test src/lib/datas.test.ts
//   TZ=UTC tsx --test src/lib/datas.test.ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {dataCivilIso, formatarData, hojeIsoLocal, parseDataCivil} from "./datas.ts";

describe("formatarData", () => {
    it("data civil não desloca pelo fuso", () => {
        assert.equal(formatarData("2026-10-22"), "22/10/2026");
        assert.equal(formatarData("2026-01-01"), "01/01/2026");
        assert.equal(formatarData("2026-12-31"), "31/12/2026");
    });

    it("timestamp com hora é exibido no fuso local", () => {
        const iso = "2026-10-22T02:30:00.000Z";
        const esperado = new Intl.DateTimeFormat("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric"})
            .format(new Date(iso));
        assert.equal(formatarData(iso), esperado);
        if (process.env.TZ === "America/Sao_Paulo") assert.equal(formatarData(iso), "21/10/2026");
        if (process.env.TZ === "UTC") assert.equal(formatarData(iso), "22/10/2026");
    });

    it("timestamp sem Z (hora local) mantém o dia", () => {
        assert.equal(formatarData("2026-10-22T10:00:00"), "22/10/2026");
    });

    it("vazio e inválido", () => {
        assert.equal(formatarData(null), "-");
        assert.equal(formatarData(""), "-");
        assert.equal(formatarData(undefined, "—"), "—");
        assert.equal(formatarData("abc"), "abc");
    });

    it("aceita Date", () => {
        assert.equal(formatarData(new Date(2026, 9, 22)), "22/10/2026");
    });
});

describe("parseDataCivil / dataCivilIso / hojeIsoLocal", () => {
    it("monta meia-noite local e volta para o mesmo dia", () => {
        const d = parseDataCivil("2026-10-01");
        assert.ok(d);
        assert.equal(d.getDate(), 1);
        assert.equal(d.getMonth(), 9);
        assert.equal(d.getFullYear(), 2026);
        assert.equal(dataCivilIso(d), "2026-10-01");
    });

    it("rejeita data inexistente e texto com hora", () => {
        assert.equal(parseDataCivil("2026-02-30"), null);
        assert.equal(parseDataCivil("2026-10-22T00:00:00Z"), null);
        assert.equal(parseDataCivil(null), null);
    });

    it("hoje usa o calendário local", () => {
        const agora = new Date();
        assert.equal(hojeIsoLocal(), dataCivilIso(agora));
        assert.match(hojeIsoLocal(), /^\d{4}-\d{2}-\d{2}$/);
    });
});
