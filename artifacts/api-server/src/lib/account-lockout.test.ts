/**
 * Bloqueio por conta (ISMF-7). O `login()` abaixo reproduz a ordem do
 * /auth/login: consulta bloqueio -> confere senha -> registra falha/sucesso.
 */
import assert from "node:assert/strict";
import {beforeEach, describe, it} from "node:test";
import {
    LOCKOUT_PADRAO,
    chaveConta,
    createAccountLockout,
    memoryLockoutStore,
    type AccountLockout,
    type EventoBloqueio,
    type LockoutStore,
} from "./account-lockout.js";

const MIN = 60_000;
const SENHA = "senha-correta";
const EMAIL = "Vitima@Empresa.com.br";

let agora: number;
let lockout: AccountLockout;
let eventos: EventoBloqueio[];

async function login(email: string, senha: string, ip: string): Promise<401 | 200> {
    if (await lockout.bloqueado(email, ip)) return 401;
    if (senha !== SENHA) {
        await lockout.registrarFalha(email, ip);
        return 401;
    }
    await lockout.registrarSucesso(email, ip);
    return 200;
}

beforeEach(() => {
    agora = 1_000_000;
    eventos = [];
    lockout = createAccountLockout({
        store: memoryLockoutStore(() => agora),
        onBloqueio: (ev) => {
            eventos.push(ev);
        },
    });
});

describe("bloqueio por conta", () => {
    it("padrão: 5 falhas em 15 min -> 15 min de bloqueio", () => {
        assert.equal(LOCKOUT_PADRAO.maxFalhas, 5);
        assert.equal(LOCKOUT_PADRAO.janelaMs, 15 * MIN);
        assert.equal(LOCKOUT_PADRAO.bloqueioMs, 15 * MIN);
    });

    it("5 senhas erradas -> 6ª com senha correta falha (mesmo 401)", async () => {
        for (let i = 0; i < 5; i++) assert.equal(await login(EMAIL, "errada", "1.1.1.1"), 401);
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0]!.chave, chaveConta(EMAIL));
        assert.equal(await login(EMAIL, SENHA, "1.1.1.1"), 401);
        // de outro IP sem histórico também
        assert.equal(await login(EMAIL, SENHA, "9.9.9.9"), 401);
        agora += 14 * MIN;
        assert.equal(await login(EMAIL, SENHA, "1.1.1.1"), 401);
    });

    it("após expirar, login correto funciona e zera o contador", async () => {
        for (let i = 0; i < 5; i++) await login(EMAIL, "errada", "1.1.1.1");
        agora += 15 * MIN + 1;
        assert.equal(await login(EMAIL, SENHA, "1.1.1.1"), 200);
        // contador zerado: 4 erros não bloqueiam
        for (let i = 0; i < 4; i++) await login(EMAIL, "errada", "1.1.1.1");
        assert.equal(await login(EMAIL, SENHA, "1.1.1.1"), 200);
    });

    it("tentativas durante o bloqueio não prolongam o bloqueio", async () => {
        for (let i = 0; i < 5; i++) await login(EMAIL, "errada", "6.6.6.6");
        agora += 10 * MIN;
        for (let i = 0; i < 50; i++) await login(EMAIL, "errada", "6.6.6.6");
        agora += 5 * MIN + 1;
        assert.equal(await login(EMAIL, SENHA, "1.1.1.1"), 200);
        assert.equal(eventos.length, 1);
    });

    it("atacante de outro IP não trava o IP onde a vítima já logou", async () => {
        assert.equal(await login(EMAIL, SENHA, "200.1.1.1"), 200); // vítima, IP conhecido
        for (let i = 0; i < 5; i++) await login(EMAIL, "chute", "6.6.6.6"); // atacante
        assert.equal(await login(EMAIL, SENHA, "6.6.6.6"), 401); // atacante bloqueado
        assert.equal(await login(EMAIL, SENHA, "200.1.1.1"), 200); // vítima entra
    });

    it("IP conhecido que errou a senha entra no bloqueio normalmente", async () => {
        assert.equal(await login(EMAIL, SENHA, "200.1.1.1"), 200);
        for (let i = 0; i < 5; i++) await login(EMAIL, "errada", "200.1.1.1");
        assert.equal(await login(EMAIL, SENHA, "200.1.1.1"), 401);
    });

    it("e-mail inexistente tem o mesmo comportamento (sem enumeração) e normaliza caixa", async () => {
        for (let i = 0; i < 5; i++) await login("nao.existe@x.com", "errada", "1.1.1.1");
        assert.equal(await lockout.bloqueado("NAO.EXISTE@x.com ", "1.1.1.1"), true);
    });

    it("liberar() (reset de senha) remove o bloqueio", async () => {
        for (let i = 0; i < 5; i++) await login(EMAIL, "errada", "1.1.1.1");
        await lockout.liberar(EMAIL.toLowerCase());
        assert.equal(await login(EMAIL, SENHA, "1.1.1.1"), 200);
    });

    it("store fora do ar -> fail-open (login segue)", async () => {
        const quebrado: LockoutStore = {
            falha: () => Promise.reject(new Error("down")),
            bloqueioRestanteMs: () => Promise.reject(new Error("down")),
            ipConfiavel: () => Promise.reject(new Error("down")),
            sucesso: () => Promise.reject(new Error("down")),
            limpar: () => Promise.reject(new Error("down")),
        };
        lockout = createAccountLockout({store: quebrado});
        assert.equal(await login(EMAIL, "errada", "1.1.1.1"), 401);
        assert.equal(await login(EMAIL, SENHA, "1.1.1.1"), 200);
    });
});

describe("redisLockoutStore (roda só com REDIS_URL)", {skip: !process.env.REDIS_URL}, () => {
    it("mesmas regras no Redis real (Lua + TTL)", async () => {
        const {getRedis, closeRedis} = await import("./redis.js");
        const {redisLockoutStore} = await import("./account-lockout.js");
        const r = getRedis()!;
        if (r.status !== "ready") await new Promise((ok) => r.once("ready", ok));
        const email = `teste-${Date.now()}@x.com`;
        const real = createAccountLockout({
            store: redisLockoutStore(),
            config: {bloqueioMs: 400, janelaMs: 1_000},
        });
        lockout = real;
        assert.equal(await login(email, SENHA, "200.1.1.1"), 200); // IP conhecido
        for (let i = 0; i < 5; i++) await login(email, "x", "6.6.6.6");
        assert.equal(await login(email, SENHA, "6.6.6.6"), 401);
        assert.equal(await login(email, SENHA, "200.1.1.1"), 200); // IP conhecido não travado
        for (let i = 0; i < 5; i++) await login(email, "x", "6.6.6.6");
        assert.ok((await r.pttl(`lk:bloq:${chaveConta(email)}`)) > 0);
        await new Promise((ok) => setTimeout(ok, 450));
        assert.equal(await login(email, SENHA, "6.6.6.6"), 200);
        assert.equal(await r.exists(`lk:bloq:${chaveConta(email)}`), 0);
        await r.del(`lk:ipok:${chaveConta(email)}`);
        await closeRedis();
    });
});
