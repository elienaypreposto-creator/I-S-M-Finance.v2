/**
 * Rate limit chaveado no IP real (ISMF-7 + ISMF-6). Usa a mesma configuração
 * de produção (criarLimiters) com MemoryStore no lugar do Redis.
 */
import assert from "node:assert/strict";
import http from "node:http";
import type {AddressInfo} from "node:net";
import {after, before, describe, it} from "node:test";
import express from "express";
import {MemoryStore} from "express-rate-limit";
import {criarLimiters} from "./rate-limit.js";
import {trustProxyHops} from "../lib/client-ip.js";

const GATEWAY = "172.19.0.1";

let server: http.Server;
let port: number;

function post(path: string, ipReal: string, body: object, forjado?: string): Promise<number> {
    const xff = [forjado, ipReal, GATEWAY].filter(Boolean).join(", ");
    const data = JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: "127.0.0.1",
                port,
                path,
                method: "POST",
                headers: {"Content-Type": "application/json", "X-Forwarded-For": xff},
            },
            (res) => {
                res.resume();
                res.on("end", () => resolve(res.statusCode ?? 0));
            },
        );
        req.on("error", reject);
        req.end(data);
    });
}

describe("rate limit por IP real", () => {
    before(async () => {
        const {authLimiter, loginLimiter} = criarLimiters(() => new MemoryStore());
        const app = express();
        app.set("trust proxy", trustProxyHops({}));
        app.use(express.json());
        app.post("/auth/login", loginLimiter, (_req, res) => {
            res.status(401).end();
        });
        app.post("/auth/forgot-password", authLimiter, (_req, res) => {
            res.status(200).end();
        });
        server = app.listen(0, "127.0.0.1");
        await new Promise<void>((r) => server.once("listening", () => r()));
        port = (server.address() as AddressInfo).port;
    });
    after(() => server.close());

    it("11ª tentativa de login do mesmo IP + e-mail em 15 min -> 429", async () => {
        const body = {email: "a@x.com", senha: "x"};
        for (let i = 1; i <= 10; i++) assert.equal(await post("/auth/login", "203.0.113.10", body), 401);
        assert.equal(await post("/auth/login", "203.0.113.10", body), 429);
        // outro cliente (IP real diferente) não é afetado: não dividem o balde do gateway
        assert.equal(await post("/auth/login", "203.0.113.11", body), 401);
    });

    it("trocar o X-Forwarded-For forjado não gera balde novo", async () => {
        const body = {email: "b@x.com", senha: "x"};
        for (let i = 1; i <= 10; i++) {
            assert.equal(await post("/auth/login", "198.51.100.5", body, `10.0.0.${i}`), 401);
        }
        assert.equal(await post("/auth/login", "198.51.100.5", body, "1.2.3.4"), 429);
    });

    it("authLimiter: 10 por IP real", async () => {
        for (let i = 1; i <= 10; i++) {
            assert.equal(await post("/auth/forgot-password", "192.0.2.50", {email: `u${i}@x.com`}), 200);
        }
        assert.equal(await post("/auth/forgot-password", "192.0.2.50", {email: "z@x.com"}), 429);
        assert.equal(await post("/auth/forgot-password", "192.0.2.51", {email: "z@x.com"}), 200);
    });
});
