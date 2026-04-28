import { Router } from "express";
import { db } from "@workspace/db";
import { departamentosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/departamentos", async (_req, res) => {
  try {
    const items = await db.select().from(departamentosTable).orderBy(departamentosTable.nome);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/departamentos", async (req, res) => {
  try {
    const [item] = await db.insert(departamentosTable).values(req.body).returning();
    return res.status(201).json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/departamentos/:id", async (req, res) => {
  try {
    const [item] = await db.update(departamentosTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(departamentosTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/departamentos/:id", async (req, res) => {
  try {
    await db.delete(departamentosTable).where(eq(departamentosTable.id, parseInt(req.params.id)));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
