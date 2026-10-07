import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {clientErrorDetails, isProductionEnv, logInternalError, requestIdFrom} from "./safe-error.js";

describe("clientErrorDetails (Card 95)", () => {
    it("em produção 5xx devolve { requestId } e omite o detalhe interno", () => {
        const leaked = 'duplicate key value violates unique constraint "usuarios_email_unique"';
        assert.deepEqual(clientErrorDetails(500, leaked, "production", "req-abc"), {requestId: "req-abc"});
        assert.deepEqual(clientErrorDetails(503, leaked, "production", "req-abc"), {requestId: "req-abc"});
    });

    it("em desenvolvimento serializa Error (message + stack) para diagnóstico local", () => {
        const err = new Error("relation extratos does not exist");
        const details = clientErrorDetails(500, err, "development", "req-dev") as {
            name: string;
            message: string;
            stack?: string;
        };
        assert.equal(details.name, "Error");
        assert.equal(details.message, "relation extratos does not exist");
        assert.equal(typeof details.stack, "string");
    });

    it("nunca sanitiza 4xx - validação continua visível ao cliente", () => {
        const issues = [{field: "email", message: "E-mail inválido."}];
        assert.deepEqual(clientErrorDetails(400, issues, "production", "req-x"), issues);
        assert.deepEqual(clientErrorDetails(422, issues, "production", "req-x"), issues);
    });

    it("reconhece NODE_ENV=production", () => {
        assert.equal(isProductionEnv("production"), true);
        assert.equal(isProductionEnv("development"), false);
        assert.equal(isProductionEnv(undefined), false);
    });
});

describe("logInternalError (Card 95)", () => {
    it("prefixa console.error com [requestId] e nunca substitui o Error pelos details", () => {
        const calls: unknown[][] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => {
            calls.push(args);
        };
        try {
            const err = new Error("boom");
            logInternalError("req-42", err, "constraint foo");
            assert.equal(calls.length, 2);
            assert.equal(calls[0][0], "[req-42]");
            assert.equal(calls[0][1], err);
            assert.equal(calls[1][0], "[req-42] details:");
            assert.equal(calls[1][1], "constraint foo");
        } finally {
            console.error = original;
        }
    });
});

describe("requestIdFrom", () => {
    it("lê req.id ou res.req.id", () => {
        assert.equal(requestIdFrom({id: "from-req"}), "from-req");
        assert.equal(requestIdFrom({req: {id: "from-res"}}), "from-res");
        assert.equal(requestIdFrom(undefined), "unknown");
    });
});
