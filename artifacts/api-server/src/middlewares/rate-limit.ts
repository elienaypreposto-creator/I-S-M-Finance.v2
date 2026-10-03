/**
 * rate-limit - Limitação de requisições contra força bruta e flood.
 *
 * `globalLimiter`  - 300 req / 15 min por IP, aplicado a toda a árvore /api.
 * `authLimiter`    - 10 req / 15 min por IP, aplicado a /auth/verify-otp,
 *                     /auth/forgot-password e /auth/reset-password.
 * `loginLimiter`   - 10 req / 15 min por chave composta IP + e-mail,
 *                     aplicado apenas a /auth/login.
 * `loginEmailLimiter` — 20 falhas / 15 min por e-mail (independente do IP),
 *                     aplicado a /auth/login em conjunto com o `loginLimiter`.
 *
 * A chave composta do login evita que um IP compartilhado (NAT de escritório,
 * 4G, VPN corporativa) bloqueie todos os utilizadores desse IP por causa de um
 * único atacante: a combinação IP + e-mail trata cada par como um "balde"
 * independente.
 *
 * Em contrapartida, a chave composta sozinha NÃO trava um atacante distribuído
 * (botnet) testando um único e-mail a partir de muitos IPs — cada IP teria o
 * seu próprio balde. Por isso o `loginEmailLimiter` conta as tentativas
 * FALHAS por e-mail, somando todos os IPs. Só respostas >= 400 contam
 * (`skipSuccessfulRequests`), então logins válidos não consomem a cota.
 * Trade-off: quem atacar um e-mail pode bloquear temporariamente (15 min) o
 * login desse e-mail; é preferível a permitir força bruta ilimitada.
 *
 * Infraestrutura: os contadores ficam no Redis (`rate-limit-redis`), então
 * sobrevivem a restart e são compartilhados entre instâncias da API / invocações
 * serverless. Cada limiter usa um prefixo próprio (`rl:global:`, `rl:auth:`,
 * `rl:login:`, `rl:email:`).
 *
 * DECISÃO: fail-open. Se o Redis estiver indisponível (ou ainda não pronto no
 * boot), `ResilientRedisStore.increment` devolve uma contagem neutra (a requisição
 * passa sem ser contada) e emite um alerta `[ALERT][REDIS]` (com throttle). Não se
 * usa só o `passOnStoreError` porque a lib loga o stack completo a cada requisição;
 * ele fica ligado apenas como rede de segurança. Ver lib/redis.ts.
 */

import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type {
    ClientRateLimitInfo,
    Options,
    RateLimitExceededEventHandler,
    Store,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Request } from "express";
import { alertRedis, getRedis } from "../lib/redis";
import { errorResponse } from "../utils/response";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// Inicia a conexão já no boot (sem isso ela só começaria na 1ª requisição, que passaria sem limite).
getRedis();

type RedisSendCommand = ConstructorParameters<typeof RedisStore>[0]["sendCommand"];

const sendCommand: RedisSendCommand = async (...args: string[]) => {
    const redis = getRedis();
    if (!redis) throw new Error("Redis não configurado.");
    return (await redis.call(args[0]!, ...args.slice(1))) as never;
};

/**
 * Envolve o `RedisStore` com duas proteções:
 *  1. Criação preguiçosa: o `RedisStore` carrega um script Lua no construtor; se isso
 *     rodasse no boot com o Redis fora do ar (fila offline desligada), a promessa
 *     rejeitada ficaria sem tratamento. Aqui o store só é criado quando o cliente
 *     está `ready`; antes disso o erro é lançado e o `passOnStoreError` libera a requisição.
 *  2. `decrement`/`resetKey`/`get` nunca lançam (rodam fora do fluxo do request,
 *     por exemplo com `skipSuccessfulRequests`); apenas alertam.
 */
class ResilientRedisStore implements Store {
    localKeys = false;
    prefix: string;
    private inner: RedisStore | null = null;
    private opts: Options | null = null;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    init(options: Options): void {
        this.opts = options;
    }

    private store(): RedisStore {
        if (this.inner) return this.inner;
        if (getRedis()?.status !== "ready") throw new Error("Redis indisponível.");
        const s = new RedisStore({ sendCommand, prefix: this.prefix });
        if (this.opts) (s as unknown as Store).init?.(this.opts);
        this.inner = s;
        return s;
    }

    async increment(key: string): Promise<ClientRateLimitInfo> {
        try {
            return await this.store().increment(key);
        } catch (e) {
            alertRedis(`rate limit (${this.prefix}) indisponível`, e);
            // Fail-open silencioso: contagem neutra, a requisição passa.
            return {
                totalHits: 1,
                resetTime: new Date(Date.now() + (this.opts?.windowMs ?? 0)),
            };
        }
    }

    async decrement(key: string): Promise<void> {
        try {
            await this.store().decrement(key);
        } catch (e) {
            alertRedis(`rate limit (${this.prefix}) falhou no decrement`, e);
        }
    }

    async resetKey(key: string): Promise<void> {
        try {
            await this.store().resetKey(key);
        } catch (e) {
            alertRedis(`rate limit (${this.prefix}) falhou no resetKey`, e);
        }
    }

    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        try {
            return await this.store().get(key);
        } catch (e) {
            alertRedis(`rate limit (${this.prefix}) falhou no get`, e);
            return undefined;
        }
    }
}

/** Handler comum: devolve 429 no mesmo envelope { data, meta, errors } da API. */
const rateLimitHandler: RateLimitExceededEventHandler = (_req, res) => {
    errorResponse(
        res,
        429,
        "RATE_LIMIT_EXCEEDED",
        "Muitas requisições. Tente novamente em alguns minutos.",
    );
};

/** Não pesa a cota de erros de rede/preflight contra o limite. */
const skipOptions = (req: Request): boolean => req.method === "OPTIONS";

/**
 * O TST/HML corre atrás do Nginx (`X-Forwarded-For`) com `trust proxy` = 1.
 * As validações default do express-rate-limit v8 lançam ValidationError e
 * derrubam o pedido (em alguns setups, o processo) se o header/proxy não
 * bater exactamente com o que a lib espera. Desligar só essas duas checks
 * - o IP continua a ser lido via `req.ip` / `ipKeyGenerator`.
 */
const proxyValidate = {
    xForwardedForHeader: false,
    trustProxy: false,
} as const;

export const globalLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipOptions,
    handler: rateLimitHandler,
    validate: proxyValidate,
    store: new ResilientRedisStore("rl:global:"),
    passOnStoreError: true,
});

export const authLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipOptions,
    handler: rateLimitHandler,
    validate: proxyValidate,
    // IP puro - o helper normaliza IPv4/IPv6 (mitiga CVE-2026-30827 de agrupamento IPv6).
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown"),
    store: new ResilientRedisStore("rl:auth:"),
    passOnStoreError: true,
});

export const loginLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipOptions,
    handler: rateLimitHandler,
    validate: proxyValidate,
    keyGenerator: (req) => {
        const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");
        const email =
            typeof req.body?.email === "string" && req.body.email.trim()
                ? req.body.email.trim().toLowerCase()
                : "sem-email";
        return `${ip}:${email}`;
    },
    store: new ResilientRedisStore("rl:login:"),
    passOnStoreError: true,
});

/**
 * Limite por e-mail (todos os IPs somados), contando apenas tentativas falhas.
 * Sem e-mail válido no corpo a requisição é ignorada aqui — já é limitada pelo
 * `loginLimiter` (IP + "sem-email") e pelo `globalLimiter`, e assim requisições
 * malformadas não compartilham um balde único entre todos os utilizadores.
 */
const emailDoCorpo = (req: Request): string | null =>
    typeof req.body?.email === "string" && req.body.email.trim()
        ? req.body.email.trim().toLowerCase()
        : null;

export const loginEmailLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: (req) => skipOptions(req) || emailDoCorpo(req) === null,
    handler: rateLimitHandler,
    keyGenerator: (req) => `email:${emailDoCorpo(req)}`,
    store: new ResilientRedisStore("rl:email:"),
    passOnStoreError: true,
});