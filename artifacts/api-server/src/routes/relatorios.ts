import {Router} from "express";
import {and, eq, gte, inArray, lte, sql} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    contasBancariasTable,
    lancamentosTable,
    metasTable,
    parceirosTable,
    planoContasTable,
} from "@workspace/db/schema";
import {errorResponse, successResponse} from "../utils/response";

const router = Router();

const STATUS_QUITADO = ["pago", "recebido"] as const;
const toNumber = (value: unknown) => Number(value ?? 0);
const monthKey = (month: number) => String(month).padStart(2, "0");
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ---------------------------------------------------------------------------
// GET /relatorios/fechamento-mensal
// ---------------------------------------------------------------------------

router.get("/relatorios/fechamento-mensal", async (req, res) => {
    try {
        const mes = parseInt(req.query.mes as string);
        const ano = parseInt(req.query.ano as string);
        if (!mes || !ano) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Parâmetros obrigatórios: mes e ano.");
        }

        const mesStr = String(mes).padStart(2, "0");
        const dataInicio = `${ano}-${mesStr}-01`;
        const dataFim = new Date(ano, mes, 0).toISOString().split("T")[0];

        const soma = sql<number>`COALESCE(SUM(
        ${lancamentosTable.valor}
        :
        :
        numeric
        ),
        0
        )`;

        const [[totalCR], [totalCP]] = await Promise.all([
            db.select({total: soma}).from(lancamentosTable).where(
                and(eq(lancamentosTable.tipo, "CR"), gte(lancamentosTable.vencimento, dataInicio), lte(lancamentosTable.vencimento, dataFim)),
            ),
            db.select({total: soma}).from(lancamentosTable).where(
                and(eq(lancamentosTable.tipo, "CP"), gte(lancamentosTable.vencimento, dataInicio), lte(lancamentosTable.vencimento, dataFim)),
            ),
        ]);

        const metas = await db
            .select()
            .from(metasTable)
            .where(and(eq(metasTable.ano, ano), eq(metasTable.mes, mes)));
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

// ---------------------------------------------------------------------------
// GET /relatorios/dre
//
// Regime de competência -> data COALESCE(competencia, vencimento), todos exceto cancelados.
// Regime de caixa -> data_quitacao, apenas status pago/recebido.
// ---------------------------------------------------------------------------

router.get("/relatorios/dre", async (req, res) => {
    try {
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
        const regime = (req.query.regime as string) === "caixa" ? "caixa" : "competencia";

        const isCaixa = regime === "caixa";

        const mesExpr = isCaixa
            ? sql`EXTRACT(MONTH FROM
                ${lancamentosTable.data_quitacao}
                :
                :
                date
                )`
            : sql`EXTRACT(MONTH FROM COALESCE(
                ${lancamentosTable.competencia},
                ${lancamentosTable.vencimento}
                )
                :
                :
                date
                )`;

        const anoFilter = isCaixa
            ? sql`EXTRACT(YEAR FROM
                ${lancamentosTable.data_quitacao}
                :
                :
                date
                )
                =
                ${ano}`
            : sql`EXTRACT(YEAR FROM COALESCE(
                ${lancamentosTable.competencia},
                ${lancamentosTable.vencimento}
                )
                :
                :
                date
                )
                =
                ${ano}`;

        const statusFilter = isCaixa
            ? inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[])
            : sql`${lancamentosTable.status}
                != 'cancelado'`;

        const rows = await db
            .select({
                mes: sql<number>`${mesExpr}`,
                tipo: lancamentosTable.tipo,
                categoria: planoContasTable.categoria,
                total: sql<number>`COALESCE(SUM(
                ${lancamentosTable.valor}
                :
                :
                numeric
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
            .where(and(anoFilter, statusFilter))
            .groupBy(sql`${mesExpr}`, lancamentosTable.tipo, planoContasTable.categoria);

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
            return {codigo, descricao, valores, total: Number(total.toFixed(2))};
        };

        const rb = (m: number) => receitaBruta.get(m) ?? 0;
        const imp = (m: number) => impostos.get(m) ?? 0;
        const cst = (m: number) => custos.get(m) ?? 0;
        const dsp = (m: number) => despesas.get(m) ?? 0;

        const linhas = [
            montarLinha("1", "RECEITA BRUTA DE SERVIÇOS", (m) => rb(m)),
            montarLinha("2", "(-) IMPOSTOS", (m) => -imp(m)),
            montarLinha("3", "RECEITA LÍQUIDA", (m) => rb(m) - imp(m)),
            montarLinha("4", "(-) CUSTO DOS SERVIÇOS PRESTADOS", (m) => -cst(m)),
            montarLinha("5", "MARGEM DE CONTRIBUIÇÃO", (m) => rb(m) - imp(m) - cst(m)),
            montarLinha("6", "(-) DESPESAS OPERACIONAIS", (m) => -dsp(m)),
            montarLinha("7", "LUCRO LÍQUIDO DO PERÍODO", (m) => rb(m) - imp(m) - cst(m) - dsp(m)),
        ];

        return successResponse(res, {ano, regime, meses: MONTH_NAMES, linhas});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar DRE.", String(e));
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/fluxo-caixa
//
// Regime de Caixa exclusivo: agrupa por data_quitacao, soma valor_quitado
// (com fallback para valor quando valor_quitado for nulo).
// ---------------------------------------------------------------------------

router.get("/relatorios/fluxo-caixa", async (req, res) => {
    try {
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
        const meses = Array.from({length: 12}, (_, i) => i + 1);

        const rows = await db
            .select({
                mes: sql<number>`EXTRACT(MONTH FROM
                ${lancamentosTable.data_quitacao}
                :
                :
                date
                )`,
                tipo: lancamentosTable.tipo,
                categoria: planoContasTable.categoria,
                transferencia_grupo_id: lancamentosTable.transferencia_grupo_id,
                total: sql<number>`COALESCE(SUM(COALESCE(
                ${lancamentosTable.valor_quitado},
                ${lancamentosTable.valor}
                )
                :
                :
                numeric
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
            .where(and(
                sql`EXTRACT(YEAR FROM
                ${lancamentosTable.data_quitacao}
                :
                :
                date
                )
                =
                ${ano}`,
                inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
            ))
            .groupBy(
                sql`EXTRACT(MONTH FROM
                ${lancamentosTable.data_quitacao}
                :
                :
                date
                )`,
                lancamentosTable.tipo,
                planoContasTable.categoria,
                lancamentosTable.transferencia_grupo_id,
            );

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
            const mMap = target.get(categoria)!;
            mMap.set(mes, (mMap.get(mes) ?? 0) + valor);
        }

        const linhaCategoria = (codigo: string, descricao: string, source: Map<number, number>, sinal = 1) => {
            const valores: Record<string, number> = {};
            let total = 0;
            for (const m of meses) {
                const value = Number(((source.get(m) ?? 0) * sinal).toFixed(2));
                valores[monthKey(m)] = value;
                total += value;
            }
            return {codigo, descricao, valores, total: Number(total.toFixed(2))};
        };

        const entradas = Array.from(entradasPorCategoria.entries()).map(([cat, map], i) =>
            linhaCategoria(`E.${i + 1}`, cat, map, 1));
        const saidas = Array.from(saidasPorCategoria.entries()).map(([cat, map], i) =>
            linhaCategoria(`S.${i + 1}`, cat, map, -1));

        return successResponse(res, {
            ano,
            meses: MONTH_NAMES,
            secoes: [
                {titulo: "ENTRADAS", tipo: "entradas", linhas: entradas},
                {titulo: "SAÍDAS", tipo: "saidas", linhas: saidas},
                {
                    titulo: "TRANSFERÊNCIAS",
                    tipo: "transferencias",
                    linhas: [
                        linhaCategoria("T.1", "Transferências (Créditos)", transferenciasCredito, 1),
                        linhaCategoria("T.2", "Transferências (Débitos)", transferenciasDebito, -1),
                    ],
                },
            ],
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar fluxo de caixa.", String(e));
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/metas
//
// Returns each meta for the year alongside the actual realized value,
// computed in a single aggregation query (zero N+1).
// ---------------------------------------------------------------------------

router.get("/relatorios/metas", async (req, res) => {
    try {
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();

        // Query 1: all metas for the year + plano conta label
        // Query 2: realized sums from lancamentos for the same year (single GROUP BY)
        const [metasRows, realizadosRows] = await Promise.all([
            db
                .select({
                    plano_conta_id: metasTable.plano_conta_id,
                    categoria: planoContasTable.categoria,
                    mes: metasTable.mes,
                    valor_projetado: metasTable.valor_projetado,
                })
                .from(metasTable)
                .leftJoin(planoContasTable, eq(metasTable.plano_conta_id, planoContasTable.id))
                .where(eq(metasTable.ano, ano)),

            db
                .select({
                    plano_conta_id: lancamentosTable.plano_conta_id,
                    mes: sql<number>`EXTRACT(MONTH FROM COALESCE(
                    ${lancamentosTable.competencia},
                    ${lancamentosTable.vencimento}
                    )
                    :
                    :
                    date
                    )`,
                    valor: sql<number>`COALESCE(SUM(COALESCE(
                    ${lancamentosTable.valor_quitado},
                    ${lancamentosTable.valor}
                    )
                    :
                    :
                    numeric
                    ),
                    0
                    )`,
                })
                .from(lancamentosTable)
                .where(and(
                    sql`EXTRACT(YEAR FROM COALESCE(
                    ${lancamentosTable.competencia},
                    ${lancamentosTable.vencimento}
                    )
                    :
                    :
                    date
                    )
                    =
                    ${ano}`,
                    inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
                ))
                .groupBy(
                    lancamentosTable.plano_conta_id,
                    sql`EXTRACT(MONTH FROM COALESCE(
                    ${lancamentosTable.competencia},
                    ${lancamentosTable.vencimento}
                    )
                    :
                    :
                    date
                    )`,
                ),
        ]);

        // Build a lookup key: "plano_conta_id_mes"
        const realizadoMap = new Map(
            realizadosRows.map((r) => [`${r.plano_conta_id}_${r.mes}`, toNumber(r.valor)]),
        );

        return successResponse(
            res,
            metasRows.map((m) => ({
                ...m,
                valor_projetado: toNumber(m.valor_projetado),
                valor_realizado: realizadoMap.get(`${m.plano_conta_id}_${m.mes}`) ?? 0,
            })),
            {ano},
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório de metas.", String(e));
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/contabil-fiscal
// ---------------------------------------------------------------------------

router.get("/relatorios/contabil-fiscal", async (req, res) => {
    try {
        const {data_inicio, data_fim, conta_id, tipo = "ambos"} = req.query;

        const conditions = [
            inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
            data_inicio ? gte(lancamentosTable.data_quitacao, String(data_inicio)) : undefined,
            data_fim ? lte(lancamentosTable.data_quitacao, String(data_fim)) : undefined,
            conta_id ? eq(lancamentosTable.conta_id, parseInt(String(conta_id))) : undefined,
            tipo !== "ambos" ? eq(lancamentosTable.tipo, String(tipo)) : undefined,
        ].filter(Boolean) as ReturnType<typeof eq>[];

        const items = await db
            .select({
                conta_bancaria: contasBancariasTable.nome,
                data_pgto: lancamentosTable.data_quitacao,
                descricao: lancamentosTable.descricao,
                nome_parceiro: parceirosTable.nome,
                valor: lancamentosTable.valor,
                categoria: sql<string>`COALESCE(
                ${planoContasTable.subcategoria},
                ${planoContasTable.categoria},
                'Sem Categoria'
                )`,
                tipo: lancamentosTable.tipo,
            })
            .from(lancamentosTable)
            .leftJoin(contasBancariasTable, eq(lancamentosTable.conta_id, contasBancariasTable.id))
            .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
            .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(lancamentosTable.data_quitacao);

        return successResponse(
            res,
            items.map((i) => ({...i, valor: toNumber(i.valor)})),
            {total: items.length},
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório contábil/fiscal.", String(e));
    }
});

export default router;
