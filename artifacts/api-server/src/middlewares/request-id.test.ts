import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {NextFunction, Request, Response} from "express";
import {REQUEST_ID_HEADER, requestId, resolveRequestId} from "./request-id.js";

describe("resolveRequestId", () => {
    it("reutiliza X-Request-Id válido do cliente", () => {
        assert.equal(resolveRequestId("client-req-01"), "client-req-01");
    });

    it("rejeita header com newline (injeção em log) e gera UUID", () => {
        const id = resolveRequestId("abc\nINTERNAL");
        assert.notEqual(id, "abc\nINTERNAL");
        assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it("gera UUID quando o header está ausente", () => {
        assert.match(
            resolveRequestId(undefined),
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });
});

describe("requestId middleware", () => {
    it("grava req.id e ecoa o header X-Request-Id na resposta", () => {
        const headers: Record<string, string> = {};
        const req = {headers: {"x-request-id": "trace-abc-001"}} as unknown as Request;
        const res = {
            setHeader(name: string, value: string) {
                headers[name] = value;
            },
        } as unknown as Response;
        let nextCalled = false;
        const next: NextFunction = () => {
            nextCalled = true;
        };

        requestId(req, res, next);

        assert.equal(req.id, "trace-abc-001");
        assert.equal(headers[REQUEST_ID_HEADER], "trace-abc-001");
        assert.equal(nextCalled, true);
    });
});
