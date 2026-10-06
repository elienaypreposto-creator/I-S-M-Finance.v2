
/**
 * Rate Limit - Limitação de requisições contra força bruta e flood.
 *
 * globalLimiter
 * - 300 requisições / 15 min por IP.
 * - Aplicado a toda a árvore /api.
 *
 * authLimiter
 * - 10 requisições / 15 min por IP.
 * - Aplicado aos endpoints sensíveis de autenticação.
 *
 * loginLimiter
 * - 10 requisições / 15 min por combinação IP + e-mail.
 * - Aplicado ao login.
 *
 * loginEmailLimiter
 * - 20 falhas / 15 min por e-mail.
 * - Independente do IP.
 * - Logins bem-sucedidos não consomem a cota.
 *
 * Infraestrutura:
 * - Contadores armazenados no Redis.
 * - rate-limit-redis é utilizado como Store.
 * - Cada limiter possui seu próprio prefixo.
 *
 * Estratégia:
 * - FAIL-OPEN.
 * - Se o Redis estiver indisponível, a requisição passa.
 * - O problema é registrado por alertRedis().
 */

import {
    rateLimit,
    ipKeyGenerator,
} from "express-rate-limit";

import type {
    ClientRateLimitInfo,
    Options,
    RateLimitExceededEventHandler,
    Store,
} from "express-rate-limit";

import { RedisStore } from "rate-limit-redis";

import type { Request } from "express";

import {
    alertRedis,
    getRedis,
} from "../lib/redis";

import { errorResponse } from "../utils/response";

const FIFTEEN_MINUTES_MS =
    15 * 60 * 1000;

/**
 * Inicializa o cliente Redis no boot.
 *
 * Isso não impede a API de iniciar caso o Redis
 * esteja indisponível.
 */
getRedis();

/**
 * Tipo exigido pelo rate-limit-redis.
 */
type RedisSendCommand =
    ConstructorParameters<
        typeof RedisStore
    >[0]["sendCommand"];

/**
 * Envia comandos para o Redis.
 */
const sendCommand: RedisSendCommand =
    async (...args: string[]) => {
        const redis = getRedis();

        if (!redis) {
            throw new Error(
                "Redis não configurado.",
            );
        }

        if (redis.status !== "ready") {
            throw new Error(
                `Redis indisponível. Status atual: ${redis.status}`,
            );
        }

        return (await redis.call(
            args[0]!,
            ...args.slice(1),
        )) as never;
    };

/**
 * Store Redis resiliente.
 *
 * O RedisStore somente é criado quando o Redis
 * estiver efetivamente pronto.
 */
class ResilientRedisStore
    implements Store
{
    localKeys = false;

    readonly prefix: string;

    private inner: RedisStore | null =
        null;

    private opts: Options | null =
        null;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    init(
        options: Options,
    ): void {
        this.opts = options;
    }

    /**
     * Obtém ou cria o RedisStore.
     */
    private store(): RedisStore {
        if (this.inner) {
            return this.inner;
        }

        const redis = getRedis();

        if (!redis) {
            throw new Error(
                "Redis não configurado.",
            );
        }

        if (redis.status !== "ready") {
            throw new Error(
                `Redis indisponível. Status atual: ${redis.status}`,
            );
        }

        const store =
            new RedisStore({
                sendCommand,
                prefix: this.prefix,
            });

        /**
         * Preserva as opções do express-rate-limit.
         */
        if (this.opts) {
            (
                store as unknown as Store
            ).init?.(this.opts);
        }

        this.inner = store;

        return store;
    }

    /**
     * Incrementa o contador.
     *
     * Em caso de falha:
     * - registra alerta;
     * - retorna contagem neutra;
     * - permite a requisição.
     */
    async increment(
        key: string,
    ): Promise<ClientRateLimitInfo> {
        try {
            return await this
                .store()
                .increment(key);
        } catch (error) {
            alertRedis(
                `rate limit (${this.prefix}) indisponível`,
                error,
            );

            return {
                totalHits: 1,

                resetTime:
                    new Date(
                        Date.now() +
                            (
                                this.opts
                                    ?.windowMs ??
                                FIFTEEN_MINUTES_MS
                            ),
                    ),
            };
        }
    }

    /**
     * Decrementa o contador.
     */
    async decrement(
        key: string,
    ): Promise<void> {
        try {
            await this
                .store()
                .decrement(key);
        } catch (error) {
            alertRedis(
                `rate limit (${this.prefix}) falhou no decrement`,
                error,
            );
        }
    }

    /**
     * Reseta uma chave.
     */
    async resetKey(
        key: string,
    ): Promise<void> {
        try {
            await this
                .store()
                .resetKey(key);
        } catch (error) {
            alertRedis(
                `rate limit (${this.prefix}) falhou no resetKey`,
                error,
            );
        }
    }

    /**
     * Consulta uma chave.
     */
    async get(
        key: string,
    ): Promise<
        ClientRateLimitInfo | undefined
    > {
        try {
            return await this
                .store()
                .get(key);
        } catch (error) {
            alertRedis(
                `rate limit (${this.prefix}) falhou no get`,
                error,
            );

            return undefined;
        }
    }
}

/**
 * Handler comum para HTTP 429.
 */
const rateLimitHandler:
    RateLimitExceededEventHandler =
    (_req, res) => {
        errorResponse(
            res,
            429,
            "RATE_LIMIT_EXCEEDED",
            "Muitas requisições. Tente novamente em alguns minutos.",
        );
    };

/**
 * Requests OPTIONS não consomem rate limit.
 */
const skipOptions = (
    req: Request,
): boolean =>
    req.method === "OPTIONS";

/**
 * Validações relacionadas a proxy.
 *
 * O ambiente pode estar atrás de Nginx /
 * X-Forwarded-For.
 *
 * O IP utilizado continua sendo req.ip.
 */
const proxyValidate = {
    xForwardedForHeader: false,
    trustProxy: false,
} as const;

/**
 * Extrai e normaliza o e-mail do corpo.
 */
const emailDoCorpo = (
    req: Request,
): string | null => {
    if (
        typeof req.body?.email !==
            "string" ||
        !req.body.email.trim()
    ) {
        return null;
    }

    return req.body.email
        .trim()
        .toLowerCase();
};

/**
 * GLOBAL LIMITER
 *
 * 300 requisições / 15 minutos por IP.
 */
export const globalLimiter =
    rateLimit({
        windowMs:
            FIFTEEN_MINUTES_MS,

        limit: 300,

        standardHeaders: "draft-7",
        legacyHeaders: false,

        skip: skipOptions,

        handler:
            rateLimitHandler,

        validate:
            proxyValidate,

        store:
            new ResilientRedisStore(
                "rl:global:",
            ),

        /**
         * Segurança adicional:
         * se o Store falhar,
         * permite a requisição.
         */
        passOnStoreError: true,
    });

/**
 * AUTH LIMITER
 *
 * 10 requisições / 15 minutos por IP.
 */
export const authLimiter =
    rateLimit({
        windowMs:
            FIFTEEN_MINUTES_MS,

        limit: 10,

        standardHeaders: "draft-7",
        legacyHeaders: false,

        skip: skipOptions,

        handler:
            rateLimitHandler,

        validate:
            proxyValidate,

        keyGenerator: (
            req: Request,
        ) =>
            ipKeyGenerator(
                req.ip ??
                    req.socket
                        .remoteAddress ??
                    "unknown",
            ),

        store:
            new ResilientRedisStore(
                "rl:auth:",
            ),

        passOnStoreError: true,
    });

/**
 * LOGIN LIMITER
 *
 * 10 tentativas / 15 minutos por:
 *
 * IP + e-mail
 */
export const loginLimiter =
    rateLimit({
        windowMs:
            FIFTEEN_MINUTES_MS,

        limit: 10,

        standardHeaders: "draft-7",
        legacyHeaders: false,

        skip: skipOptions,

        handler:
            rateLimitHandler,

        validate:
            proxyValidate,

        keyGenerator: (
            req: Request,
        ) => {
            const ip =
                ipKeyGenerator(
                    req.ip ??
                        req.socket
                            .remoteAddress ??
                        "unknown",
                );

            const email =
                emailDoCorpo(req) ??
                "sem-email";

            return `${ip}:${email}`;
        },

        store:
            new ResilientRedisStore(
                "rl:login:",
            ),

        passOnStoreError: true,
    });

/**
 * LOGIN EMAIL LIMITER
 *
 * 20 falhas / 15 minutos por e-mail.
 *
 * As tentativas são somadas entre todos os IPs.
 *
 * Exemplo:
 *
 * IP 1 ─┐
 * IP 2 ─┼──> usuario@email.com
 * IP 3 ─┘
 *
 * Todos compartilham o mesmo contador.
 */
export const loginEmailLimiter =
    rateLimit({
        windowMs:
            FIFTEEN_MINUTES_MS,

        limit: 20,

        standardHeaders: "draft-7",
        legacyHeaders: false,

        /**
         * Logins bem-sucedidos não consomem
         * a cota.
         */
        skipSuccessfulRequests:
            true,

        /**
         * Sem e-mail:
         * não participa deste limiter.
         *
         * Continua protegido por:
         * - loginLimiter;
         * - globalLimiter.
         */
        skip: (req: Request) =>
            skipOptions(req) ||
            emailDoCorpo(req) === null,

        handler:
            rateLimitHandler,

        /**
         * O e-mail é a chave.
         *
         * Não utiliza IP.
         */
        keyGenerator: (
            req: Request,
        ) =>
            `email:${emailDoCorpo(
                req,
            )}`,

        store:
            new ResilientRedisStore(
                "rl:email:",
            ),

        passOnStoreError: true,
    });
