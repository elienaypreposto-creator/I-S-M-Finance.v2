import { Router } from "express";
import { and, desc, eq, gte, ilike, inArray, lte, lt, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { lancamentosTable, parceirosTable, planoContasTable } from "@workspace/db/schema";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();
const STATUS_ABERTO = ["pendente", "atrasado"] as const;
const STATUS_QUITADO = ["pago", "recebido"] as const;

const toDate = (value: Date) => value.toISOString().split("T")[0];
const toNumber = (value: unknown) => Number(value ?? 0);

const resolveTabFilter = (tab: string | undefined) => {
  if (tab === "proximos_vencer") return "proximos_vencer";
  return "vencidos";
};

router.get("/dashboard/kpis", async (_req, res) => {
  try {
    const hoje = toDate(new Date());
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const fimMes = new Date(inicioMes.getFullYear(), inicioMes.getMonth() + 1, 0);

    const [totais] = await db
      .select({
        contas_receber_atraso: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CR' and ${lancamentosTable.vencimento} < ${hoje} and ${lancamentosTable.status} = any(${sql.raw("ARRAY['pendente','atrasado']")}) then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
        contas_receber_aberto_mes: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CR' and ${lancamentosTable.vencimento} between ${toDate(inicioMes)} and ${toDate(fimMes)} and ${lancamentosTable.status} = any(${sql.raw("ARRAY['pendente','atrasado']")}) then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
        contas_pagar_aberto_mes: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CP' and ${lancamentosTable.vencimento} between ${toDate(inicioMes)} and ${toDate(fimMes)} and ${lancamentosTable.status} = any(${sql.raw("ARRAY['pendente','atrasado']")}) then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
        contas_pagar_atraso: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CP' and ${lancamentosTable.vencimento} < ${hoje} and ${lancamentosTable.status} = any(${sql.raw("ARRAY['pendente','atrasado']")}) then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
      })
      .from(lancamentosTable)
      .where(sql`${lancamentosTable.status} != 'cancelado'`);

    return successResponse(res, {
      contasReceberAtraso: toNumber(totais?.contas_receber_atraso),
      contasReceberAberto: toNumber(totais?.contas_receber_aberto_mes),
      contasPagarAberto: toNumber(totais?.contas_pagar_aberto_mes),
      contasPagarAtraso: toNumber(totais?.contas_pagar_atraso),
    });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular KPIs.", String(e));
  }
});

router.get("/dashboard/projecao-mes", async (_req, res) => {
  try {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const fimMes = new Date(inicioMes.getFullYear(), inicioMes.getMonth() + 1, 0);

    const [projecao] = await db
      .select({
        recebimentos: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CR' then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
        pagamentos: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CP' then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
      })
      .from(lancamentosTable)
      .where(and(
        gte(lancamentosTable.vencimento, toDate(inicioMes)),
        lte(lancamentosTable.vencimento, toDate(fimMes)),
        sql`${lancamentosTable.status} != 'cancelado'`,
      ));

    const pr = toNumber(projecao?.recebimentos);
    const pp = toNumber(projecao?.pagamentos);

    return successResponse(res, {
      projecaoRecebimentos: pr,
      projecaoPagamentos: pp,
      projecaoLucroLiquido: pr - pp,
      totalRecebimentos: pr,
      totalPagamentos: pp,
    });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular projeção mensal.", String(e));
  }
});

router.get("/dashboard/projecao-dias", async (req, res) => {
  try {
    const dias = parseInt(req.query.dias as string) || 30;
    const hoje = new Date();
    const fim = new Date();
    fim.setDate(fim.getDate() + dias);

    const [saldoAtual] = await db
      .select({
        total: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CR' then ${lancamentosTable.valor}::numeric else -${lancamentosTable.valor}::numeric end), 0)`,
      })
      .from(lancamentosTable)
      .where(inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]));

    const movimentos = await db
      .select({
        data: lancamentosTable.vencimento,
        receber: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CR' then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
        pagar: sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CP' then ${lancamentosTable.valor}::numeric else 0 end), 0)`,
      })
      .from(lancamentosTable)
      .where(
        and(
          gte(lancamentosTable.vencimento, toDate(hoje)),
          lte(lancamentosTable.vencimento, toDate(fim)),
          sql`${lancamentosTable.status} != 'cancelado'`,
        ),
      )
      .groupBy(lancamentosTable.vencimento)
      .orderBy(lancamentosTable.vencimento);

    const movimentosMap = new Map(movimentos.map((m) => [m.data, m]));
    const resultado = [];
    let saldoAcumulado = toNumber(saldoAtual?.total);
    for (let i = 0; i < dias; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      const data = toDate(d);
      const mov = movimentosMap.get(data);
      const receber = toNumber(mov?.receber);
      const pagar = toNumber(mov?.pagar);
      saldoAcumulado += receber - pagar;
      resultado.push({ data, saldo: Number(saldoAcumulado.toFixed(2)), receber, pagar });
    }

    return successResponse(res, resultado, { dias });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular projeção diária.", String(e));
  }
});

router.get("/dashboard/inadimplencia-clientes", async (req, res) => {
  try {
    const hoje = toDate(new Date());
    const tab = resolveTabFilter(req.query.tab as string | undefined);
    const limite = parseInt(req.query.limit as string) || 10;
    const janela = new Date();
    janela.setDate(janela.getDate() + 7);

    const whereClause = tab === "proximos_vencer"
      ? and(
        eq(lancamentosTable.tipo, "CR"),
        inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
        gte(lancamentosTable.vencimento, hoje),
        lte(lancamentosTable.vencimento, toDate(janela)),
      )
      : and(
        eq(lancamentosTable.tipo, "CR"),
        inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
        lt(lancamentosTable.vencimento, hoje),
      );

    const items = await db
      .select({
        parceiro_id: parceirosTable.id,
        nome: parceirosTable.nome,
        total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
        maior_dias_atraso: sql<number>`coalesce(max(case when ${lancamentosTable.vencimento} < ${hoje} then (${hoje}::date - ${lancamentosTable.vencimento}::date) else 0 end), 0)`,
        quantidade_titulos: sql<number>`count(*)`,
      })
      .from(lancamentosTable)
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .where(whereClause)
      .groupBy(parceirosTable.id, parceirosTable.nome)
      .orderBy(desc(sql`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`))
      .limit(limite);

    return successResponse(
      res,
      items.map((i) => ({
        parceiro_id: i.parceiro_id ?? 0,
        nome: i.nome ?? "Sem parceiro",
        total: toNumber(i.total),
        quantidade_titulos: toNumber(i.quantidade_titulos),
        maior_dias_atraso: toNumber(i.maior_dias_atraso),
      })),
      { tab, limit: limite },
    );
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular inadimplência de clientes.", String(e));
  }
});

router.get("/dashboard/inadimplencia-fornecedores", async (req, res) => {
  try {
    const hoje = toDate(new Date());
    const tab = resolveTabFilter(req.query.tab as string | undefined);
    const limite = parseInt(req.query.limit as string) || 10;
    const janela = new Date();
    janela.setDate(janela.getDate() + 7);

    const whereClause = tab === "proximos_vencer"
      ? and(
        eq(lancamentosTable.tipo, "CP"),
        inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
        gte(lancamentosTable.vencimento, hoje),
        lte(lancamentosTable.vencimento, toDate(janela)),
      )
      : and(
        eq(lancamentosTable.tipo, "CP"),
        inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
        lt(lancamentosTable.vencimento, hoje),
      );

    const items = await db
      .select({
        parceiro_id: parceirosTable.id,
        nome: parceirosTable.nome,
        total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
        maior_dias_atraso: sql<number>`coalesce(max(case when ${lancamentosTable.vencimento} < ${hoje} then (${hoje}::date - ${lancamentosTable.vencimento}::date) else 0 end), 0)`,
        quantidade_titulos: sql<number>`count(*)`,
      })
      .from(lancamentosTable)
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .where(whereClause)
      .groupBy(parceirosTable.id, parceirosTable.nome)
      .orderBy(desc(sql`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`))
      .limit(limite);

    return successResponse(
      res,
      items.map((i) => ({
        parceiro_id: i.parceiro_id ?? 0,
        nome: i.nome ?? "Sem parceiro",
        total: toNumber(i.total),
        quantidade_titulos: toNumber(i.quantidade_titulos),
        maior_dias_atraso: toNumber(i.maior_dias_atraso),
      })),
      { tab, limit: limite },
    );
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular inadimplência de fornecedores.", String(e));
  }
});

router.get("/dashboard/alertas-atraso", async (req, res) => {
  try {
    const hoje = toDate(new Date());
    const risco = req.query.risco ? String(req.query.risco) : undefined;
    const limite = parseInt(req.query.limit as string) || 50;

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
        riscos: lancamentosTable.riscos,
      })
      .from(lancamentosTable)
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .where(
        and(
          eq(lancamentosTable.tipo, "CP"),
          inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
          lt(lancamentosTable.vencimento, hoje),
          risco ? sql`${lancamentosTable.riscos}::jsonb ? ${risco}` : undefined,
        ),
      )
      .orderBy(desc(lancamentosTable.vencimento))
      .limit(limite);

    const data = items.map((i) => {
      const dias = Math.floor((new Date(hoje).getTime() - new Date(i.vencimento).getTime()) / 86400000);
      return {
        id: i.id,
        nome: i.nome || i.descricao || `Lançamento #${i.id}`,
        dias_atraso: dias,
        valor: toNumber(i.valor),
        riscos: i.riscos ?? [],
      };
    });

    return successResponse(res, data, { risco: risco ?? null, limit: limite });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar alertas de atraso.", String(e));
  }
});

router.get("/dashboard/nivel-risco", async (req, res) => {
  try {
    const hoje = toDate(new Date());
    const agrupado = await db
      .select({
        risco: sql<string>`jsonb_array_elements_text(${lancamentosTable.riscos}::jsonb)`,
        quantidade: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
      })
      .from(lancamentosTable)
      .where(
        and(
          lt(lancamentosTable.vencimento, hoje),
          eq(lancamentosTable.tipo, "CP"),
          inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
          sql`jsonb_array_length(${lancamentosTable.riscos}::jsonb) > 0`,
        )
      )
      .groupBy(sql`jsonb_array_elements_text(${lancamentosTable.riscos}::jsonb)`)
      .orderBy(desc(sql`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`));

    return successResponse(res, agrupado.map((r) => ({
      risco: r.risco,
      quantidade: toNumber(r.quantidade),
      valor_total: toNumber(r.total),
    })));
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular nível de risco.", String(e));
  }
});

router.get("/dashboard/fluxo-caixa-mensal", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

    const rows = await db
      .select({
        mes: sql<number>`extract(month from ${lancamentosTable.data_quitacao}::date)`,
        tipo: lancamentosTable.tipo,
        total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
      })
      .from(lancamentosTable)
      .where(
        and(
          sql`extract(year from ${lancamentosTable.data_quitacao}::date) = ${ano}`,
          inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
        )
      )
      .groupBy(
        sql`extract(month from ${lancamentosTable.data_quitacao}::date)`,
        lancamentosTable.tipo
      )
      .orderBy(sql`extract(month from ${lancamentosTable.data_quitacao}::date)`);

    const resultado = meses.map((mes, idx) => {
      const mesNum = idx + 1;
      const entradas = rows.find(r => Number(r.mes) === mesNum && r.tipo === "CR")?.total ?? 0;
      const saidas = rows.find(r => Number(r.mes) === mesNum && r.tipo === "CP")?.total ?? 0;
      return { mes, entradas: toNumber(entradas), saidas: toNumber(saidas) };
    });

    return successResponse(res, resultado, { ano });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no fluxo de caixa mensal do dashboard.", String(e));
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

    return successResponse(res, result);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao consolidar saídas por plano de contas.", String(e));
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

    return successResponse(res, result);
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao consolidar entradas por plano de contas.", String(e));
  }
});

export default router;
