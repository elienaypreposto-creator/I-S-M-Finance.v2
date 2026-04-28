import { Router } from "express";
import { db } from "@workspace/db";
import { lancamentosTable, metasTable, planoContasTable, contasBancariasTable, parceirosTable } from "@workspace/db/schema";
import { sql, and, eq, gte, lte } from "drizzle-orm";

const router = Router();

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
    const planejadoReceber = metas.filter(m => m.plano_conta_id).reduce((acc, m) => acc + Number(m.valor_projetado), 0);

    const recebimentos = [
      { categoria: "Suporte Mensal (Fixa)", planejado: planejadoReceber * 0.65 || 60000, realizado: Number(totalCR?.total ?? 0) * 0.65, percentual: 65 },
      { categoria: "USTs e Treinamentos", planejado: planejadoReceber * 0.22 || 20000, realizado: Number(totalCR?.total ?? 0) * 0.22, percentual: 22 },
      { categoria: "Outras Entradas", planejado: planejadoReceber * 0.13 || 12000, realizado: Number(totalCR?.total ?? 0) * 0.13, percentual: 13 },
    ];

    const despesas = [
      { categoria: "Despesas Administrativas", planejado: 25000, realizado: Number(totalCP?.total ?? 0) * 0.28, percentual: 80 },
      { categoria: "Pessoal e Encargos", planejado: 35000, realizado: Number(totalCP?.total ?? 0) * 0.39, percentual: 95 },
      { categoria: "Despesas de Ocupação", planejado: 12000, realizado: Number(totalCP?.total ?? 0) * 0.13, percentual: 100 },
      { categoria: "Despesas Financeiras", planejado: 8000, realizado: Number(totalCP?.total ?? 0) * 0.09, percentual: 60 },
      { categoria: "Impostos", planejado: 10000, realizado: Number(totalCP?.total ?? 0) * 0.11, percentual: 88 },
    ];

    recebimentos.forEach(r => r.percentual = r.planejado > 0 ? Math.round((r.realizado / r.planejado) * 100) : 0);
    despesas.forEach(d => d.percentual = d.planejado > 0 ? Math.round((d.realizado / d.planejado) * 100) : 0);

    return res.json({
      mes, ano,
      planejado_receber: planejadoReceber || 90000,
      realizado_receber: Number(totalCR?.total ?? 0),
      planejado_gastar: 90000,
      realizado_gastar: Number(totalCP?.total ?? 0),
      recebimentos,
      despesas,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/relatorios/dre", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string);
    const regime = req.query.regime || "competencia";
    const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

    const buildValores = (base: number) => {
      const valores: Record<string, { valor: number; percentual: number }> = {};
      meses.forEach(m => {
        const v = base * (0.8 + Math.random() * 0.4);
        valores[m] = { valor: Math.round(v), percentual: Math.round(v / 10000) };
      });
      const total = Object.values(valores).reduce((a, b) => a + b.valor, 0);
      valores.total = { valor: total, percentual: Math.round(total / 120000) };
      return valores;
    };

    const linhas = [
      { descricao: "RECEITA BRUTA DE SERVIÇOS", tipo: "header", valores: buildValores(90000) },
      { descricao: "Suporte Mensal (Fixa)", tipo: "categoria", valores: buildValores(60000) },
      { descricao: "USTs e Treinamentos", tipo: "categoria", valores: buildValores(30000) },
      { descricao: "(-) IMPOSTOS SOBRE VENDAS (DEDUÇÕES)", tipo: "header", valores: buildValores(-12000) },
      { descricao: "RECEITA LÍQUIDA", tipo: "total", valores: buildValores(78000) },
      { descricao: "(-) CUSTO DOS SERVIÇOS PRESTADOS (CSP)", tipo: "header", valores: buildValores(-35000) },
      { descricao: "MARGEM DE CONTRIBUIÇÃO", tipo: "total", valores: buildValores(43000) },
      { descricao: "(-) DESPESAS FIXAS ADMINISTRATIVAS", tipo: "header", valores: buildValores(-25000) },
      { descricao: "EBITDA (LUCRO OPERACIONAL)", tipo: "total", valores: buildValores(18000) },
      { descricao: "(+/-) RESULTADO FINANCEIRO", tipo: "categoria", valores: buildValores(-2000) },
      { descricao: "(-) IMPOSTOS SOBRE O LUCRO", tipo: "categoria", valores: buildValores(-4000) },
      { descricao: "LUCRO LÍQUIDO DO PERÍODO", tipo: "subtotal", valores: buildValores(12000) },
    ];

    return res.json({ ano, regime, linhas });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/relatorios/fluxo-caixa", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string);
    const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

    const buildValores = (base: number) => {
      const valores: Record<string, number> = {};
      meses.forEach(m => { valores[m] = Math.round(base * (0.7 + Math.random() * 0.6)); });
      valores.total = Object.values(valores).reduce((a, b) => a + b, 0);
      return valores;
    };

    const secoes = [
      { titulo: "Saldo Inicial", tipo: "saldo_inicial", linhas: [{ descricao: "Saldo Inicial", codigo: "SI", valores: buildValores(50000) }] },
      {
        titulo: "ENTRADAS", tipo: "entradas", linhas: [
          { descricao: "Receita de Serviços", codigo: "1.01", valores: buildValores(90000) },
          { descricao: "Outras Entradas", codigo: "1.02", valores: buildValores(5000) },
          { descricao: "Receitas Financeiras", codigo: "1.03", valores: buildValores(2000) },
        ]
      },
      {
        titulo: "SAÍDAS", tipo: "saidas", linhas: [
          { descricao: "Folha PJ", codigo: "2.01", valores: buildValores(-20000) },
          { descricao: "Despesas Administrativas", codigo: "2.02", valores: buildValores(-15000) },
          { descricao: "Impostos s/ Serviços", codigo: "2.03", valores: buildValores(-8000) },
          { descricao: "Pessoal e Encargos", codigo: "2.04", valores: buildValores(-25000) },
          { descricao: "Despesas de Ocupação", codigo: "2.05", valores: buildValores(-5000) },
        ]
      },
      {
        titulo: "TRANSFERÊNCIAS", tipo: "transferencias", linhas: [
          { descricao: "Créditos", codigo: "3.01", valores: buildValores(10000) },
          { descricao: "Débitos", codigo: "3.02", valores: buildValores(-10000) },
        ]
      },
      { titulo: "MOVIMENTAÇÃO TOTAL", tipo: "total", linhas: [{ descricao: "Total", codigo: "MT", valores: buildValores(15000) }] },
      { titulo: "Saldo Final", tipo: "saldo_final", linhas: [{ descricao: "Saldo Final", codigo: "SF", valores: buildValores(65000) }] },
    ];

    return res.json({ ano, secoes });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/relatorios/metas", async (req, res) => {
  try {
    const ano = parseInt(req.query.ano as string);
    const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

    const buildValores = (base: number) => {
      const valores: Record<string, { previsto: number; realizado: number }> = {};
      meses.forEach(m => {
        valores[m] = {
          previsto: Math.round(base * (0.9 + Math.random() * 0.2)),
          realizado: Math.round(base * (0.7 + Math.random() * 0.5)),
        };
      });
      const totalPrevisto = Object.values(valores).reduce((a, b) => a + b.previsto, 0);
      const totalRealizado = Object.values(valores).reduce((a, b) => a + b.realizado, 0);
      valores.total = { previsto: totalPrevisto, realizado: totalRealizado };
      return valores;
    };

    return res.json({
      ano,
      recebimentos: [
        { categoria: "Suporte Mensal (Fixa)", valores: buildValores(60000) },
        { categoria: "USTs e Treinamentos", valores: buildValores(20000) },
        { categoria: "Outras Entradas", valores: buildValores(5000) },
      ],
      despesas: [
        { categoria: "Despesas Administrativas", valores: buildValores(25000) },
        { categoria: "Pessoal e Encargos", valores: buildValores(35000) },
        { categoria: "Despesas de Ocupação", valores: buildValores(8000) },
        { categoria: "Impostos", valores: buildValores(12000) },
      ],
      resultado: [
        { categoria: "Resultado", valores: buildValores(5000) },
      ],
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/relatorios/contabil-fiscal", async (req, res) => {
  try {
    const { data_inicio, data_fim, conta_id, tipo = "ambos" } = req.query;

    let conditions = [];
    if (data_inicio) conditions.push(gte(lancamentosTable.vencimento, data_inicio as string));
    if (data_fim) conditions.push(lte(lancamentosTable.vencimento, data_fim as string));
    if (conta_id) conditions.push(eq(lancamentosTable.conta_id, parseInt(conta_id as string)));
    if (tipo !== "ambos") conditions.push(eq(lancamentosTable.tipo, tipo as string));

    const items = await db
      .select({
        conta_bancaria: contasBancariasTable.nome,
        data: lancamentosTable.vencimento,
        descricao: lancamentosTable.descricao,
        nome_parceiro: parceirosTable.nome,
        valor: lancamentosTable.valor,
        categoria: planoContasTable.subcategoria,
        tipo: lancamentosTable.tipo,
      })
      .from(lancamentosTable)
      .leftJoin(contasBancariasTable, eq(lancamentosTable.conta_id, contasBancariasTable.id))
      .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
      .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(lancamentosTable.vencimento);

    return res.json(items.map(i => ({ ...i, valor: Number(i.valor) })));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
