// Rodar com fusos diferentes:
//   TZ=America/Sao_Paulo tsx --test src/lib/datas.test.ts
//   TZ=UTC tsx --test src/lib/datas.test.ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {dataCivilIso, formatarData, formatarDiaMes, hojeIsoLocal, intervaloEixoDias, parseDataCivil} from "./datas.ts";

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

describe("eixo de gráfico por dia", () => {
    it("formatarDiaMes: dd/mm", () => {
        assert.equal(formatarDiaMes("2026-11-07"), "07/11");
        assert.equal(formatarDiaMes("2026-12-31T00:00:00Z"), "31/12");
        assert.equal(formatarDiaMes("abc"), "abc");
    });

    it("intervaloEixoDias: no máximo N rótulos a partir do 1º dia, espaçamento fixo", () => {
        assert.equal(intervaloEixoDias(5), 0);
        assert.equal(intervaloEixoDias(8), 0);
        // 30 dias, até 8 rótulos: a cada 5 dias (índices 0, 5, …, 25).
        assert.equal(intervaloEixoDias(30), 4);
        for (const n of [9, 15, 30, 31, 60, 365]) {
            const passo = intervaloEixoDias(n) + 1;
            assert.ok(Math.ceil(n / passo) <= 8, `${n} pontos geram rótulos demais`);
        }
    });
});
