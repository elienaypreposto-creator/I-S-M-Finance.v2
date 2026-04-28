import { Router } from "express";
import { db } from "@workspace/db";
import { lancamentosTable, parceirosTable, planoContasTable } from "@workspace/db/schema";
import { sql, and, gte, lte, eq, lt } from "drizzle-orm";

const router = Router();

router.get("/dashboard/kpis", async (_req, res) => {
  try {
    const hoje = new Date().toISOString().split("T")[0];

    const [contasReceberAtraso] = await db
      .select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(eq(lancamentosTable.tipo, "CR"), lt(lancamentosTable.vencimento, hoje), sql`${lancamentosTable.status} IN ('pendente', 'atrasado')`));

    const mesInicio = new Date();
    mesInicio.setDate(1);
    const mesFim = new Date(mesInicio.getFullYear(), mesInicio.getMonth() + 1, 0);

    const [contasReceberAberto] = await db
      .select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(
        eq(lancamentosTable.tipo, "CR"),
        sql`${lancamentosTable.status} IN ('pendente')`,
        gte(lancamentosTable.vencimento, mesInicio.toISOString().split("T")[0]),
        lte(lancamentosTable.vencimento, mesFim.toISOString().split("T")[0])
      ));

    const [contasPagarAberto] = await db
      .select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(
        eq(lancamentosTable.tipo, "CP"),
        sql`${lancamentosTable.status} IN ('pendente')`,
        gte(lancamentosTable.vencimento, mesInicio.toISOString().split("T")[0]),
        lte(lancamentosTable.vencimento, mesFim.toISOString().split("T")[0])
      ));

    const [contasPagarAtraso] = await db
      .select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(eq(lancamentosTable.tipo, "CP"), lt(lancamentosTable.vencimento, hoje), sql`${lancamentosTable.status} IN ('pendente', 'atrasado')`));

    return res.json({
      contasReceberAtraso: Number(contasReceberAtraso?.total ?? 0),
      contasReceberAberto: Number(contasReceberAberto?.total ?? 0),
      contasPagarAberto: Number(contasPagarAberto?.total ?? 0),
      contasPagarAtraso: Number(contasPagarAtraso?.total ?? 0),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/projecao-mes", async (_req, res) => {
  try {
    const mesInicio = new Date();
    mesInicio.setDate(1);
    const mesFim = new Date(mesInicio.getFullYear(), mesInicio.getMonth() + 1, 0);

    const [projecaoRecebimentos] = await db
      .select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(
        eq(lancamentosTable.tipo, "CR"),
        gte(lancamentosTable.vencimento, mesInicio.toISOString().split("T")[0]),
        lte(lancamentosTable.vencimento, mesFim.toISOString().split("T")[0])
      ));

    const [projecaoPagamentos] = await db
      .select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(
        eq(lancamentosTable.tipo, "CP"),
        gte(lancamentosTable.vencimento, mesInicio.toISOString().split("T")[0]),
        lte(lancamentosTable.vencimento, mesFim.toISOString().split("T")[0])
      ));

    const pr = Number(projecaoRecebimentos?.total ?? 0);
    const pp = Number(projecaoPagamentos?.total ?? 0);

    return res.json({
      projecaoRecebimentos: pr,
      projecaoPagamentos: pp,
      projecaoLucroLiquido: pr - pp,
      totalRecebimentos: pr,
      totalPagamentos: pp,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/projecao-dias", async (req, res) => {
  try {
    const dias = parseInt(req.query.dias as string) || 30;
    const resultado = [];
    
    // Pega o saldo atual das contas
    const [saldoAtual] = await db
      .select({ total: sql<number>`coalesce(sum(case when tipo = 'CR' then ${lancamentosTable.valor}::numeric else -${lancamentosTable.valor}::numeric end), 0)` })
      .from(lancamentosTable)
      .where(sql`${lancamentosTable.status} IN ('pago', 'recebido')`);

    let saldoAcumulado = Number(saldoAtual?.total ?? 0);

    for (let i = 0; i < dias; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];

      const [movimentos] = await db
        .select({
          receber: sql<number>`coalesce(sum(case when tipo = 'CR' then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
          pagar: sql<number>`coalesce(sum(case when tipo = 'CP' then ${lancamentosTable.valor}::numeric else 0 end), 0)`
        })
        .from(lancamentosTable)
        .where(and(eq(lancamentosTable.vencimento, dateStr), sql`${lancamentosTable.status} NOT IN ('cancelado')`));

      const r = Number(movimentos?.receber ?? 0);
      const p = Number(movimentos?.pagar ?? 0);
      saldoAcumulado += (r - p);

      resultado.push({
        data: dateStr,
        saldo: saldoAcumulado,
        receber: r,
        pagar: p,
      });
    }
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/inadimplencia-clientes", async (req, res) => {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const tab = req.query.tab as string || "inadimplente";

    let whereClause;
    if (tab === "vencidos") {
      whereClause = and(eq(lancamentosTable.tipo, "CR"), lt(lancamentosTable.vencimento, hoje), sql`${lancamentosTable.status} IN ('pendente', 'atrasado')`);
    } else if (tab === "proximos_vencer") {
      const proximos = new Date();
      proximos.setDate(proximos.getDate() + 7);
      whereClause = and(eq(lancamentosTable.tipo, "CR"), gte(lancamentosTable.vencimento, hoje), lte(lancamentosTable.vencimento, proximos.toISOString().split("T")[0]), sql`${lancamentosTable.status} IN ('pendente')`);
    } else {
      whereClause = and(eq(lancamentosTable.tipo, "CR"), lt(lancamentosTable.vencimento, hoje), sql`${lancamentosTable.status} IN ('pendente', 'atrasado')`);
    }

    const items = await db
      .select({
        id: parceirosTable.id,
        nome: parceirosTable.nome,
        valor: sql<number>`sum(${lancamentosTable.valor}::numeric)`,
        vencimento: lancamentosTable.vencimento,
      })
      .from(lancamentosTable)
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .where(whereClause)
      .groupBy(parceirosTable.id, parceirosTable.nome, lancamentosTable.vencimento)
      .limit(50);

    res.json(items.map(i => ({
      id: i.id ?? 0,
      nome: i.nome ?? "Sem parceiro",
      valor: Number(i.valor ?? 0),
      vencimento: i.vencimento ?? "",
    })));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/inadimplencia-fornecedores", async (req, res) => {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const tab = req.query.tab as string || "inadimplente";

    let whereClause;
    if (tab === "vencidos") {
      whereClause = and(eq(lancamentosTable.tipo, "CP"), lt(lancamentosTable.vencimento, hoje), sql`${lancamentosTable.status} IN ('pendente', 'atrasado')`);
    } else if (tab === "proximos_vencer") {
      const proximos = new Date();
      proximos.setDate(proximos.getDate() + 7);
      whereClause = and(eq(lancamentosTable.tipo, "CP"), gte(lancamentosTable.vencimento, hoje), lte(lancamentosTable.vencimento, proximos.toISOString().split("T")[0]), sql`${lancamentosTable.status} IN ('pendente')`);
    } else {
      whereClause = and(eq(lancamentosTable.tipo, "CP"), lt(lancamentosTable.vencimento, hoje), sql`${lancamentosTable.status} IN ('pendente', 'atrasado')`);
    }

    const items = await db
      .select({
        id: parceirosTable.id,
        nome: parceirosTable.nome,
        valor: sql<number>`sum(${lancamentosTable.valor}::numeric)`,
        vencimento: lancamentosTable.vencimento,
      })
      .from(lancamentosTable)
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .where(whereClause)
      .groupBy(parceirosTable.id, parceirosTable.nome, lancamentosTable.vencimento)
      .limit(50);

    res.json(items.map(i => ({
      id: i.id ?? 0,
      nome: i.nome ?? "Sem parceiro",
      valor: Number(i.valor ?? 0),
      vencimento: i.vencimento ?? "",
    })));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/dias-atraso", async (_req, res) => {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const items = await db
      .select({
        id: lancamentosTable.id,
        descricao: lancamentosTable.descricao,
        vencimento: lancamentosTable.vencimento,
        valor: lancamentosTable.valor,
        nome: parceirosTable.nome,
      })
      .from(lancamentosTable)
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .where(and(lt(lancamentosTable.vencimento, hoje), sql`${lancamentosTable.status} IN ('pendente', 'atrasado')`))
      .limit(50);

    return res.json(items.map(i => ({
      nome: i.nome || i.descricao || `Lançamento #${i.id}`,
      dias: Math.floor((new Date(hoje).getTime() - new Date(i.vencimento).getTime()) / 86400000),
      valor: Number(i.valor ?? 0),
    })));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/nivel-risco", async (_req, res) => {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const items = await db
      .select({
        id: lancamentosTable.id,
        tipo: lancamentosTable.tipo,
        vencimento: lancamentosTable.vencimento,
        valor: lancamentosTable.valor,
        riscos: lancamentosTable.riscos,
        nome: parceirosTable.nome,
        descricao: lancamentosTable.descricao,
      })
      .from(lancamentosTable)
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .where(
        and(
          lt(lancamentosTable.vencimento, hoje),
          eq(lancamentosTable.tipo, "CP"),
          sql`${lancamentosTable.status} NOT IN ('cancelado', 'recebido')`
        )
      )
      .limit(50);

    return res.json(items.map(i => ({
      id: i.id,
      tipo: i.tipo,
      nome: i.nome || i.descricao || `Lançamento #${i.id}`,
      dias: Math.floor((new Date(hoje).getTime() - new Date(i.vencimento).getTime()) / 86400000),
      valor: Number(i.valor ?? 0),
      riscos: i.riscos ?? [],
    })));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/fluxo-caixa-mensal", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    const rows = await db
      .select({
        mes: sql<number>`extract(month from ${lancamentosTable.vencimento}::date)`,
        tipo: lancamentosTable.tipo,
        total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
      })
      .from(lancamentosTable)
      .where(
        and(
          sql`extract(year from ${lancamentosTable.vencimento}::date) = ${ano}`,
          eq(lancamentosTable.status, sql`ANY(ARRAY['pago','recebido'])`)
        )
      )
      .groupBy(
        sql`extract(month from ${lancamentosTable.vencimento}::date)`,
        lancamentosTable.tipo
      )
      .orderBy(sql`extract(month from ${lancamentosTable.vencimento}::date)`);

    const resultado = meses.map((mes, idx) => {
      const mesNum = idx + 1;
      const entradas = rows.find(r => Number(r.mes) === mesNum && r.tipo === "CR")?.total ?? 0;
      const saidas = rows.find(r => Number(r.mes) === mesNum && r.tipo === "CP")?.total ?? 0;
      return { mes, entradas: Number(entradas), saidas: Number(saidas) };
    });

    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/saidas-plano-contas", async (_req, res) => {
  try {
    const rows = await db
      .select({
        categoria: planoContasTable.categoria,
        valor: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
      })
      .from(lancamentosTable)
      .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
      .where(eq(lancamentosTable.tipo, "CP"))
      .groupBy(planoContasTable.categoria)
      .orderBy(sql`sum(${lancamentosTable.valor}::numeric) desc`)
      .limit(6);

    const total = rows.reduce((acc, r) => acc + Number(r.valor), 0);
    const result = rows.map(r => ({
      categoria: r.categoria ?? "Sem Categoria",
      valor: Number(r.valor),
      percentual: total > 0 ? Math.round((Number(r.valor) / total) * 100) : 0,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/dashboard/entradas-plano-contas", async (_req, res) => {
  try {
    const rows = await db
      .select({
        categoria: planoContasTable.categoria,
        valor: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
      })
      .from(lancamentosTable)
      .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
      .where(eq(lancamentosTable.tipo, "CR"))
      .groupBy(planoContasTable.categoria)
      .orderBy(sql`sum(${lancamentosTable.valor}::numeric) desc`)
      .limit(6);

    const total = rows.reduce((acc, r) => acc + Number(r.valor), 0);
    const result = rows.map(r => ({
      categoria: r.categoria ?? "Sem Categoria",
      valor: Number(r.valor),
      percentual: total > 0 ? Math.round((Number(r.valor) / total) * 100) : 0,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
