import { Router } from "express";
import { db } from "@workspace/db";
import { tokensApiTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

router.get("/tokens-api", async (_req, res) => {
  try {
    const items = await db.select({
      id: tokensApiTable.id,
      nome: tokensApiTable.descricao,
      ativo: tokensApiTable.ativo,
      created_at: tokensApiTable.created_at,
    }).from(tokensApiTable).orderBy(tokensApiTable.created_at);
    return successResponse(res, items);
  } catch (error) {
    console.error("Erro em GET /tokens-api:", error);
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao listar tokens de API.");
  }
});

router.post("/tokens-api", async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const tokenPreview = `${token.slice(0, 8)}...${token.slice(-8)}`;

    const [item] = await db.insert(tokensApiTable).values({
      descricao: req.body.nome,
      token_hash: tokenHash,
      token_preview: tokenPreview,
      ativo: true,
    }).returning({
      id: tokensApiTable.id,
      nome: tokensApiTable.descricao,
      ativo: tokensApiTable.ativo,
      created_at: tokensApiTable.created_at,
    });

    return successResponse(res, { ...item, token }, null, 201);
  } catch (error) {
    console.error("Erro em POST /tokens-api:", error);
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao criar token de API.");
  }
});

router.patch("/tokens-api/:id", async (req, res) => {
  try {
    const [item] = await db.update(tokensApiTable)
      .set({ ativo: req.body.ativo, updated_at: new Date() })
      .where(eq(tokensApiTable.id, parseInt(req.params.id))).returning({
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

router.delete("/tokens-api/:id", async (req, res) => {
  try {
    await db.delete(tokensApiTable).where(eq(tokensApiTable.id, parseInt(req.params.id)));
    return successResponse(res, { deleted: true });
  } catch (error) {
    console.error("Erro em DELETE /tokens-api/:id:", error);
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao excluir token de API.");
  }
});

export default router;
