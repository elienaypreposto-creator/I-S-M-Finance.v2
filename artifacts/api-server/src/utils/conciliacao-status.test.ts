import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {conciliacaoFinalizada} from "./conciliacao-status";

describe("conciliacaoFinalizada: conciliado só depois do finalizar", () => {
    it("finalizada = status conciliado com data_conciliacao", () => {
        assert.equal(conciliacaoFinalizada({status: "conciliado", data_conciliacao: "2026-11-06"}), true);
    });

    it("legado: conciliado pelo resumo, sem data (nunca finalizado) continua aberto", () => {
        // Extrato #15 do clone: 55 linhas classificadas por regra na importação.
        assert.equal(conciliacaoFinalizada({status: "conciliado", data_conciliacao: null}), false);
    });

    it("pendente nunca é finalizada", () => {
        assert.equal(conciliacaoFinalizada({status: "pendente", data_conciliacao: null}), false);
        assert.equal(conciliacaoFinalizada({status: "pendente", data_conciliacao: "2026-11-06"}), false);
    });
});
