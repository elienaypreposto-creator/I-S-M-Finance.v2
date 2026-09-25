import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {getTenantAlsStore} from "@workspace/db/tenant-als";

describe("ALS de tenant", () => {
    it("service chamado sem middleware não tem store", () => {
        assert.equal(getTenantAlsStore(), undefined);
    });
});
