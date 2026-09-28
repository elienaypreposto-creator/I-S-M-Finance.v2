import type {NextFunction, Request, Response} from "express";
import crypto from "crypto";
import {eq} from "drizzle-orm";
import {withOwnerTx, type TenantDb} from "@workspace/db";
import {tokensApiTable} from "@workspace/db/schema";
import {errorResponse} from "../utils/response";

// Extensão de tipos do Express.
declare global {
    namespace Express {
        interface Request {
            tenant?: {empresaId: number};
            apiToken?: {id: number; escopos: string[]};
        }
    }
}

// Formato novo: ism_v1_<id>.<secret>
const TOKEN_REGEX = /^ism_v1_(\d+)\.([A-Za-z0-9_-]+)$/;

// Formato antigo: crypto.randomBytes(32).toString("hex")
const TOKEN_LEGACY_HEX_REGEX = /^[a-f0-9]{64}$/;

const getBearerToken = (authHeader?: string) => {
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        return null;
    }

    return token;
};

function popularContexto(
    req: Request,
    tokenRow: {
        id: number;
        empresa_id: number;
        escopos: string[] | null;
    },
) {
    req.tenant = {
        empresaId: tokenRow.empresa_id,
    };

    req.apiToken = {
        id: tokenRow.id,
        escopos: tokenRow.escopos ?? [],
    };

    // Mantido por compatibilidade com empresaContext/auditLogger.
    req.user = {
        id: tokenRow.id,
        email: "api-v1@token",
        permissions: ["*"],
        empresaId: tokenRow.empresa_id,
    };
}

function agendarAtualizacaoUso(req: Request, tokenId: number) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? null;

    // Usa owner transaction porque este middleware ainda ocorre
    // antes do contexto de tenant da requisição.
    void withOwnerTx(async (tx: TenantDb) => {
        await tx
            .update(tokensApiTable)
            .set({
                last_used_at: new Date(),
                last_used_ip: ip,
            })
            .where(eq(tokensApiTable.id, tokenId));
    }).catch((e) =>
        console.error(
            "Falha ao atualizar last_used_at/ip do token v1:",
            e,
        ),
    );
}

export const v1AuthMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const rawToken = getBearerToken(req.headers.authorization);

        if (!rawToken) {
            return errorResponse(
                res,
                401,
                "UNAUTHORIZED",
                "Token Bearer da API v1 ausente ou inválido.",
            );
        }

        const hoje = new Date().toISOString().split("T")[0];

        /**
         * ============================================================
         * TOKEN NOVO
         * ============================================================
         *
         * ism_v1_<id>.<secret>
         */
        const novoMatch = TOKEN_REGEX.exec(rawToken);

        if (novoMatch) {
            const [, idStr, secret] = novoMatch;
            const id = Number(idStr);

            if (!Number.isSafeInteger(id) || id <= 0) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 inválido.",
                );
            }

            const [tokenRow] = await withOwnerTx((tx: TenantDb) =>
                tx
                    .select({
                        id: tokensApiTable.id,
                        empresa_id: tokensApiTable.empresa_id,
                        token_hash: tokensApiTable.token_hash,
                        escopos: tokensApiTable.escopos,
                        ativo: tokensApiTable.ativo,
                        data_expiracao: tokensApiTable.data_expiracao,
                    })
                    .from(tokensApiTable)
                    .where(eq(tokensApiTable.id, id))
                    .limit(1),
            );

            if (!tokenRow || !tokenRow.ativo) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 inválido ou inativo.",
                );
            }

            if (
                !Number.isInteger(tokenRow.empresa_id) ||
                tokenRow.empresa_id <= 0
            ) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 sem empresa associada.",
                );
            }

            if (
                tokenRow.data_expiracao &&
                tokenRow.data_expiracao < hoje
            ) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 expirado.",
                );
            }

            const secretHash = crypto
                .createHash("sha256")
                .update(secret)
                .digest();

            const storedHash = Buffer.from(
                tokenRow.token_hash,
                "hex",
            );

            const valido =
                secretHash.length === storedHash.length &&
                crypto.timingSafeEqual(secretHash, storedHash);

            if (!valido) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 inválido ou inativo.",
                );
            }

            popularContexto(req, tokenRow);
            agendarAtualizacaoUso(req, tokenRow.id);

            return next();
        }

        /**
         * ============================================================
         * TOKEN LEGADO
         * ============================================================
         *
         * Mantido temporariamente para tokens antigos de 64 caracteres.
         */
        if (TOKEN_LEGACY_HEX_REGEX.test(rawToken)) {
            const tokenHash = crypto
                .createHash("sha256")
                .update(rawToken)
                .digest("hex");

            const [tokenRow] = await withOwnerTx((tx: TenantDb) =>
                tx
                    .select({
                        id: tokensApiTable.id,
                        empresa_id: tokensApiTable.empresa_id,
                        escopos: tokensApiTable.escopos,
                        ativo: tokensApiTable.ativo,
                        data_expiracao: tokensApiTable.data_expiracao,
                    })
                    .from(tokensApiTable)
                    .where(eq(tokensApiTable.token_hash, tokenHash))
                    .limit(1),
            );

            if (!tokenRow || !tokenRow.ativo) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 inválido ou inativo.",
                );
            }

            if (
                !Number.isInteger(tokenRow.empresa_id) ||
                tokenRow.empresa_id <= 0
            ) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 sem empresa associada.",
                );
            }

            if (
                tokenRow.data_expiracao &&
                tokenRow.data_expiracao < hoje
            ) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 expirado.",
                );
            }

            popularContexto(req, tokenRow);
            agendarAtualizacaoUso(req, tokenRow.id);

            return next();
        }

        return errorResponse(
            res,
            401,
            "UNAUTHORIZED",
            "Token da API v1 com formato inválido.",
        );
    } catch (e) {
        return errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "Erro ao validar token da API v1.",
            e,
        );
    }
};