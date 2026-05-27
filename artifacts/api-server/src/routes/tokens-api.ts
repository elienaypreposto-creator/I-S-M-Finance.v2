import {Router} from "express";
import {eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {tokensApiTable} from "@workspace/db/schema";
import crypto from "crypto";
import {errorResponse, successResponse} from "../utils/response";
import {withPermission} from "../middlewares/withPermission";

const router = Router();

router.get("/tokens-api", withPermission("admin:tokens-api:listar"), async (_req, res) => {
    try {
        const items = await db
            .select({
                id: tokensApiTable.id,
                nome: tokensApiTable.descricao,
                preview: tokensApiTable.token_preview,
                ativo: tokensApiTable.ativo,
                created_at: tokensApiTable.created_at,
            })
            .from(tokensApiTable)
            .orderBy(tokensApiTable.created_at);

        return successResponse(res, items);
    } catch (error) {
        console.error("Erro em GET /tokens-api:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao listar tokens de API.");
    }
});

router.post("/tokens-api", withPermission("admin:tokens-api:criar"), async (req, res) => {
    try {
        const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : null;
        if (!nome) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "O campo 'nome' é obrigatório.");
        }

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const tokenPreview = `${rawToken.slice(0, 8)}...${rawToken.slice(-8)}`;

        const [item] = await db
            .insert(tokensApiTable)
            .values({descricao: nome, token_hash: tokenHash, token_preview: tokenPreview, ativo: true})
            .returning({
                id: tokensApiTable.id,
                nome: tokensApiTable.descricao,
                ativo: tokensApiTable.ativo,
                created_at: tokensApiTable.created_at,
            });

        // O token raw só é retornado uma vez — não é persistido em plaintext
        return successResponse(res, {...item, token: rawToken}, null, 201);
    } catch (error) {
        console.error("Erro em POST /tokens-api:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao criar token de API.");
    }
});

router.patch("/tokens-api/:id", withPermission("admin:tokens-api:editar"), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");
        }

        // Único campo mutável nesta rota — ativo/inativo
        const ativo = typeof req.body?.ativo === "boolean" ? req.body.ativo : null;
        if (ativo === null) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "O campo 'ativo' (boolean) é obrigatório.");
        }

        const [item] = await db
            .update(tokensApiTable)
            .set({ativo, updated_at: new Date()})
            .where(eq(tokensApiTable.id, id))
            .returning({
                id: tokensApiTable.id,
                nome: tokensApiTable.descricao,
                ativo: tokensApiTable.ativo,
                created_at: tokensApiTable.created_at,
            });

        if (!item) return errorResponse(res, 404, "NOT_FOUND", "Token de API não encontrado.");
        return successResponse(res, item);
    } catch (error) {
        console.error("Erro em PATCH /tokens-api/:id:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao atualizar token de API.");
    }
});

router.delete("/tokens-api/:id", withPermission("admin:tokens-api:deletar"), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");
        }

        await db.delete(tokensApiTable).where(eq(tokensApiTable.id, id));
        return successResponse(res, {deleted: true});
    } catch (error) {
        console.error("Erro em DELETE /tokens-api/:id:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao excluir token de API.");
    }
});

export default router;
