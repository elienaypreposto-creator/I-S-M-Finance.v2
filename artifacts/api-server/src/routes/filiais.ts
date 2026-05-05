import { Router } from "express";
import { db } from "@workspace/db";
import { filiaisTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

router.get("/filiais", async (_req, res) => {
  try {
    const items = await db.select().from(filiaisTable).orderBy(filiaisTable.nome);
    return successResponse(res, items);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar filiais.", String(e));
  }
});

router.post("/filiais", async (req, res) => {
  try {
    const [item] = await db.insert(filiaisTable).values(req.body).returning();
    return successResponse(res, item, null, 201);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar filial.", String(e));
  }
});

router.put("/filiais/:id", async (req, res) => {
  try {
    const [item] = await db.update(filiaisTable).set(req.body)
      .where(eq(filiaisTable.id, parseInt(req.params.id))).returning();
    if (!item) return errorResponse(res, 404, "NOT_FOUND", "Filial não encontrada.");
    return successResponse(res, item);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar filial.", String(e));
  }
});

router.delete("/filiais/:id", async (req, res) => {
  try {
    await db.delete(filiaisTable).where(eq(filiaisTable.id, parseInt(req.params.id)));
    return successResponse(res, { deleted: true });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao excluir filial.", String(e));
  }
});

export default router;
