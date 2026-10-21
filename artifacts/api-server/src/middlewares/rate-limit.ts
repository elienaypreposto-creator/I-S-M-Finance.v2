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
 * O IP é sempre `req.ip`, que só é o IP real do cliente com `trust proxy`
 * correto (ver lib/client-ip.ts); sem isso todos caem no balde do gateway.
 * O bloqueio por conta (falhas por e-mail) fica em lib/account-lockout.ts:
 * ele substitui o antigo limiter por e-mail, que respondia 429 para a vítima
 * enquanto o atacante continuasse errando a senha dela.
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
 * Assinatura de `sendCommand` do rate-limit-redis (cliente único, não cluster).
 * O construtor aceita união com o modo cluster, que não tem este campo.
 */
type RedisReply = boolean | number | string | Array<boolean | number | string>;
type RedisSendCommand = (...args: string[]) => Promise<RedisReply>;

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
const rateLimitHandler: RateLimitExceededEventHandler = (_req, res) => {
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
const skipOptions = (req: Request): boolean => req.method === "OPTIONS";

/**
 * As validações de proxy da lib ficam desligadas: o `trust proxy` é numérico
 * e a lib v8 lança ValidationError em setups que ela não reconhece.
 * O IP utilizado continua sendo req.ip.
 */
const proxyValidate = {
    xForwardedForHeader: false,
    trustProxy: false,
} as const;

/**
 * Extrai e normaliza o e-mail do corpo.
 */
export const emailDoCorpo = (req: Request): string | null => {
    if (typeof req.body?.email !== "string" || !req.body.email.trim()) {
        return null;
    }
    return req.body.email.trim().toLowerCase();
};

/** IP real normalizado (IPv6 agrupado por /56 - CVE-2026-30827). */
export const chaveIp = (req: Request): string =>
    ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");

/** Chave composta do login: IP real + e-mail. */
export const chaveLogin = (req: Request): string => `${chaveIp(req)}:${emailDoCorpo(req) ?? "sem-email"}`;

/**
 * Monta os limiters com o Store recebido (Redis em produção, memória nos
 * testes). Cada limiter precisa de um Store próprio.
 */
export function criarLimiters(novoStore: (prefixo: string) => Store) {
    const base = {
        windowMs: FIFTEEN_MINUTES_MS,
        standardHeaders: "draft-7" as const,
        legacyHeaders: false,
        skip: skipOptions,
        handler: rateLimitHandler,
        validate: proxyValidate,
        passOnStoreError: true,
    };

    return {
        /** 300 requisições / 15 minutos por IP. */
        globalLimiter: rateLimit({...base, limit: 300, keyGenerator: chaveIp, store: novoStore("rl:global:")}),
        /** 10 requisições / 15 minutos por IP. */
        authLimiter: rateLimit({...base, limit: 10, keyGenerator: chaveIp, store: novoStore("rl:auth:")}),
        /** 10 tentativas / 15 minutos por IP + e-mail. */
        loginLimiter: rateLimit({...base, limit: 10, keyGenerator: chaveLogin, store: novoStore("rl:login:")}),
    };
}

export const {globalLimiter, authLimiter, loginLimiter} = criarLimiters(
    (prefixo) => new ResilientRedisStore(prefixo),
);
