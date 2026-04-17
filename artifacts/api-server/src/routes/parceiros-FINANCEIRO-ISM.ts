import { Router } from "express";
import { db } from "@workspace/db";
import { parceirosTable } from "@workspace/db/schema";
import { eq, ilike, and, count } from "drizzle-orm";

const router = Router();

router.get("/parceiros", async (req, res) => {
  try {
    const conditions = [];
    if (req.query.search) conditions.push(ilike(parceirosTable.nome, `%${req.query.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // ?all=true para dropdowns (sem paginação)
    if (req.query.all === "true") {
      const items = await db.select().from(parceirosTable).where(where).orderBy(parceirosTable.nome);
      return res.json(items);
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = (page - 1) * limit;

    const [totalResult] = await db.select({ count: count() }).from(parceirosTable).where(where);
    const items = await db.select().from(parceirosTable).where(where).limit(limit).offset(offset).orderBy(parceirosTable.nome);

    res.json({ data: items, total: totalResult.count, page, limit });
  } catch (e) {
    res.status(500).json({ error: String(e) });
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
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/parceiros/:id", async (req, res) => {
  try {
    const [item] = await db.select().from(parceirosTable).where(eq(parceirosTable.id, parseInt(req.params.id)));
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/parceiros/:id", async (req, res) => {
  try {
    const [item] = await db.update(parceirosTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(parceirosTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/parceiros/:id", async (req, res) => {
  try {
    await db.delete(parceirosTable).where(eq(parceirosTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
