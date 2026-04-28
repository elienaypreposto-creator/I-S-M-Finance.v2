import { Router } from "express";
import { db } from "@workspace/db";
import { conciliacoesTable, itensConciliacaoTable, contasBancariasTable, lancamentosTable } from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";

const router = Router();

router.get("/conciliacoes", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (req.query.status) conditions.push(eq(conciliacoesTable.status, req.query.status as string));
    if (req.query.conta_id) conditions.push(eq(conciliacoesTable.conta_id, parseInt(req.query.conta_id as string)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(conciliacoesTable).where(where);
    const items = await db
      .select({
        id: conciliacoesTable.id,
        conta_id: conciliacoesTable.conta_id,
        conta_nome: contasBancariasTable.nome,
        conta_banco: contasBancariasTable.banco,
        conta_agencia: contasBancariasTable.agencia,
        conta_numero: contasBancariasTable.conta,
        periodo_inicio: conciliacoesTable.periodo_inicio,
        periodo_fim: conciliacoesTable.periodo_fim,
        status: conciliacoesTable.status,
        arquivo_nome: conciliacoesTable.arquivo_nome,
        created_at: conciliacoesTable.created_at,
      })
      .from(conciliacoesTable)
      .leftJoin(contasBancariasTable, eq(conciliacoesTable.conta_id, contasBancariasTable.id))
      .where(where)
      .orderBy(conciliacoesTable.created_at)
      .limit(limit)
      .offset(offset);

    // Get counts per conciliacao
    const result = await Promise.all(items.map(async (item) => {
      const itens = await db.select({ status: itensConciliacaoTable.status, cnt: count() })
        .from(itensConciliacaoTable)
        .where(eq(itensConciliacaoTable.conciliacao_id, item.id))
        .groupBy(itensConciliacaoTable.status);

      const conciliados = itens.find(i => i.status === "vinculado")?.cnt ?? 0;
      const ignorados = itens.find(i => i.status === "ignorado")?.cnt ?? 0;
      const pendentes = itens.find(i => i.status === "pendente")?.cnt ?? 0;
      const total = conciliados + ignorados + pendentes;

      return { ...item, conciliados, ignorados, pendentes, total };
    }));

    return res.json({ data: result, total: totalResult.count, page, limit });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/conciliacoes/importar", async (req, res) => {
  try {
    const { conta_id } = req.body;
    const [item] = await db.insert(conciliacoesTable).values({
      conta_id: parseInt(conta_id),
      status: "pendente",
      arquivo_nome: "arquivo.ofx",
    }).returning();

    // Create sample items
    const sampleItens = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      sampleItens.push({
        conciliacao_id: item.id,
        valor_extrato: String((Math.random() * 10000 + 100).toFixed(2)),
        status: "pendente" as const,
        tipo_extrato: i % 2 === 0 ? "debito" : "credito",
        descricao: i % 2 === 0 ? `DÉBITO PIX - Pagamento ${i + 1}` : `CRÉDITO TED - Recebimento ${i + 1}`,
        data: d.toISOString().split("T")[0],
      });
    }
    await db.insert(itensConciliacaoTable).values(sampleItens);

    return res.status(201).json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/conciliacoes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [conciliacao] = await db
      .select({
        id: conciliacoesTable.id,
        conta_id: conciliacoesTable.conta_id,
        conta_nome: contasBancariasTable.nome,
        conta_banco: contasBancariasTable.banco,
        conta_agencia: contasBancariasTable.agencia,
        conta_numero: contasBancariasTable.conta,
        periodo_inicio: conciliacoesTable.periodo_inicio,
        periodo_fim: conciliacoesTable.periodo_fim,
        status: conciliacoesTable.status,
        created_at: conciliacoesTable.created_at,
      })
      .from(conciliacoesTable)
      .leftJoin(contasBancariasTable, eq(conciliacoesTable.conta_id, contasBancariasTable.id))
      .where(eq(conciliacoesTable.id, id));

    if (!conciliacao) return res.status(404).json({ error: "Not found" });

    const itens = await db.select().from(itensConciliacaoTable).where(eq(itensConciliacaoTable.conciliacao_id, id));

    const conciliados = itens.filter(i => i.status === "vinculado").length;
    const ignorados = itens.filter(i => i.status === "ignorado").length;
    const pendentes = itens.filter(i => i.status === "pendente").length;

    return res.json({
      conciliacao: {
        ...conciliacao,
        conciliados,
        ignorados,
        pendentes,
        total: itens.length,
      },
      itens: itens.map(i => ({ ...i, valor_extrato: Number(i.valor_extrato), desconto: Number(i.desconto ?? 0), acrescimo: Number(i.acrescimo ?? 0) })),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/conciliacoes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(itensConciliacaoTable).where(eq(itensConciliacaoTable.conciliacao_id, id));
    await db.delete(conciliacoesTable).where(eq(conciliacoesTable.id, id));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/conciliacoes/:id/conciliar", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pendentes = await db.select().from(itensConciliacaoTable)
      .where(and(eq(itensConciliacaoTable.conciliacao_id, id), eq(itensConciliacaoTable.status, "pendente")));

    const status = pendentes.length === 0 ? "conciliado" : "pendente";
    const [item] = await db.update(conciliacoesTable).set({ status, updated_at: new Date() })
      .where(eq(conciliacoesTable.id, id)).returning();
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/conciliacoes/:id/itens/:itemId/ignorar", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const [item] = await db.update(itensConciliacaoTable).set({ status: "ignorado", updated_at: new Date() })
      .where(eq(itensConciliacaoTable.id, itemId)).returning();
    res.json({ ...item, valor_extrato: Number(item.valor_extrato) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/conciliacoes/:id/itens/:itemId/vincular", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { lancamento_ids, desconto, acrescimo } = req.body;
    const lancamento_id = lancamento_ids?.[0];

    const [item] = await db.update(itensConciliacaoTable).set({
      status: "vinculado",
      lancamento_id: lancamento_id || null,
      desconto: String(desconto ?? 0),
      acrescimo: String(acrescimo ?? 0),
      updated_at: new Date(),
    }).where(eq(itensConciliacaoTable.id, itemId)).returning();

    if (lancamento_id) {
      const originalItem = await db.select().from(itensConciliacaoTable).where(eq(itensConciliacaoTable.id, itemId));
      const tipo_extrato = originalItem[0]?.tipo_extrato;
      await db.update(lancamentosTable).set({
        status: tipo_extrato === "credito" ? "recebido" : "pago",
        updated_at: new Date(),
      }).where(eq(lancamentosTable.id, lancamento_id));
    }

    res.json({ ...item, valor_extrato: Number(item.valor_extrato) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
