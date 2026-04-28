import { Router } from "express";
import { db } from "@workspace/db";
import { contasBancariasTable } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";

const router = Router();

router.get("/contas-bancarias", async (req, res) => {
  try {
    const items = await db.select().from(contasBancariasTable).orderBy(contasBancariasTable.nome);
    return res.json(items.map(i => ({ ...i, saldo_inicial: Number(i.saldo_inicial ?? 0), saldo_atual: Number(i.saldo_inicial ?? 0) })));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/contas-bancarias", async (req, res) => {
  try {
    const { saldo_inicial, ...rest } = req.body;
    const [item] = await db.insert(contasBancariasTable).values({
      ...rest,
      saldo_inicial: saldo_inicial !== undefined ? String(saldo_inicial) : "0",
    }).returning();
    return res.status(201).json({ ...item, saldo_inicial: Number(item.saldo_inicial ?? 0) });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/contas-bancarias/:id", async (req, res) => {
  try {
    const [item] = await db.update(contasBancariasTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(contasBancariasTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json({ ...item, saldo_inicial: Number(item.saldo_inicial ?? 0) });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/contas-bancarias/:id", async (req, res) => {
  try {
    await db.delete(contasBancariasTable).where(eq(contasBancariasTable.id, parseInt(req.params.id)));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
