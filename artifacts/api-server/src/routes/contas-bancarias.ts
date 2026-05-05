import { Router } from "express";
import { db } from "@workspace/db";
import { contasBancariasTable } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

router.get("/contas-bancarias", async (req, res) => {
  try {
    const items = await db.select().from(contasBancariasTable).orderBy(contasBancariasTable.nome);
    return successResponse(
      res,
      items.map(i => ({ ...i, saldo_inicial: Number(i.saldo_inicial ?? 0), saldo_atual: Number(i.saldo_inicial ?? 0) })),
    );
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar contas bancárias.", String(e));
  }
});

router.post("/contas-bancarias", async (req, res) => {
  try {
    const { saldo_inicial, ...rest } = req.body;
    const [item] = await db.insert(contasBancariasTable).values({
      ...rest,
      saldo_inicial: saldo_inicial !== undefined ? String(saldo_inicial) : "0",
    }).returning();
    return successResponse(res, { ...item, saldo_inicial: Number(item.saldo_inicial ?? 0) }, null, 201);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar conta bancária.", String(e));
  }
});

router.put("/contas-bancarias/:id", async (req, res) => {
  try {
    const [item] = await db.update(contasBancariasTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(contasBancariasTable.id, parseInt(req.params.id))).returning();
    if (!item) return errorResponse(res, 404, "NOT_FOUND", "Conta bancária não encontrada.");
    return successResponse(res, { ...item, saldo_inicial: Number(item.saldo_inicial ?? 0) });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar conta bancária.", String(e));
  }
});

router.delete("/contas-bancarias/:id", async (req, res) => {
  try {
    await db.delete(contasBancariasTable).where(eq(contasBancariasTable.id, parseInt(req.params.id)));
    return successResponse(res, { deleted: true });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao excluir conta bancária.", String(e));
  }
});

export default router;
