/**
 * rate-limit - Limitação de requisições contra força bruta e flood.
 *
 * `globalLimiter`  - 300 req / 15 min por IP, aplicado a toda a árvore /api.
 * `authLimiter`    - 10 req / 15 min por IP, aplicado a /auth/verify-otp,
 *                     /auth/forgot-password e /auth/reset-password.
 * `loginLimiter`   - 10 req / 15 min por chave composta IP + e-mail,
 *                     aplicado apenas a /auth/login.
 *
 * A chave composta do login evita dois problemas opostos do limite por IP puro:
 *   - um atacante distribuído (botnet) testando um único e-mail a partir de
 *     muitos IPs não é travado por um limite puro-IP;
 *   - um IP compartilhado (NAT de escritório, 4G, VPN corporativa) não deve
 *     bloquear todos os utilizadores desse IP por causa de um único atacante.
 * A combinação IP + e-mail trata cada par como um "balde" independente.
 *
 * Nota de infraestrutura: o store usado aqui é o `MemoryStore` padrão do
 * express-rate-limit, válido para um único processo Node de longa duração
 * (`pnpm run dev` / `dev:direct`). Em deploy serverless (Vercel, ver
 * `api/index.ts`), cada invocação pode rodar numa instância/região diferente
 * e a contagem não é compartilhada entre elas - o limite passa a ser "por
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
});