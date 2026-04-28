import { Router } from "express";
import { db } from "@workspace/db";
import { planoContasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/plano-contas", async (_req, res) => {
  try {
    const items = await db.select().from(planoContasTable).orderBy(planoContasTable.tipo, planoContasTable.categoria);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/plano-contas", async (req, res) => {
  try {
    const [item] = await db.insert(planoContasTable).values(req.body).returning();
    return res.status(201).json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/plano-contas/:id", async (req, res) => {
  try {
    const [item] = await db.update(planoContasTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(planoContasTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/plano-contas/:id", async (req, res) => {
  try {
    await db.delete(planoContasTable).where(eq(planoContasTable.id, parseInt(req.params.id)));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
