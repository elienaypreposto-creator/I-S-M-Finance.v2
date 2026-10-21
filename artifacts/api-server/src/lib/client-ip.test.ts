/**
 * IP real atrás da cadeia borda -> nginx web -> API (ISMF-6).
 *
 * O socket do teste (127.0.0.1) faz o papel do nginx web; o último item do
 * X-Forwarded-For é o que o nginx web acrescenta (gateway do docker-proxy) e o
 * anterior é o que a borda grava ($remote_addr do cliente).
 */
import assert from "node:assert/strict";
import http from "node:http";
import type {AddressInfo} from "node:net";
import {after, before, describe, it} from "node:test";
import express from "express";
import {DEFAULT_TRUST_PROXY_HOPS, clientIp, trustProxyHops} from "./client-ip.js";

const GATEWAY = "172.19.0.1"; // $remote_addr visto pelo nginx web (docker-proxy)

let server: http.Server;
let port: number;

function ipVisto(headers: Record<string, string> = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = http.request({host: "127.0.0.1", port, path: "/ip", headers}, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve(body));
        });
        req.on("error", reject);
        req.end();
    });
}

describe("trustProxyHops", () => {
    it("default = 2 saltos (borda + nginx web)", () => {
        assert.equal(DEFAULT_TRUST_PROXY_HOPS, 2);
        assert.equal(trustProxyHops({}), 2);
    });
    it("aceita override por env e ignora valor inválido", () => {
        assert.equal(trustProxyHops({TRUST_PROXY_HOPS: "1"}), 1);
        assert.equal(trustProxyHops({TRUST_PROXY_HOPS: "abc"}), 2);
        assert.equal(trustProxyHops({TRUST_PROXY_HOPS: "-1"}), 2);
    });
});

describe("clientIp com trust proxy = 2", () => {
    before(async () => {
        const app = express();
        app.set("trust proxy", trustProxyHops({}));
        app.get("/ip", (req, res) => {
            res.send(clientIp(req) ?? "");
        });
        server = app.listen(0, "127.0.0.1");
        await new Promise<void>((r) => server.once("listening", () => r()));
        port = (server.address() as AddressInfo).port;
    });
    after(() => server.close());

    it("usa o IP gravado pela borda", async () => {
        assert.equal(await ipVisto({"X-Forwarded-For": `203.0.113.7, ${GATEWAY}`}), "203.0.113.7");
    });

    it("ignora X-Forwarded-For forjado pelo cliente (borda acrescentando)", async () => {
        // Mesmo se a borda usasse $proxy_add_x_forwarded_for, o forjado fica à esquerda.
        assert.equal(
            await ipVisto({"X-Forwarded-For": `1.2.3.4, 203.0.113.7, ${GATEWAY}`}),
            "203.0.113.7",
        );
        assert.equal(
            await ipVisto({"X-Forwarded-For": `10.0.0.1, 8.8.8.8, 203.0.113.7, ${GATEWAY}`}),
            "203.0.113.7",
        );
    });

    it("sem header de proxy cai no socket", async () => {
        const ip = await ipVisto();
        assert.match(ip, /127\.0\.0\.1$/);
    });
});
