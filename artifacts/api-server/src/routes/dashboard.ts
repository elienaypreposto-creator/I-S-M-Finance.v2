import {Router} from "express";
import {and, desc, eq, gte, inArray, lt, lte, sql, type SQLWrapper} from "drizzle-orm";
import {db} from "@workspace/db";
import {contasBancariasTable, lancamentosTable, parceirosTable, planoContasTable} from "@workspace/db/schema";
import {errorResponse, successResponse} from "../utils/response";
import {hojeIsoLocal} from "../utils/date-civil";
import {fromCents, toCents} from "../utils/money";

const router = Router();
const STATUS_ABERTO = ["pendente", "atrasado"] as const;
const STATUS_QUITADO = ["pago", "recebido"] as const;

const toNumber = (value: unknown) => Number(value ?? 0);

/** EXTRACT(MONTH FROM col) sem `::date` (Prettier-safe). */
const extractMonth = (col: SQLWrapper) => sql<number>`EXTRACT(MONTH FROM
${col}
)`;
const extractYearEq = (col: SQLWrapper, ano: number) =>
    sql`EXTRACT(YEAR FROM
    ${col}
    )
    =
    ${ano}`;

const resolveTabFilter = (tab: string | undefined) => {
    if (tab === "proximos_vencer") return "proximos_vencer";
    return "vencidos";
};

/** Adiciona N dias civis a YYYY-MM-DD (UTC noon). */
function addDaysIso(iso: string, days: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function boundsMesCivil(hojeIso: string): { inicio: string; fim: string } {
    const [y, m] = hojeIso.split("-").map(Number);
    const ano = y!;
    const mes = m!;
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return {inicio, fim};
}

router.get("/dashboard/kpis", async (_req, res) => {
    try {
        const hoje = hojeIsoLocal();
        const {inicio, fim} = boundsMesCivil(hoje);

        const [totais] = await db
            .select({
                contas_receber_atraso: sql<number>`coalesce(sum(case when
                ${lancamentosTable.tipo}
                =
                'CR'
                and
                ${lancamentosTable.vencimento}
                <
                ${hoje}
                and
                ${lancamentosTable.status}
                in
                (
                'pendente',
                'atrasado'
                )
                then
                ${lancamentosTable.valor}
                else
                0
                end
                ),
                0
                )`,
                contas_receber_aberto_mes: sql<number>`coalesce(sum(case when
                ${lancamentosTable.tipo}
                =
                'CR'
                and
                ${lancamentosTable.vencimento}
                between
                ${inicio}
                and
                ${fim}
                and
                ${lancamentosTable.status}
                in
                (
                'pendente',
                'atrasado'
                )
                then
                ${lancamentosTable.valor}
                else
                0
                end
                ),
                0
                )`,
                contas_pagar_aberto_mes: sql<number>`coalesce(sum(case when
                ${lancamentosTable.tipo}
                =
                'CP'
                and
                ${lancamentosTable.vencimento}
                between
                ${inicio}
                and
                ${fim}
                and
                ${lancamentosTable.status}
                in
                (
                'pendente',
                'atrasado'
                )
                then
                ${lancamentosTable.valor}
                else
                0
                end
                ),
                0
                )`,
                contas_pagar_atraso: sql<number>`coalesce(sum(case when
                ${lancamentosTable.tipo}
                =
                'CP'
                and
                ${lancamentosTable.vencimento}
                <
                ${hoje}
                and
                ${lancamentosTable.status}
                in
                (
                'pendente',
                'atrasado'
                )
                then
                ${lancamentosTable.valor}
                else
                0
                end
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .where(sql`${lancamentosTable.status}
            != 'cancelado'`);

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
        const hoje = hojeIsoLocal();
        const {inicio, fim} = boundsMesCivil(hoje);

        const [projecao] = await db
            .select({
                recebimentos: sql<number>`coalesce(sum(case when
                ${lancamentosTable.tipo}
                =
                'CR'
                then
                ${lancamentosTable.valor}
                else
                0
                end
                ),
                0
                )`,
                pagamentos: sql<number>`coalesce(sum(case when
                ${lancamentosTable.tipo}
                =
                'CP'
                then
                ${lancamentosTable.valor}
                else
                0
                end
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .where(
                and(
                    gte(lancamentosTable.vencimento, inicio),
                    lte(lancamentosTable.vencimento, fim),
                    sql`${lancamentosTable.status}
                    != 'cancelado'`,
                ),
            );

        const pr = toNumber(projecao?.recebimentos);
        const pp = toNumber(projecao?.pagamentos);

        return successResponse(res, {
            projecaoRecebimentos: pr,
            projecaoPagamentos: pp,
            projecaoLucroLiquido: fromCents(toCents(pr) - toCents(pp)),
            totalRecebimentos: pr,
            totalPagamentos: pp,
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular projeção mensal.", String(e));
    }
});

router.get("/dashboard/projecao-dias", async (req, res) => {
    try {
        const dias = Math.min(365, Math.max(1, parseInt(req.query.dias as string) || 30));
        const hojeStr = hojeIsoLocal();
        const fimStr = addDaysIso(hojeStr, dias);

        const [[{saldosIniciais}], [{historicoLiquidado}], movimentos] = await Promise.all([
            db
                .select({
                    saldosIniciais: sql<number>`coalesce(sum(
                    ${contasBancariasTable.saldo_inicial}
                    ),
                    0
                    )`,
                })
                .from(contasBancariasTable)
                .where(eq(contasBancariasTable.status, "ativo")),

            db
                .select({
                    historicoLiquidado: sql<number>`coalesce(sum(
            case when
                    ${lancamentosTable.tipo}
                    =
                    'CR'
                    then
                    ${lancamentosTable.valor}
                    else
                    -
                    ${lancamentosTable.valor}
                    end
                    ),
                    0
                    )`,
                })
                .from(lancamentosTable)
                .where(
                    and(
                        inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
                        lt(lancamentosTable.data_quitacao, hojeStr),
                    ),
                ),

            db
                .select({
                    data: lancamentosTable.vencimento,
                    receber: sql<number>`coalesce(sum(case when
                    ${lancamentosTable.tipo}
                    =
                    'CR'
                    then
                    ${lancamentosTable.valor}
                    else
                    0
                    end
                    ),
                    0
                    )`,
                    pagar: sql<number>`coalesce(sum(case when
                    ${lancamentosTable.tipo}
                    =
                    'CP'
                    then
                    ${lancamentosTable.valor}
                    else
                    0
                    end
                    ),
                    0
                    )`,
                })
                .from(lancamentosTable)
                .where(
                    and(
                        gte(lancamentosTable.vencimento, hojeStr),
                        lte(lancamentosTable.vencimento, fimStr),
                        sql`${lancamentosTable.status}
                        != 'cancelado'`,
                    ),
                )
                .groupBy(lancamentosTable.vencimento)
                .orderBy(lancamentosTable.vencimento),
        ]);

        const saldoAtualCents = toCents(saldosIniciais) + toCents(historicoLiquidado);
        const movimentosMap = new Map(movimentos.map((m) => [String(m.data).slice(0, 10), m]));

        const resultado = [];
        let saldoAcumuladoCents = saldoAtualCents;
        for (let i = 0; i < dias; i++) {
            const data = addDaysIso(hojeStr, i);
            const mov = movimentosMap.get(data);
            const receberCents = toCents(mov?.receber);
            const pagarCents = toCents(mov?.pagar);
            saldoAcumuladoCents += receberCents - pagarCents;
            resultado.push({
                data,
                saldo: fromCents(saldoAcumuladoCents),
                receber: fromCents(receberCents),
                pagar: fromCents(pagarCents),
            });
        }

        return successResponse(res, resultado, {
            dias,
            saldo_atual: fromCents(saldoAtualCents),
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular projeção diária.", String(e));
    }
});

router.get("/dashboard/inadimplencia-clientes", async (req, res) => {
    try {
        const hoje = hojeIsoLocal();
        const tab = resolveTabFilter(req.query.tab as string | undefined);
        const limite = parseInt(req.query.limit as string) || 10;
        const janela = addDaysIso(hoje, 7);

        const whereClause =
            tab === "proximos_vencer"
                ? and(
                    eq(lancamentosTable.tipo, "CR"),
                    inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
                    gte(lancamentosTable.vencimento, hoje),
                    lte(lancamentosTable.vencimento, janela),
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
                total: sql<number>`coalesce(sum(
                ${lancamentosTable.valor}
                ),
                0
                )`,
                maior_dias_atraso: sql<number>`coalesce(max(case when
                ${lancamentosTable.vencimento}
                <
                ${hoje}
                then
                (
                CAST
                (
                ${hoje}
                AS
                date
                )
                -
                ${lancamentosTable.vencimento}
                )
                else
                0
                end
                ),
                0
                )`,
                quantidade_titulos: sql<number>`count(*)`,
            })
            .from(lancamentosTable)
            .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
            .where(whereClause)
            .groupBy(parceirosTable.id, parceirosTable.nome)
            .orderBy(desc(sql`coalesce(sum(
            ${lancamentosTable.valor}
            ),
            0
            )`))
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
            {tab, limit: limite},
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular inadimplência de clientes.", String(e));
    }
});

router.get("/dashboard/inadimplencia-fornecedores", async (req, res) => {
    try {
        const hoje = hojeIsoLocal();
        const tab = resolveTabFilter(req.query.tab as string | undefined);
        const limite = parseInt(req.query.limit as string) || 10;
        const janela = addDaysIso(hoje, 7);

        const whereClause =
            tab === "proximos_vencer"
                ? and(
                    eq(lancamentosTable.tipo, "CP"),
                    inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
                    gte(lancamentosTable.vencimento, hoje),
                    lte(lancamentosTable.vencimento, janela),
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
                total: sql<number>`coalesce(sum(
                ${lancamentosTable.valor}
                ),
                0
                )`,
                maior_dias_atraso: sql<number>`coalesce(max(case when
                ${lancamentosTable.vencimento}
                <
                ${hoje}
                then
                (
                CAST
                (
                ${hoje}
                AS
                date
                )
                -
                ${lancamentosTable.vencimento}
                )
                else
                0
                end
                ),
                0
                )`,
                quantidade_titulos: sql<number>`count(*)`,
            })
            .from(lancamentosTable)
            .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
            .where(whereClause)
            .groupBy(parceirosTable.id, parceirosTable.nome)
            .orderBy(desc(sql`coalesce(sum(
            ${lancamentosTable.valor}
            ),
            0
            )`))
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
            {tab, limit: limite},
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular inadimplência de fornecedores.", String(e));
    }
});

router.get("/dashboard/alertas-atraso", async (req, res) => {
    try {
        const hoje = hojeIsoLocal();
        const risco = req.query.risco ? String(req.query.risco) : undefined;
        const limite = parseInt(req.query.limit as string) || 50;

        const items = await db
            .select({
                id: lancamentosTable.id,
                descricao: lancamentosTable.descricao,
                vencimento: lancamentosTable.vencimento,
                valor: lancamentosTable.valor,
                nome: parceirosTable.nome,
                riscos: lancamentosTable.riscos,
            })
            .from(lancamentosTable)
            .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
            .where(
                and(
                    eq(lancamentosTable.tipo, "CP"),
                    inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
                    lt(lancamentosTable.vencimento, hoje),
                    risco ? sql`${lancamentosTable.riscos}
                    ?
                    ${risco}` : undefined,
                ),
            )
            .orderBy(desc(lancamentosTable.vencimento))
            .limit(limite);

        const data = items.map((i) => {
            const venc = String(i.vencimento).slice(0, 10);
            const dias = Math.floor(
                (new Date(`${hoje}T12:00:00Z`).getTime() - new Date(`${venc}T12:00:00Z`).getTime()) / 86400000,
            );
            return {
                id: i.id,
                nome: i.nome || i.descricao || `Lançamento #${i.id}`,
                dias_atraso: dias,
                valor: toNumber(i.valor),
                riscos: i.riscos ?? [],
            };
        });

        return successResponse(res, data, {risco: risco ?? null, limit: limite});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar alertas de atraso.", String(e));
    }
});

router.get("/dashboard/nivel-risco", async (req, res) => {
    try {
        const hoje = hojeIsoLocal();
        const agrupado = await db
            .select({
                risco: sql<string>`jsonb_array_elements_text
                (
                ${lancamentosTable.riscos}
                )`,
                quantidade: sql<number>`count(*)`,
                total: sql<number>`coalesce(sum(
                ${lancamentosTable.valor}
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .where(
                and(
                    lt(lancamentosTable.vencimento, hoje),
                    eq(lancamentosTable.tipo, "CP"),
                    inArray(lancamentosTable.status, STATUS_ABERTO as unknown as string[]),
                    sql`jsonb_array_length
                    (
                    ${lancamentosTable.riscos}
                    )
                    >
                    0`,
                ),
            )
            .groupBy(sql`jsonb_array_elements_text
            (
            ${lancamentosTable.riscos}
            )`)
            .orderBy(desc(sql`coalesce(sum(
            ${lancamentosTable.valor}
            ),
            0
            )`));

        return successResponse(
            res,
            agrupado.map((r) => ({
                risco: r.risco,
                quantidade: toNumber(r.quantidade),
                valor_total: toNumber(r.total),
            })),
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular nível de risco.", String(e));
    }
});

router.get("/dashboard/fluxo-caixa-mensal", async (req, res) => {
    try {
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
        const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
        const mesExpr = extractMonth(lancamentosTable.data_quitacao);

        const rows = await db
            .select({
                mes: mesExpr,
                tipo: lancamentosTable.tipo,
                total: sql<number>`coalesce(sum(
                ${lancamentosTable.valor}
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .where(
                and(
                    extractYearEq(lancamentosTable.data_quitacao, ano),
                    inArray(lancamentosTable.status, STATUS_QUITADO as unknown as string[]),
                ),
            )
            .groupBy(mesExpr, lancamentosTable.tipo)
            .orderBy(mesExpr);

        const resultado = meses.map((mes, idx) => {
            const mesNum = idx + 1;
            const entradas = rows.find((r) => Number(r.mes) === mesNum && r.tipo === "CR")?.total ?? 0;
            const saidas = rows.find((r) => Number(r.mes) === mesNum && r.tipo === "CP")?.total ?? 0;
            return {mes, entradas: toNumber(entradas), saidas: toNumber(saidas)};
        });

        return successResponse(res, resultado, {ano});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no fluxo de caixa mensal do dashboard.", String(e));
    }
});

router.get("/dashboard/saidas-plano-contas", async (_req, res) => {
    try {
        const rows = await db
            .select({
                categoria: planoContasTable.categoria,
                valor: sql<number>`coalesce(sum(
                ${lancamentosTable.valor}
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
            .where(eq(lancamentosTable.tipo, "CP"))
            .groupBy(planoContasTable.categoria)
            .orderBy(sql`sum(
            ${lancamentosTable.valor}
            )
            desc`)
            .limit(6);

        const totalCents = rows.reduce((acc, r) => acc + toCents(r.valor), 0);
        const result = rows.map((r) => {
            const valorCents = toCents(r.valor);
            return {
                categoria: r.categoria ?? "Sem Categoria",
                valor: fromCents(valorCents),
                percentual: totalCents > 0 ? Math.round((valorCents / totalCents) * 100) : 0,
            };
        });

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
                valor: sql<number>`coalesce(sum(
                ${lancamentosTable.valor}
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
            .where(eq(lancamentosTable.tipo, "CR"))
            .groupBy(planoContasTable.categoria)
            .orderBy(sql`sum(
            ${lancamentosTable.valor}
            )
            desc`)
            .limit(6);

        const totalCents = rows.reduce((acc, r) => acc + toCents(r.valor), 0);
        const result = rows.map((r) => {
            const valorCents = toCents(r.valor);
            return {
                categoria: r.categoria ?? "Sem Categoria",
                valor: fromCents(valorCents),
                percentual: totalCents > 0 ? Math.round((valorCents / totalCents) * 100) : 0,
            };
        });

        return successResponse(res, result);
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao consolidar entradas por plano de contas.", String(e));
    }
});

export default router;
