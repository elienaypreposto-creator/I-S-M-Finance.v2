import { Router } from "express";
import { db } from "@workspace/db";
import { contasBancariasTable, lancamentosTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/contas-bancarias", async (req, res) => {
  try {
    const items = await db
      .select({
        id: contasBancariasTable.id,
        nome: contasBancariasTable.nome,
        banco: contasBancariasTable.banco,
        agencia: contasBancariasTable.agencia,
        conta: contasBancariasTable.conta,
        tipo: contasBancariasTable.tipo,
        status: contasBancariasTable.status,
        cor: contasBancariasTable.cor,
        saldo_inicial: sql<number>`coalesce(${contasBancariasTable.saldo_inicial}::numeric, 0)`,
        saldo_atual: sql<number>`coalesce(${contasBancariasTable.saldo_inicial}::numeric, 0) + coalesce(sum(case when ${lancamentosTable.tipo} = 'CR' then ${lancamentosTable.valor}::numeric else -${lancamentosTable.valor}::numeric end), 0)`
      })
      .from(contasBancariasTable)
      .leftJoin(lancamentosTable, and(eq(lancamentosTable.conta_id, contasBancariasTable.id), sql`${lancamentosTable.status} IN ('pago', 'recebido')`))
      .groupBy(contasBancariasTable.id)
      .orderBy(contasBancariasTable.nome);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/contas-bancarias", async (req, res) => {
  try {
    const { saldo_inicial, ...rest } = req.body;
    const [item] = await db.insert(contasBancariasTable).values({
      ...rest,
      saldo_inicial: saldo_inicial !== undefined ? String(saldo_inicial) : "0",
    }).returning();
    res.status(201).json({ ...item, saldo_inicial: Number(item.saldo_inicial ?? 0) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/contas-bancarias/:id", async (req, res) => {
  try {
    const [item] = await db.update(contasBancariasTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(contasBancariasTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json({ ...item, saldo_inicial: Number(item.saldo_inicial ?? 0) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/contas-bancarias/:id", async (req, res) => {
  try {
    await db.delete(contasBancariasTable).where(eq(contasBancariasTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
