import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {REQUEST_ID_PATTERN, auditRequestId, resolveRequestId} from "./request-id.js";

describe("auditRequestId (ISMF-18 header ↔ coluna)", () => {
    it("persiste o mesmo valor que o middleware aceita (não só UUID)", () => {
        assert.equal(auditRequestId("client-req-01"), "client-req-01");
        assert.equal(auditRequestId("trace-abc-001"), "trace-abc-001");
        assert.equal(auditRequestId("trace.abc:def-12"), "trace.abc:def-12");
    });

    it("persiste UUID gerado quando o header está ausente", () => {
        const id = resolveRequestId(undefined);
        assert.match(id, REQUEST_ID_PATTERN);
        assert.equal(auditRequestId(id), id);
    });

    it("rejeita valores que o middleware também rejeita", () => {
        assert.equal(auditRequestId("abc\nINTERNAL"), null);
        assert.equal(auditRequestId("short"), null);
        assert.equal(auditRequestId(undefined), null);
    });
});
