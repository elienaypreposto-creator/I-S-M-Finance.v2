import { Router } from "express";
import { db } from "@workspace/db";
import { metasTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/metas", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string);
    if (!ano) return res.status(400).json({ error: "ano is required" });
    const items = await db.select().from(metasTable).where(eq(metasTable.ano, ano));
    return res.json(items.map(i => ({ ...i, valor_projetado: Number(i.valor_projetado) })));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/metas", async (req, res) => {
  try {
    const { plano_conta_id, ano, mes, valor_projetado } = req.body;
    const existing = await db.select().from(metasTable)
      .where(and(eq(metasTable.plano_conta_id, plano_conta_id), eq(metasTable.ano, ano), eq(metasTable.mes, mes)));

    let item;
    if (existing.length > 0) {
      [item] = await db.update(metasTable).set({ valor_projetado: String(valor_projetado), updated_at: new Date() })
        .where(eq(metasTable.id, existing[0].id)).returning();
    } else {
      [item] = await db.insert(metasTable).values({ plano_conta_id, ano, mes, valor_projetado: String(valor_projetado) }).returning();
    }
    return res.json({ ...item, valor_projetado: Number(item.valor_projetado) });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
