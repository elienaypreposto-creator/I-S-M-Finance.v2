/**
 * withTenantTxMiddleware: a resposta só sai depois do fim da transação da request.
 * Transação fake (registra BEGIN/COMMIT/ROLLBACK com atraso no COMMIT) e Express em memória.
 */
import assert from "node:assert/strict";
import {mkdtempSync, writeFileSync} from "node:fs";
import type {Server} from "node:http";
import type {AddressInfo} from "node:net";
import {tmpdir} from "node:os";
import path from "node:path";
import {after, before, beforeEach, describe, it} from "node:test";
import express, {type NextFunction, type Request, type Response} from "express";

process.env.DATABASE_URL ??= "postgres://ism_app:teste@127.0.0.1:9/ism_teste_inexistente";
const {criarTenantTxMiddleware} = await import("./tenant-tx");

let eventos: string[] = [];
let commitFalha = false;
const ATRASO_COMMIT_MS = 60;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mesma forma do withTenantTx: work() resolve -> COMMIT; rejeita -> ROLLBACK. */
async function txFake(_empresaId: number, work: () => Promise<void>): Promise<void> {
    eventos.push("begin");
    try {
        await work();
    } catch (err) {
        eventos.push("rollback");
        throw err;
    }
    await espera(ATRASO_COMMIT_MS);
    if (commitFalha) {
        eventos.push("commit-falhou");
        throw new Error("could not serialize access");
    }
    eventos.push("commit");
}

const pasta = mkdtempSync(path.join(tmpdir(), "tenant-tx-"));
const arquivo = path.join(pasta, "pacote.json");
writeFileSync(arquivo, JSON.stringify({ok: true}));

let server: Server;
let base = "";

before(async () => {
    const app = express();
    app.use((req, _res, next) => {
        if (req.path !== "/sem-tenant") req.tenant = {empresaId: 1};
        next();
    });
    app.use(criarTenantTxMiddleware(txFake));
    app.get("/json", (_req, res) => {
        eventos.push("rota");
        res.json({ok: true});
    });
    app.get("/send", (_req, res) => {
        res.send("texto");
    });
    app.get("/end", (_req, res) => {
        res.statusCode = 204;
        res.end();
    });
    app.get("/redirect", (_req, res) => {
        res.redirect("/json");
    });
    app.get("/stream", async (_req, res) => {
        res.setHeader("Content-Type", "text/csv");
        res.write("a;b\n");
        await espera(10);
        res.write("1;2\n");
        res.end("3;4\n");
    });
    app.get("/download", (_req, res) => {
        res.download(arquivo, "pacote.json");
    });
    app.get("/erro-sync", () => {
        throw new Error("falhou");
    });
    app.get("/erro-async", async () => {
        await espera(5);
        throw new Error("falhou");
    });
    app.get("/erro-400", (_req, _res, next) => {
        next(Object.assign(new Error("inválido"), {status: 400}));
    });
    app.get("/lenta", async (_req, res) => {
        await espera(400);
        res.json({tarde: true});
    });
    app.get("/sem-tenant", (_req, res) => {
        res.json({livre: true});
    });
    app.use((err: Error & {status?: number}, _req: Request, res: Response, _next: NextFunction) => {
        res.status(err.status ?? 500).json({errors: [{code: err.status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR"}]});
    });
    await new Promise<void>((r) => {
        server = app.listen(0, "127.0.0.1", () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
    eventos = [];
    commitFalha = false;
});

async function pedir(caminho: string, init?: RequestInit): Promise<{status: number; corpo: string}> {
    const r = await fetch(`${base}${caminho}`, {redirect: "manual", ...init});
    const corpo = await r.text();
    eventos.push("cliente");
    return {status: r.status, corpo};
}

describe("tenant-tx: resposta só depois do COMMIT", () => {
    it("res.json: o cliente recebe depois do COMMIT (read-after-write)", async () => {
        const r = await pedir("/json");
        assert.equal(r.status, 200);
        assert.deepEqual(JSON.parse(r.corpo), {ok: true});
        assert.deepEqual(eventos, ["begin", "rota", "commit", "cliente"]);
    });

    for (const [caminho, status, corpo] of [
        ["/send", 200, "texto"],
        ["/end", 204, ""],
        ["/redirect", 302, null],
    ] as const) {
        it(`${caminho}: ${status} depois do COMMIT`, async () => {
            const r = await pedir(caminho);
            assert.equal(r.status, status);
            if (corpo !== null) assert.equal(r.corpo, corpo);
            assert.deepEqual(eventos, ["begin", "commit", "cliente"]);
        });
    }

    it("streaming (res.write): corpo completo e fim só depois do COMMIT", async () => {
        const r = await pedir("/stream");
        assert.equal(r.corpo, "a;b\n1;2\n3;4\n");
        assert.deepEqual(eventos, ["begin", "commit", "cliente"]);
    });

    it("res.download: arquivo inteiro e transação encerrada (não fica pendurada)", async () => {
        // Com Content-Length os bytes saem no res.write; só o res.end fica retido.
        // Download é leitura: o que importa é o arquivo chegar inteiro e a tx terminar.
        const r = await pedir("/download");
        assert.equal(r.status, 200);
        assert.deepEqual(JSON.parse(r.corpo), {ok: true});
        for (let i = 0; i < 20 && !eventos.includes("commit"); i++) await espera(25);
        assert.deepEqual(eventos.filter((e) => e !== "cliente"), ["begin", "commit"]);
    });

    it("erro lançado na rota (sync e async): ROLLBACK e 500", async () => {
        for (const caminho of ["/erro-sync", "/erro-async"]) {
            eventos = [];
            const r = await pedir(caminho);
            assert.equal(r.status, 500);
            assert.deepEqual(eventos, ["begin", "rollback", "cliente"], caminho);
        }
    });

    it("next(err) continua chegando ao error handler (4xx confirma a transação)", async () => {
        const r = await pedir("/erro-400");
        assert.equal(r.status, 400);
        assert.equal(JSON.parse(r.corpo).errors[0].code, "VALIDATION_ERROR");
        assert.deepEqual(eventos, ["begin", "commit", "cliente"]);
    });

    it("COMMIT falha: a resposta retida vira 500 e nada é confirmado", async () => {
        commitFalha = true;
        const r = await pedir("/json");
        assert.equal(r.status, 500);
        assert.equal(JSON.parse(r.corpo).errors[0].code, "INTERNAL_ERROR");
        assert.deepEqual(eventos, ["begin", "rota", "commit-falhou", "cliente"]);
    });

    it("COMMIT falha num streaming já iniciado: conexão derrubada, não 200 completo", async () => {
        commitFalha = true;
        await assert.rejects(pedir("/stream"));
        assert.ok(eventos.includes("commit-falhou"));
    });

    it("cliente desconecta antes: a transação termina sem esperar a rota (não prende conexão)", async () => {
        const ac = new AbortController();
        const p = fetch(`${base}/lenta`, {signal: ac.signal}).catch(() => null);
        await espera(50);
        ac.abort();
        await p;
        await espera(ATRASO_COMMIT_MS + 60);
        // terminou bem antes dos 400 ms da rota
        assert.deepEqual(eventos, ["begin", "commit"]);
    });

    it("sem tenant: passa direto, sem transação", async () => {
        const r = await pedir("/sem-tenant");
        assert.equal(r.status, 200);
        assert.deepEqual(eventos, ["cliente"]);
    });
});
