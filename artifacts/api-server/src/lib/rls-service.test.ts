import assert from "node:assert/strict";
import {describe, it} from "node:test";

/** Service sem SET LOCAL deve devolver vazio. Requer migrate 0013+ e ISM_RLS_TEST=1. */
describe("RLS: service sem middleware", () => {
    it("list de lançamentos sem SET LOCAL devolve vazio", async (t) => {
        if (process.env.ISM_RLS_TEST !== "1" || !process.env.DATABASE_URL) {
            t.skip("defina ISM_RLS_TEST=1 e DATABASE_URL após db:migrate 0013");
            return;
        }

        const {lancamentosService} = await import("../domains/financial/lancamentos/lancamentos.service");
        const {closeDbPools} = await import("@workspace/db");
        try {
            const result = await lancamentosService.list(1, {page: 1, limit: 20});
            assert.equal(result.items.length, 0);
            assert.equal(Number(result.meta.total), 0);
        } finally {
            await closeDbPools();
        }
    });
});
