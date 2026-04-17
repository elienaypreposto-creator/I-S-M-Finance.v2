import { Router } from "express";
import { db } from "@workspace/db";
import { lancamentosTable, parceirosTable, contasBancariasTable, planoContasTable, departamentosTable, centrosCustosTable } from "@workspace/db/schema";
import { sql, and, eq, gte, lte, ilike, count } from "drizzle-orm";

const router = Router();

router.get("/lancamentos", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (req.query.tipo) conditions.push(eq(lancamentosTable.tipo, req.query.tipo as string));
    if (req.query.status) conditions.push(eq(lancamentosTable.status, req.query.status as string));
    if (req.query.conta_id) conditions.push(eq(lancamentosTable.conta_id, parseInt(req.query.conta_id as string)));
    if (req.query.parceiro_id) conditions.push(eq(lancamentosTable.parceiro_id, parseInt(req.query.parceiro_id as string)));
    if (req.query.data_inicio) conditions.push(gte(lancamentosTable.vencimento, req.query.data_inicio as string));
    if (req.query.data_fim) conditions.push(lte(lancamentosTable.vencimento, req.query.data_fim as string));
    if (req.query.search) conditions.push(ilike(lancamentosTable.descricao, `%${req.query.search}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(lancamentosTable).where(where);

    const items = await db
      .select({
        id: lancamentosTable.id,
        tipo: lancamentosTable.tipo,
        vencimento: lancamentosTable.vencimento,
        competencia: lancamentosTable.competencia,
        conta_id: lancamentosTable.conta_id,
        conta_nome: contasBancariasTable.nome,
        parceiro_id: lancamentosTable.parceiro_id,
        parceiro_nome: parceirosTable.nome,
        descricao: lancamentosTable.descricao,
        valor: lancamentosTable.valor,
        status: lancamentosTable.status,
        plano_conta_id: lancamentosTable.plano_conta_id,
        plano_conta_nome: planoContasTable.subcategoria,
        departamento_id: lancamentosTable.departamento_id,
        departamento_nome: departamentosTable.nome,
        centro_custo_id: lancamentosTable.centro_custo_id,
        centro_custo_nome: centrosCustosTable.nome,
        parcela_atual: lancamentosTable.parcela_atual,
        total_parcelas: lancamentosTable.total_parcelas,
        riscos: lancamentosTable.riscos,
        created_at: lancamentosTable.created_at,
      })
      .from(lancamentosTable)
      .leftJoin(contasBancariasTable, eq(lancamentosTable.conta_id, contasBancariasTable.id))
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
      .leftJoin(departamentosTable, eq(lancamentosTable.departamento_id, departamentosTable.id))
      .leftJoin(centrosCustosTable, eq(lancamentosTable.centro_custo_id, centrosCustosTable.id))
      .where(where)
      .orderBy(lancamentosTable.vencimento)
      .limit(limit)
      .offset(offset);

    res.json({
      data: items.map(i => ({ ...i, valor: Number(i.valor) })),
      total: totalResult.count,
      page,
      limit,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/lancamentos", async (req, res) => {
  try {
    const { tipo, vencimento, competencia, conta_id, parceiro_id, descricao, valor, status, plano_conta_id, departamento_id, centro_custo_id, parcela_atual, total_parcelas, riscos } = req.body;
    const [item] = await db.insert(lancamentosTable).values({
      tipo, vencimento, competencia, conta_id, parceiro_id, descricao,
      valor: String(valor), status: status || "pendente",
      plano_conta_id, departamento_id, centro_custo_id,
      parcela_atual: parcela_atual || 1,
      total_parcelas: total_parcelas || 1,
      riscos: riscos || [],
    }).returning();
    res.status(201).json({ ...item, valor: Number(item.valor) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/lancamentos/:id", async (req, res) => {
  try {
    const [item] = await db.select().from(lancamentosTable).where(eq(lancamentosTable.id, parseInt(req.params.id)));
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ...item, valor: Number(item.valor) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/lancamentos/:id", async (req, res) => {
  try {
    const { valor, ...rest } = req.body;
    const updateData = valor !== undefined ? { ...rest, valor: String(valor) } : rest;
    const [item] = await db.update(lancamentosTable).set({ ...updateData, updated_at: new Date() })
      .where(eq(lancamentosTable.id, parseInt(req.params.id))).returning();
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ...item, valor: Number(item.valor) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/lancamentos/:id", async (req, res) => {
  try {
    await db.delete(lancamentosTable).where(eq(lancamentosTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
