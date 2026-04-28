import { Router } from "express";
import { db } from "@workspace/db";
import { filiaisTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/filiais", async (_req, res) => {
  try {
    const items = await db.select().from(filiaisTable).orderBy(filiaisTable.nome);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/filiais", async (req, res) => {
  try {
    const [item] = await db.insert(filiaisTable).values(req.body).returning();
    return res.status(201).json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/filiais/:id", async (req, res) => {
  try {
    const [item] = await db.update(filiaisTable).set(req.body)
      .where(eq(filiaisTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/filiais/:id", async (req, res) => {
  try {
    await db.delete(filiaisTable).where(eq(filiaisTable.id, parseInt(req.params.id)));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
