import type {NextFunction, Request, Response} from "express";
import crypto from "crypto";
import {eq} from "drizzle-orm";
import {withBypassRls, type TenantDb} from "@workspace/db";
import {tokensApiTable} from "@workspace/db/schema";
import {errorResponse} from "../utils/response";
import {aplicarIdentidadeToken, hashConfere, tokenExpirado} from "../lib/api-token-identity";

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

function agendarAtualizacaoUso(req: Request, tokenId: number) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? null;

    // Lookup e last_used correm como ism_admin (BYPASSRLS), nunca como dono/SUPERUSER.
    void withBypassRls(async (tx: TenantDb) => {
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

            const [tokenRow] = await withBypassRls((tx: TenantDb) =>
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

            if (tokenExpirado(tokenRow.data_expiracao)) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 expirado.",
                );
            }

            if (!hashConfere(secret, tokenRow.token_hash)) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 inválido ou inativo.",
                );
            }

            aplicarIdentidadeToken(req, tokenRow);
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

            const [tokenRow] = await withBypassRls((tx: TenantDb) =>
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
                    .where(eq(tokensApiTable.token_hash, tokenHash))
                    .limit(1),
            );

            // A busca é pelo hash (unique/indexado), então o tempo não depende do
            // segredo; ainda assim confirma em tempo constante (defesa em profundidade).
            if (!tokenRow || !tokenRow.ativo || !hashConfere(rawToken, tokenRow.token_hash)) {
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

            if (tokenExpirado(tokenRow.data_expiracao)) {
                return errorResponse(
                    res,
                    401,
                    "UNAUTHORIZED",
                    "Token da API v1 expirado.",
                );
            }

            aplicarIdentidadeToken(req, tokenRow);
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