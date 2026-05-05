import { Router } from "express";
import { db } from "@workspace/db";
import { planoContasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

router.get("/plano-contas", async (_req, res) => {
  try {
    const items = await db.select().from(planoContasTable).orderBy(planoContasTable.tipo, planoContasTable.categoria);
    return successResponse(res, items);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar plano de contas.", String(e));
  }
});

router.post("/plano-contas", async (req, res) => {
  try {
    const [item] = await db.insert(planoContasTable).values(req.body).returning();
    return successResponse(res, item, null, 201);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar plano de contas.", String(e));
  }
});

router.put("/plano-contas/:id", async (req, res) => {
  try {
    const [item] = await db.update(planoContasTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(planoContasTable.id, parseInt(req.params.id))).returning();
    if (!item) return errorResponse(res, 404, "NOT_FOUND", "Plano de contas não encontrado.");
    return successResponse(res, item);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar plano de contas.", String(e));
  }
});

router.delete("/plano-contas/:id", async (req, res) => {
  try {
    await db.delete(planoContasTable).where(eq(planoContasTable.id, parseInt(req.params.id)));
    return successResponse(res, { deleted: true });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao excluir plano de contas.", String(e));
  }
});

export default router;
