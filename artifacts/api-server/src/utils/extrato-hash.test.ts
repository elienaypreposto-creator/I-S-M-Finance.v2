import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {hashLinhaExtrato} from "./extrato-hash.js";

describe("hash_linha DEF-02", () => {
    it("mesmo conteúdo em recortes diferentes gera o mesmo hash (ordinal fixo)", () => {
        const a = hashLinhaExtrato({
            contaId: 1,
            data: "2026-07-15",
            tipo: "debito",
            valor: "8000.00",
            descricao: "DEBITO PIX",
            ordinalNoGrupo: 0,
        });
        const b = hashLinhaExtrato({
            contaId: 1,
            data: "2026-07-15",
            tipo: "debito",
            valor: "8000.00",
            descricao: "DEBITO PIX",
            ordinalNoGrupo: 0,
        });
        assert.equal(a, b);
        assert.equal(a.length, 64);
    });

    it("duas linhas idênticas no mesmo dia distinguem-se pelo ordinal", () => {
        const a = hashLinhaExtrato({
            contaId: 1,
            data: "2026-07-15",
            tipo: "debito",
            valor: "9.00",
            descricao: "TARIFA",
            ordinalNoGrupo: 0,
        });
        const b = hashLinhaExtrato({
            contaId: 1,
            data: "2026-07-15",
            tipo: "debito",
            valor: "9.00",
            descricao: "TARIFA",
            ordinalNoGrupo: 1,
        });
        assert.notEqual(a, b);
    });
});
