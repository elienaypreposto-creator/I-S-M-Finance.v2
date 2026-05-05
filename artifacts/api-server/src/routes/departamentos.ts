import { Router } from "express";
import { db } from "@workspace/db";
import { departamentosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

router.get("/departamentos", async (_req, res) => {
  try {
    const items = await db.select().from(departamentosTable).orderBy(departamentosTable.nome);
    return successResponse(res, items);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar departamentos.", String(e));
  }
});

router.post("/departamentos", async (req, res) => {
  try {
    const [item] = await db.insert(departamentosTable).values(req.body).returning();
    return successResponse(res, item, null, 201);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar departamento.", String(e));
  }
});

router.put("/departamentos/:id", async (req, res) => {
  try {
    const [item] = await db.update(departamentosTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(departamentosTable.id, parseInt(req.params.id))).returning();
    if (!item) return errorResponse(res, 404, "NOT_FOUND", "Departamento não encontrado.");
    return successResponse(res, item);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar departamento.", String(e));
  }
});

router.delete("/departamentos/:id", async (req, res) => {
  try {
    await db.delete(departamentosTable).where(eq(departamentosTable.id, parseInt(req.params.id)));
    return successResponse(res, { deleted: true });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao excluir departamento.", String(e));
  }
});

export default router;
