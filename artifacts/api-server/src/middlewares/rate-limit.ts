/**
 * rate-limit — Limitação de requisições contra força bruta e flood.
 *
 * `globalLimiter`  — 300 req / 15 min por IP, aplicado a toda a árvore /api.
 * `authLimiter`    — 10 req / 15 min por IP, aplicado a /auth/verify-otp,
 *                     /auth/forgot-password e /auth/reset-password.
 * `loginLimiter`   — 10 req / 15 min por chave composta IP + e-mail,
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
 * Nota de infraestrutura: o store usado aqui é o `MemoryStore` padrão do
 * express-rate-limit, válido para um único processo Node de longa duração
 * (`pnpm run dev` / `dev:direct`). Em deploy serverless (Vercel, ver
 * `api/index.ts`), cada invocação pode rodar numa instância/região diferente
 * e a contagem não é compartilhada entre elas — o limite passa a ser "por
 * instância fria", não global. Para garantir o limite real em produção
 * serverless é necessário um store externo compartilhado (ex.: Redis via
 * `rate-limit-redis` + Upstash), fora do escopo desta implementação inicial.
 */

import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { RateLimitExceededEventHandler } from "express-rate-limit";
import type { Request } from "express";
import { errorResponse } from "../utils/response";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

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

export const globalLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipOptions,
    handler: rateLimitHandler,
});

export const authLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipOptions,
    handler: rateLimitHandler,
    // IP puro — o helper normaliza IPv4/IPv6 (mitiga CVE-2026-30827 de agrupamento IPv6).
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown"),
});

export const loginLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipOptions,
    handler: rateLimitHandler,
    keyGenerator: (req) => {
        const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");
        const email =
            typeof req.body?.email === "string" && req.body.email.trim()
                ? req.body.email.trim().toLowerCase()
                : "sem-email";
        return `${ip}:${email}`;
    },
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
});