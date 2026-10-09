import assert from "node:assert/strict";
import http from "node:http";
import type {AddressInfo} from "node:net";
import {after, before, describe, it} from "node:test";
import express from "express";
import {corsPolicy, isSameHost, parseAllowedOrigins} from "./cors-policy.js";

describe("parseAllowedOrigins", () => {
    it("une CORS_ORIGINS e FRONTEND_URL normalizando para origin", () => {
        assert.deepEqual(
            parseAllowedOrigins({
                CORS_ORIGINS: "https://a.example.com/, http://localhost:5173 ,lixo",
                FRONTEND_URL: "https://ism-tst.valtre.com.br/login",
            }),
            ["https://a.example.com", "http://localhost:5173", "https://ism-tst.valtre.com.br"],
        );
        assert.deepEqual(parseAllowedOrigins({}), []);
    });
    it("isSameHost compara host:porta do Origin com o Host", () => {
        assert.equal(isSameHost("https://ism-tst.valtre.com.br", "ism-tst.valtre.com.br"), true);
        assert.equal(isSameHost("https://evil.com", "ism-tst.valtre.com.br"), false);
        assert.equal(isSameHost("null", "ism-tst.valtre.com.br"), false);
        assert.equal(isSameHost("https://x.com", undefined), false);
    });
});

type Resp = {status: number; headers: http.IncomingHttpHeaders};

function startApp(enforce: boolean, allowedOrigins: string[]) {
    const app = express();
    app.use(corsPolicy({allowedOrigins, enforce}));
    app.post("/api/x", (_req, res) => {
        res.json({ok: true});
    });
    const server = app.listen(0, "127.0.0.1");
    return server;
}

function call(port: number, method: string, headers: Record<string, string>): Promise<Resp> {
    return new Promise((resolve, reject) => {
        const req = http.request({host: "127.0.0.1", port, path: "/api/x", method, headers}, (res) => {
            res.resume();
            res.on("end", () => resolve({status: res.statusCode ?? 0, headers: res.headers}));
        });
        req.on("error", reject);
        req.end();
    });
}

describe("corsPolicy em produção (enforce)", () => {
    let server: http.Server;
    let port: number;
    before(async () => {
        server = startApp(true, ["https://ism-tst.valtre.com.br"]);
        await new Promise<void>((r) => server.once("listening", () => r()));
        port = (server.address() as AddressInfo).port;
    });
    after(() => server.close());

    it("origem maliciosa -> 403 e sem Access-Control-Allow-*", async () => {
        const r = await call(port, "POST", {Origin: "https://site-malicioso.com", Host: "ism-tst.valtre.com.br"});
        assert.equal(r.status, 403);
        assert.equal(r.headers["access-control-allow-origin"], undefined);
        const pre = await call(port, "OPTIONS", {
            Origin: "https://site-malicioso.com",
            Host: "ism-tst.valtre.com.br",
            "Access-Control-Request-Method": "POST",
        });
        assert.equal(pre.status, 403);
        assert.equal(pre.headers["access-control-allow-origin"], undefined);
    });

    it("origem da lista -> liberada com credentials", async () => {
        const r = await call(port, "POST", {Origin: "https://ism-tst.valtre.com.br", Host: "api.interno:5000"});
        assert.equal(r.status, 200);
        assert.equal(r.headers["access-control-allow-origin"], "https://ism-tst.valtre.com.br");
        assert.equal(r.headers["access-control-allow-credentials"], "true");
    });

    it("same-origin passa mesmo fora da lista (env vazia não derruba o front)", async () => {
        const r = await call(port, "POST", {Origin: "https://ism-hml.valtre.com.br", Host: "ism-hml.valtre.com.br"});
        assert.equal(r.status, 200);
    });

    it("sem Origin (curl, server-to-server) passa", async () => {
        const r = await call(port, "POST", {});
        assert.equal(r.status, 200);
    });

    it("Origin: null -> 403", async () => {
        const r = await call(port, "POST", {Origin: "null", Host: "ism-tst.valtre.com.br"});
        assert.equal(r.status, 403);
    });
});

describe("corsPolicy fora de produção", () => {
    let server: http.Server;
    let port: number;
    before(async () => {
        server = startApp(false, []);
        await new Promise<void>((r) => server.once("listening", () => r()));
        port = (server.address() as AddressInfo).port;
    });
    after(() => server.close());

    it("não bloqueia, só omite os headers CORS", async () => {
        const r = await call(port, "POST", {Origin: "https://site-malicioso.com"});
        assert.equal(r.status, 200);
        assert.equal(r.headers["access-control-allow-origin"], undefined);
    });
});
