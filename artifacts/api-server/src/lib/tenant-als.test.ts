import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {getTenantAlsStore} from "@workspace/db/tenant-als";

describe("ALS de tenant (ISMF-15)", () => {
    it("service chamado sem middleware não tem store — SET LOCAL ausente, RLS nega tudo", () => {
        assert.equal(getTenantAlsStore(), undefined);
    });
});
