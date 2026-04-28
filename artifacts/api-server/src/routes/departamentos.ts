import { Router } from "express";
import { db } from "@workspace/db";
import { departamentosTable, centrosCustosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/departamentos", async (_req, res) => {
  try {
    const items = await db.select().from(departamentosTable).orderBy(departamentosTable.nome);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/departamentos", async (req, res) => {
  try {
    const [item] = await db.insert(departamentosTable).values(req.body).returning();
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/departamentos/:id", async (req, res) => {
  try {
    const [item] = await db.update(departamentosTable).set(req.body)
      .where(eq(departamentosTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
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

router.get("/centros-custos", async (_req, res) => {
  try {
    const items = await db.select().from(centrosCustosTable).orderBy(centrosCustosTable.nome);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/centros-custos", async (req, res) => {
  try {
    const [item] = await db.insert(centrosCustosTable).values(req.body).returning();
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/centros-custos/:id", async (req, res) => {
  try {
    const [item] = await db.update(centrosCustosTable).set(req.body)
      .where(eq(centrosCustosTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/centros-custos/:id", async (req, res) => {
  try {
    await db.delete(centrosCustosTable).where(eq(centrosCustosTable.id, parseInt(req.params.id)));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
