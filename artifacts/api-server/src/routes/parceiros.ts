import { Router } from "express";
import { db } from "@workspace/db";
import { parceirosTable } from "@workspace/db/schema";
import { eq, ilike, and, count } from "drizzle-orm";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

router.get("/parceiros", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (req.query.search) conditions.push(ilike(parceirosTable.nome, `%${req.query.search}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(parceirosTable).where(where);
    const items = await db.select().from(parceirosTable).where(where).limit(limit).offset(offset).orderBy(parceirosTable.nome);

    return successResponse(res, items, { total: totalResult.count, page, limit });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar parceiros.", String(e));
  }
});

router.post("/parceiros", async (req, res) => {
  try {
    const [item] = await db.insert(parceirosTable).values({
      ...req.body,
      tipos: req.body.tipos || [],
      chaves_pix: req.body.chaves_pix || [],
      dados_bancarios: req.body.dados_bancarios || [],
    }).returning();
    return successResponse(res, item, null, 201);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar parceiro.", String(e));
  }
});

router.get("/parceiros/:id", async (req, res) => {
  try {
    const [item] = await db.select().from(parceirosTable).where(eq(parceirosTable.id, parseInt(req.params.id)));
    if (!item) return errorResponse(res, 404, "NOT_FOUND", "Parceiro não encontrado.");
    return successResponse(res, item);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar parceiro.", String(e));
  }
});

router.put("/parceiros/:id", async (req, res) => {
  try {
    const [item] = await db.update(parceirosTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(parceirosTable.id, parseInt(req.params.id))).returning();
    if (!item) return errorResponse(res, 404, "NOT_FOUND", "Parceiro não encontrado.");
    return successResponse(res, item);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar parceiro.", String(e));
  }
});

router.delete("/parceiros/:id", async (req, res) => {
  try {
    await db.delete(parceirosTable).where(eq(parceirosTable.id, parseInt(req.params.id)));
    return successResponse(res, { deleted: true });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao excluir parceiro.", String(e));
  }
});

export default router;
