import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {Response} from "express";
import {errorResponse} from "./response.js";

type MockRes = Response & {statusCode: number; payload: unknown};

function mockRes(requestId: string): MockRes {
    const res: {
        req: {id: string};
        statusCode: number;
        payload: unknown;
        status: (code: number) => MockRes;
        json: (body: unknown) => MockRes;
    } = {
        req: {id: requestId},
        statusCode: 0,
        payload: null,
        status(code: number) {
            this.statusCode = code;
            return this as unknown as MockRes;
        },
        json(body: unknown) {
            this.payload = body;
            return this as unknown as MockRes;
        },
    };
    return res as unknown as MockRes;
}

describe("errorResponse (Card 95)", () => {
    it("em produção 5xx devolve { requestId } e loga o Error real, não String(err)", () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        const calls: unknown[][] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => {
            calls.push(args);
        };
        try {
            const err = new Error('duplicate key value violates unique constraint "usuarios_email_unique"');
            const res = mockRes("req-prod-1");
            errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar usuários.", err);

            const payload = res.payload as {
                errors: Array<{details: unknown; message: string}>;
            };
            assert.deepEqual(payload.errors[0].details, {requestId: "req-prod-1"});
            assert.equal(JSON.stringify(payload).includes("usuarios_email_unique"), false);
            assert.equal(calls[0][0], "[req-prod-1]");
            assert.equal(calls[0][1], err);
        } finally {
            console.error = original;
            if (previous === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV = previous;
            }
        }
    });

    it("loga mesmo quando o catch não passou a causa (anti-silêncio)", () => {
        const calls: unknown[][] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => {
            calls.push(args);
        };
        try {
            const res = mockRes("req-silent");
            errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar cards do kanban.");
            assert.equal(calls[0][0], "[req-silent]");
            assert.ok(calls[0][1] instanceof Error);
        } finally {
            console.error = original;
        }
    });
});
