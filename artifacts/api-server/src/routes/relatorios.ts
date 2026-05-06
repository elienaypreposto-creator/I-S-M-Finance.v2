import { Router } from "express";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { contasBancariasTable, lancamentosTable, metasTable, parceirosTable, planoContasTable } from "@workspace/db/schema";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();
const STATUS_QUITADO = ["pago", "recebido"] as const;
const toNumber = (value: unknown) => Number(value ?? 0);
const monthKey = (month: number) => String(month).padStart(2, "0");
const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

router.get("/relatorios/fechamento-mensal", async (req, res) => {
  try {
    const mes = parseInt(req.query.mes as string);
    const ano = parseInt(req.query.ano as string);
    const mesStr = String(mes).padStart(2, "0");
    const dataInicio = `${ano}-${mesStr}-01`;
    const dataFim = new Date(ano, mes, 0).toISOString().split("T")[0];

    const [totalCR] = await db.select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(eq(lancamentosTable.tipo, "CR"), gte(lancamentosTable.vencimento, dataInicio), lte(lancamentosTable.vencimento, dataFim)));

    const [totalCP] = await db.select({ total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)` })
      .from(lancamentosTable)
      .where(and(eq(lancamentosTable.tipo, "CP"), gte(lancamentosTable.vencimento, dataInicio), lte(lancamentosTable.vencimento, dataFim)));

    const metas = await db.select().from(metasTable).where(and(eq(metasTable.ano, ano), eq(metasTable.mes, mes)));
    const planejadoReceber = metas.reduce((acc, m) => acc + Number(m.valor_projetado), 0);

    return successResponse(res, {
      mes,
      ano,
      planejado_receber: planejadoReceber,
      realizado_receber: toNumber(totalCR?.total),
      planejado_gastar: planejadoReceber,
      realizado_gastar: toNumber(totalCP?.total),
    });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar fechamento mensal.", String(e));
  }
});

router.get("/relatorios/dre", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
    const regime = (req.query.regime as string) === "caixa" ? "caixa" : "competencia";
    const dateColumn = regime === "caixa" ? lancamentosTable.data_quitacao : lancamentosTable.vencimento;

    const whereBase = regime === "caixa"
      ? and(sql`extract(year from ${dateColumn}::date) = ${ano}`, inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]))
      : and(sql`extract(year from ${dateColumn}::date) = ${ano}`, sql`${lancamentosTable.status} != 'cancelado'`);

    const rows = await db
      .select({
        mes: sql<number>`extract(month from ${dateColumn}::date)`,
        tipo: lancamentosTable.tipo,
        categoria: planoContasTable.categoria,
        total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
      })
      .from(lancamentosTable)
      .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
      .where(whereBase)
      .groupBy(sql`extract(month from ${dateColumn}::date)`, lancamentosTable.tipo, planoContasTable.categoria);

    const receitaBruta = new Map<number, number>();
    const impostos = new Map<number, number>();
    const custos = new Map<number, number>();
    const despesas = new Map<number, number>();

    for (const row of rows) {
      const m = Number(row.mes);
      const valor = toNumber(row.total);
      const categoria = (row.categoria ?? "").toLowerCase();
      if (row.tipo === "CR") receitaBruta.set(m, (receitaBruta.get(m) ?? 0) + valor);
      else if (categoria.includes("imposto")) impostos.set(m, (impostos.get(m) ?? 0) + valor);
      else if (categoria.includes("custo")) custos.set(m, (custos.get(m) ?? 0) + valor);
      else despesas.set(m, (despesas.get(m) ?? 0) + valor);
    }

    const montarLinha = (codigo: string, descricao: string, formula: (m: number) => number) => {
      const valores: Record<string, number> = {};
      let total = 0;
      for (let m = 1; m <= 12; m++) {
        const v = Number(formula(m).toFixed(2));
        valores[monthKey(m)] = v;
        total += v;
      }
      return { codigo, descricao, valores, total: Number(total.toFixed(2)) };
    };

    const linhas = [
      montarLinha("1", "RECEITA BRUTA DE SERVIÇOS", (m) => receitaBruta.get(m) ?? 0),
      montarLinha("2", "(-) IMPOSTOS", (m) => -(impostos.get(m) ?? 0)),
      montarLinha("3", "RECEITA LÍQUIDA", (m) => (receitaBruta.get(m) ?? 0) - (impostos.get(m) ?? 0)),
      montarLinha("4", "(-) CUSTO DOS SERVIÇOS PRESTADOS", (m) => -(custos.get(m) ?? 0)),
      montarLinha("5", "MARGEM DE CONTRIBUIÇÃO", (m) => (receitaBruta.get(m) ?? 0) - (impostos.get(m) ?? 0) - (custos.get(m) ?? 0)),
      montarLinha("6", "(-) DESPESAS OPERACIONAIS", (m) => -(despesas.get(m) ?? 0)),
      montarLinha("7", "LUCRO LÍQUIDO DO PERÍODO", (m) => (receitaBruta.get(m) ?? 0) - (impostos.get(m) ?? 0) - (custos.get(m) ?? 0) - (despesas.get(m) ?? 0)),
    ];

    return successResponse(res, { ano, regime, meses: monthNames, linhas });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar DRE.", String(e));
  }
});

router.get("/relatorios/fluxo-caixa", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i + 1);

    const rows = await db
      .select({
        mes: sql<number>`extract(month from ${lancamentosTable.data_quitacao}::date)`,
        tipo: lancamentosTable.tipo,
        categoria: planoContasTable.categoria,
        transferencia_grupo_id: lancamentosTable.transferencia_grupo_id,
        total: sql<number>`coalesce(sum(${lancamentosTable.valor}::numeric), 0)`,
      })
      .from(lancamentosTable)
      .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
      .where(
        and(
          sql`extract(year from ${lancamentosTable.data_quitacao}::date) = ${ano}`,
          inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
        ),
      )
      .groupBy(sql`extract(month from ${lancamentosTable.data_quitacao}::date)`, lancamentosTable.tipo, planoContasTable.categoria, lancamentosTable.transferencia_grupo_id);

    const entradasPorCategoria = new Map<string, Map<number, number>>();
    const saidasPorCategoria = new Map<string, Map<number, number>>();
    const transferenciasCredito = new Map<number, number>();
    const transferenciasDebito = new Map<number, number>();

    for (const row of rows) {
      const mes = Number(row.mes);
      const valor = toNumber(row.total);
      const categoria = row.categoria ?? "Sem Categoria";
      const ehTransferencia = Boolean(row.transferencia_grupo_id);
      if (ehTransferencia) {
        if (row.tipo === "CR") transferenciasCredito.set(mes, (transferenciasCredito.get(mes) ?? 0) + valor);
        else transferenciasDebito.set(mes, (transferenciasDebito.get(mes) ?? 0) + valor);
        continue;
      }
      const target = row.tipo === "CR" ? entradasPorCategoria : saidasPorCategoria;
      if (!target.has(categoria)) target.set(categoria, new Map());
      const map = target.get(categoria)!;
      map.set(mes, (map.get(mes) ?? 0) + valor);
    }

    const linhaCategoria = (codigo: string, descricao: string, source: Map<number, number>, sinal = 1) => {
      const valores: Record<string, number> = {};
      let total = 0;
      for (const m of meses) {
        const value = Number(((source.get(m) ?? 0) * sinal).toFixed(2));
        valores[monthKey(m)] = value;
        total += value;
      }
      return { codigo, descricao, valores, total: Number(total.toFixed(2)) };
    };

    const entradas = Array.from(entradasPorCategoria.entries()).map(([categoria, map], idx) => linhaCategoria(`E.${idx + 1}`, categoria, map, 1));
    const saidas = Array.from(saidasPorCategoria.entries()).map(([categoria, map], idx) => linhaCategoria(`S.${idx + 1}`, categoria, map, -1));
    const transferenciaCreditoLinha = linhaCategoria("T.1", "Transferências (Créditos)", transferenciasCredito, 1);
    const transferenciaDebitoLinha = linhaCategoria("T.2", "Transferências (Débitos)", transferenciasDebito, -1);

    return successResponse(res, {
      ano,
      meses: monthNames,
      secoes: [
        { titulo: "ENTRADAS", tipo: "entradas", linhas: entradas },
        { titulo: "SAÍDAS", tipo: "saidas", linhas: saidas },
        { titulo: "TRANSFERÊNCIAS", tipo: "transferencias", linhas: [transferenciaCreditoLinha, transferenciaDebitoLinha] },
      ],
    });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar fluxo de caixa.", String(e));
  }
});

router.get("/relatorios/metas", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
    const metas = await db
      .select({
        plano_conta_id: metasTable.plano_conta_id,
        categoria: planoContasTable.categoria,
        mes: metasTable.mes,
        valor_projetado: metasTable.valor_projetado,
      })
      .from(metasTable)
      .leftJoin(planoContasTable, eq(metasTable.plano_conta_id, planoContasTable.id))
      .where(eq(metasTable.ano, ano));

    return successResponse(res, metas.map((m) => ({ ...m, valor_projetado: toNumber(m.valor_projetado) }), { ano }));
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório de metas.", String(e));
  }
});

router.get("/relatorios/contabil-fiscal", async (req, res) => {
  try {
    const { data_inicio, data_fim, conta_id, tipo = "ambos" } = req.query;
    const conditions = [
      inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
      data_inicio ? gte(lancamentosTable.data_quitacao, String(data_inicio)) : undefined,
      data_fim ? lte(lancamentosTable.data_quitacao, String(data_fim)) : undefined,
      conta_id ? eq(lancamentosTable.conta_id, parseInt(String(conta_id))) : undefined,
      tipo !== "ambos" ? eq(lancamentosTable.tipo, String(tipo)) : undefined,
    ].filter(Boolean) as any[];

    const items = await db
      .select({
        conta_bancaria: contasBancariasTable.nome,
        data_pgto: lancamentosTable.data_quitacao,
        descricao: lancamentosTable.descricao,
        nome_parceiro: parceirosTable.nome,
        valor: lancamentosTable.valor,
        categoria: sql<string>`coalesce(${planoContasTable.subcategoria}, ${planoContasTable.categoria}, 'Sem Categoria')`,
        tipo: lancamentosTable.tipo,
      })
      .from(lancamentosTable)
      .leftJoin(contasBancariasTable, eq(lancamentosTable.conta_id, contasBancariasTable.id))
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(lancamentosTable.data_quitacao);

    return successResponse(res, items.map((i) => ({ ...i, valor: toNumber(i.valor) })), { total: items.length });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório contábil/fiscal.", String(e));
  }
});

export default router;
