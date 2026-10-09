import assert from "node:assert/strict";
import type {AddressInfo} from "node:net";
import {after, before, describe, it} from "node:test";
import express from "express";
import {errorHandler} from "./error-handler.js";
import {API_SECURITY_HEADERS, securityHeaders} from "./security-headers.js";

describe("securityHeaders middleware", () => {
    let base = "";
    let close: () => void = () => {};

    before(async () => {
        const app = express();
        app.disable("x-powered-by");
        app.use(securityHeaders);
        app.get("/ok", (_req, res) => {
            res.json({ok: true});
        });
        app.get("/boom", () => {
            throw new Error("falha");
        });
        app.use(errorHandler);
        await new Promise<void>((resolve) => {
            const server = app.listen(0, "127.0.0.1", () => {
                base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
                close = () => server.close();
                resolve();
            });
        });
    });

    after(() => close());

    for (const path of ["/ok", "/boom"]) {
        it(`aplica todos os headers em ${path} (2xx e 5xx do errorHandler)`, async () => {
            const res = await fetch(base + path);
            for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
                assert.equal(res.headers.get(name), value, name);
            }
            assert.equal(res.headers.get("x-powered-by"), null);
        });
    }

    it("404 do Express mantém os headers (CSP do finalhandler continua default-src 'none')", async () => {
        const res = await fetch(base + "/nao-existe");
        assert.equal(res.status, 404);
        for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
            if (name === "Content-Security-Policy") continue;
            assert.equal(res.headers.get(name), value, name);
        }
        assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
        assert.equal(res.headers.get("x-powered-by"), null);
    });

    it("HSTS com pelo menos 1 ano e CSP fechada com frame-ancestors", () => {
        const maxAge = Number(/max-age=(\d+)/.exec(API_SECURITY_HEADERS["Strict-Transport-Security"]!)?.[1]);
        assert.ok(maxAge >= 31536000);
        assert.match(API_SECURITY_HEADERS["Content-Security-Policy"]!, /default-src 'none'/);
        assert.match(API_SECURITY_HEADERS["Content-Security-Policy"]!, /frame-ancestors 'none'/);
    });
});
