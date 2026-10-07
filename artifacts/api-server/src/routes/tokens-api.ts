import {type Response, Router} from "express";
import {eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    tokensApiTable,
    ESCOPOS_V1_DISPONIVEIS,
} from "@workspace/db/schema";
import crypto from "crypto";
import {errorResponse, successResponse} from "../utils/response";
import {withPermission} from "../middlewares/withPermission";
import {AppError} from "../utils/app-error";
import {
    requireTenant,
    tenantScope,
    tenantWhere,
} from "../lib/tenant-scope";

function handleRouteError(
    res: Response,
    error: unknown,
    fallback: string,
) {
    if (error instanceof AppError) {
        return errorResponse(
            res,
            error.statusCode,
            error.code,
            error.message,
        );
    }

    return errorResponse(
        res,
        500,
        "INTERNAL_ERROR",
        fallback,
        error,
    );
}

const router = Router();

const UM_ANO_MS = 365 * 24 * 60 * 60 * 1000;

function gerarSecret() {
    const secret = crypto.randomBytes(32).toString("base64url");

    const secretHash = crypto
        .createHash("sha256")
        .update(secret)
        .digest("hex");

    return {
        secret,
        secretHash,
    };
}

/**
 * Lista tokens da empresa ativa.
 */
router.get(
    "/tokens-api",
    withPermission("admin:tokens-api:listar"),
    async (req, res) => {
        try {
            const {empresaId} = requireTenant(req);

            const items = await db
                .select({
                    id: tokensApiTable.id,
                    nome: tokensApiTable.descricao,
                    preview: tokensApiTable.token_preview,
                    escopos: tokensApiTable.escopos,
                    ativo: tokensApiTable.ativo,
                    data_expiracao: tokensApiTable.data_expiracao,
                    last_used_at: tokensApiTable.last_used_at,
                    created_at: tokensApiTable.created_at,
                })
                .from(tokensApiTable)
                .where(tenantScope(tokensApiTable, empresaId))
                .orderBy(tokensApiTable.created_at);

            return successResponse(res, items);
        } catch (error) {
            return handleRouteError(
                res,
                error,
                "Erro interno ao listar tokens de API.",
            );
        }
    },
);

/**
 * Cria token da API v1.
 */
router.post(
    "/tokens-api",
    withPermission("admin:tokens-api:criar"),
    async (req, res) => {
        try {
            const {empresaId} = requireTenant(req);

            const nome =
                typeof req.body?.nome === "string"
                    ? req.body.nome.trim()
                    : null;

            if (!nome) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "O campo 'nome' é obrigatório.",
                );
            }

            const escopos: string[] = Array.isArray(req.body?.escopos)
                ? req.body.escopos
                : [];

            if (escopos.length === 0) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "Informe ao menos um escopo em 'escopos'.",
                );
            }

            const escopoInvalido = escopos.find(
                (e) =>
                    !(ESCOPOS_V1_DISPONIVEIS as readonly string[]).includes(e),
            );

            if (escopoInvalido) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    `Escopo desconhecido: '${escopoInvalido}'.`,
                );
            }

            const dataExpiracaoRaw = req.body?.data_expiracao;

            if (
                typeof dataExpiracaoRaw !== "string" ||
                Number.isNaN(Date.parse(dataExpiracaoRaw))
            ) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "O campo 'data_expiracao' é obrigatório.",
                );
            }

            const dataExpiracao = new Date(dataExpiracaoRaw);

            if (dataExpiracao.getTime() <= Date.now()) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "'data_expiracao' precisa ser uma data futura.",
                );
            }

            if (dataExpiracao.getTime() > Date.now() + UM_ANO_MS) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "'data_expiracao' não pode exceder 1 ano a partir de hoje.",
                );
            }

            const {secret, secretHash} = gerarSecret();

            const secretPreview =
                `${secret.slice(0, 6)}...${secret.slice(-4)}`;

            const [item] = await db
                .insert(tokensApiTable)
                .values({
                    empresa_id: empresaId,
                    criado_por_usuario_id: req.user?.id ?? null,
                    descricao: nome,
                    token_hash: secretHash,
                    token_preview: secretPreview,
                    escopos,
                    data_expiracao: dataExpiracaoRaw,
                    ativo: true,
                })
                .returning({
                    id: tokensApiTable.id,
                    nome: tokensApiTable.descricao,
                    escopos: tokensApiTable.escopos,
                    ativo: tokensApiTable.ativo,
                    data_expiracao: tokensApiTable.data_expiracao,
                    created_at: tokensApiTable.created_at,
                });

            // Token completo retornado somente uma vez.
            const rawToken =
                `ism_v1_${item.id}.${secret}`;

            return successResponse(
                res,
                {
                    ...item,
                    token: rawToken,
                },
                null,
                201,
            );
        } catch (error) {
            return handleRouteError(
                res,
                error,
                "Erro interno ao criar token de API.",
            );
        }
    },
);

/**
 * Ativa/desativa token.
 */
router.patch(
    "/tokens-api/:id",
    withPermission("admin:tokens-api:editar"),
    async (req, res) => {
        try {
            const {empresaId} = requireTenant(req);

            const id = parseInt(
                String(req.params.id),
                10,
            );

            if (Number.isNaN(id)) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "ID inválido.",
                );
            }

            const ativo =
                typeof req.body?.ativo === "boolean"
                    ? req.body.ativo
                    : null;

            if (ativo === null) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "O campo 'ativo' (boolean) é obrigatório.",
                );
            }

            const [item] = await db
                .update(tokensApiTable)
                .set({
                    ativo,
                    updated_at: new Date(),
                })
                .where(
                    tenantWhere(
                        tokensApiTable,
                        empresaId,
                        eq(tokensApiTable.id, id),
                    ),
                )
                .returning({
                    id: tokensApiTable.id,
                    nome: tokensApiTable.descricao,
                    ativo: tokensApiTable.ativo,
                    created_at: tokensApiTable.created_at,
                });

            if (!item) {
                return errorResponse(
                    res,
                    404,
                    "NOT_FOUND",
                    "Token de API não encontrado.",
                );
            }

            return successResponse(res, item);
        } catch (error) {
            return handleRouteError(
                res,
                error,
                "Erro interno ao atualizar token de API.",
            );
        }
    },
);

/**
 * Exclui token.
 */
router.delete(
    "/tokens-api/:id",
    withPermission("admin:tokens-api:deletar"),
    async (req, res) => {
        try {
            const {empresaId} = requireTenant(req);

            const id = parseInt(
                String(req.params.id),
                10,
            );

            if (Number.isNaN(id)) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "ID inválido.",
                );
            }

            const [item] = await db
                .delete(tokensApiTable)
                .where(
                    tenantWhere(
                        tokensApiTable,
                        empresaId,
                        eq(tokensApiTable.id, id),
                    ),
                )
                .returning({
                    id: tokensApiTable.id,
                });

            if (!item) {
                return errorResponse(
                    res,
                    404,
                    "NOT_FOUND",
                    "Token de API não encontrado.",
                );
            }

            return successResponse(res, {
                deleted: true,
            });
        } catch (error) {
            return handleRouteError(
                res,
                error,
                "Erro interno ao excluir token de API.",
            );
        }
    },
);

export default router;