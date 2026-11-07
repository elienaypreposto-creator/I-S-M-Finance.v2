import {Router} from "express";
import {and, desc, eq, gte, inArray, isNull, lt, lte, sql, type SQL, type SQLWrapper} from "drizzle-orm";
import {db} from "@workspace/db";
import {lancamentosTable, parceirosTable, planoContasTable} from "@workspace/db/schema";
import {errorResponse, successResponse} from "../utils/response";
import {hojeIsoLocal} from "../utils/date-civil";
import {fromCents, toCents} from "../utils/money";
import {projetarSaldoDiario} from "../utils/projecao-saldo";
import {contasBancariasService} from "../domains/financial/contas-bancarias/contas-bancarias.service";
import {requireTenant, tenantWhere} from "../lib/tenant-scope";
import {emAbertoLiquidoSql, emAbertoNoPainelWhere} from "../domains/financial/lancamentos/em-aberto";

const router = Router();
const STATUS_ABERTO = ["pendente", "atrasado"] as const;
const STATUS_QUITADO = ["pago", "recebido"] as const;

const toNumber = (value: unknown) => Number(value ?? 0);

// Em aberto, projeções e caixa usam `valor_liquido` (bruto − retenções na
// fonte): é o que de fato entra/sai do banco. Entradas/saídas por plano de
// contas (natureza da receita/despesa) seguem no bruto (`valor`).

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

router.get("/dashboard/kpis", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const hoje = hojeIsoLocal();
        const {inicio, fim} = boundsMesCivil(hoje);

        // Em aberto = pendente/atrasado pelo líquido + o restante do pago parcial
        // (ver em-aberto.ts); "atraso" = vencidos até ontem.
        const somaEmAberto = (tipo: "CR" | "CP", periodo: SQL) =>
            sql<number>`coalesce(sum(case when ${lancamentosTable.tipo} = ${tipo} and ${periodo} then ${emAbertoLiquidoSql} else 0 end), 0)`;
        const vencido = sql`${lancamentosTable.vencimento} < ${hoje}`;
        const doMes = sql`${lancamentosTable.vencimento} between ${inicio} and ${fim}`;

        const [totais] = await db
            .select({
                contas_receber_atraso: somaEmAberto("CR", vencido),
                contas_receber_aberto_mes: somaEmAberto("CR", doMes),
                contas_pagar_aberto_mes: somaEmAberto("CP", doMes),
                contas_pagar_atraso: somaEmAberto("CP", vencido),
            })
            .from(lancamentosTable)
            .where(tenantWhere(lancamentosTable, empresaId, emAbertoNoPainelWhere));

        return successResponse(res, {
            contasReceberAtraso: toNumber(totais?.contas_receber_atraso),
            contasReceberAberto: toNumber(totais?.contas_receber_aberto_mes),
            contasPagarAberto: toNumber(totais?.contas_pagar_aberto_mes),
            contasPagarAtraso: toNumber(totais?.contas_pagar_atraso),
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular KPIs.", e);
    }
});

router.get("/dashboard/projecao-mes", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const hoje = hojeIsoLocal();
        const {inicio, fim} = boundsMesCivil(hoje);

        const [projecao] = await db
            .select({
                recebimentos: sql<number>`coalesce(sum(case when
                ${lancamentosTable.tipo}
                =
                'CR'
                then
                ${lancamentosTable.valor_liquido}
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
                ${lancamentosTable.valor_liquido}
                else
                0
                end
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    gte(lancamentosTable.vencimento, inicio),
                    lte(lancamentosTable.vencimento, fim),
                    sql`${lancamentosTable.status}
                    != 'cancelado'`,
                    // O título de origem já entra pelo valor cheio; o residual é a
                    // parte dele que falta (mesmo vencimento) - somar os dois dobrava.
                    sql`${lancamentosTable.is_residuo_parcial} = false`,
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular projeção mensal.", e);
    }
});

// Projeção de saldo dos próximos dias. Ponto de partida = saldo geral: soma do saldo
// atual das contas ATIVAS pela regra única do saldo da conta (contasBancariasService,
// a mesma do card "Saldo geral" e do cadastro de contas). Antes somava o saldo_inicial
// de todas as contas com todos os quitados pelo líquido, sem olhar conta nem data de
// início, e não batia com o saldo geral. Daí em diante: + a receber e − a pagar em
// aberto (pendente/atrasado) pelo vencimento, valor líquido; transferências entre
// contas da empresa ficam fora (não mudam o saldo geral). Ver utils/projecao-saldo.ts.
router.get("/dashboard/projecao-dias", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const dias = Math.min(365, Math.max(1, parseInt(req.query.dias as string) || 30));
        const hojeStr = hojeIsoLocal();
        const ultimoDia = addDaysIso(hojeStr, dias - 1);

        const [contas, previstos] = await Promise.all([
            contasBancariasService.list(empresaId),
            db
                .select({
                    data: lancamentosTable.vencimento,
                    receber: sql<string>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CR' then ${lancamentosTable.valor_liquido} else 0 end), 0)`,
                    pagar: sql<string>`coalesce(sum(case when ${lancamentosTable.tipo} = 'CP' then ${lancamentosTable.valor_liquido} else 0 end), 0)`,
                })
                .from(lancamentosTable)
                .where(
                    tenantWhere(
                        lancamentosTable,
                        empresaId,
                        inArray(lancamentosTable.status, STATUS_ABERTO),
                        gte(lancamentosTable.vencimento, hojeStr),
                        lte(lancamentosTable.vencimento, ultimoDia),
                        isNull(lancamentosTable.transferencia_grupo_id),
                    ),
                )
                .groupBy(lancamentosTable.vencimento)
                .orderBy(lancamentosTable.vencimento),
        ]);

        // Mesmas contas do card "Saldo geral" (lib/saldo-geral.ts no front): só as ativas.
        const saldoGeralCents = contas
            .filter((c) => c.status === "ativo")
            .reduce((soma, c) => soma + toCents(c.saldo_atual), 0);
        const {pontos, saldoFinalCents} = projetarSaldoDiario(saldoGeralCents, previstos, hojeStr, dias);

        return successResponse(res, pontos, {
            dias,
            saldo_atual: fromCents(saldoGeralCents),
            saldo_final: fromCents(saldoFinalCents),
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular projeção diária.", e);
    }
});

router.get("/dashboard/inadimplencia-clientes", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const hoje = hojeIsoLocal();
        const tab = resolveTabFilter(req.query.tab as string | undefined);
        const limite = parseInt(req.query.limit as string) || 10;
        const janela = addDaysIso(hoje, 7);

        const whereClause =
            tab === "proximos_vencer"
                ? and(
                    eq(lancamentosTable.tipo, "CR"),
                    emAbertoNoPainelWhere,
                    gte(lancamentosTable.vencimento, hoje),
                    lte(lancamentosTable.vencimento, janela),
                )
                : and(
                    eq(lancamentosTable.tipo, "CR"),
                    emAbertoNoPainelWhere,
                    lt(lancamentosTable.vencimento, hoje),
                );

        const items = await db
            .select({
                parceiro_id: parceirosTable.id,
                nome: parceirosTable.nome,
                total: sql<number>`coalesce(sum(${emAbertoLiquidoSql}), 0)`,
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
            .where(tenantWhere(lancamentosTable, empresaId, whereClause))
            .groupBy(parceirosTable.id, parceirosTable.nome)
            .orderBy(desc(sql`coalesce(sum(${emAbertoLiquidoSql}), 0)`))
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular inadimplência de clientes.", e);
    }
});

router.get("/dashboard/inadimplencia-fornecedores", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const hoje = hojeIsoLocal();
        const tab = resolveTabFilter(req.query.tab as string | undefined);
        const limite = parseInt(req.query.limit as string) || 10;
        const janela = addDaysIso(hoje, 7);

        const whereClause =
            tab === "proximos_vencer"
                ? and(
                    eq(lancamentosTable.tipo, "CP"),
                    emAbertoNoPainelWhere,
                    gte(lancamentosTable.vencimento, hoje),
                    lte(lancamentosTable.vencimento, janela),
                )
                : and(
                    eq(lancamentosTable.tipo, "CP"),
                    emAbertoNoPainelWhere,
                    lt(lancamentosTable.vencimento, hoje),
                );

        const items = await db
            .select({
                parceiro_id: parceirosTable.id,
                nome: parceirosTable.nome,
                total: sql<number>`coalesce(sum(${emAbertoLiquidoSql}), 0)`,
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
            .where(tenantWhere(lancamentosTable, empresaId, whereClause))
            .groupBy(parceirosTable.id, parceirosTable.nome)
            .orderBy(desc(sql`coalesce(sum(${emAbertoLiquidoSql}), 0)`))
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular inadimplência de fornecedores.", e);
    }
});

router.get("/dashboard/alertas-atraso", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const hoje = hojeIsoLocal();
        const risco = req.query.risco ? String(req.query.risco) : undefined;
        const limite = parseInt(req.query.limit as string) || 50;

        const items = await db
            .select({
                id: lancamentosTable.id,
                descricao: lancamentosTable.descricao,
                vencimento: lancamentosTable.vencimento,
                // Pago parcial entra pelo que falta pagar.
                valor: emAbertoLiquidoSql,
                nome: parceirosTable.nome,
                riscos: lancamentosTable.riscos,
            })
            .from(lancamentosTable)
            .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    eq(lancamentosTable.tipo, "CP"),
                    emAbertoNoPainelWhere,
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar alertas de atraso.", e);
    }
});

router.get("/dashboard/nivel-risco", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const hoje = hojeIsoLocal();
        const agrupado = await db
            .select({
                risco: sql<string>`jsonb_array_elements_text
                (
                ${lancamentosTable.riscos}
                )`,
                quantidade: sql<number>`count(*)`,
                total: sql<number>`coalesce(sum(${emAbertoLiquidoSql}), 0)`,
            })
            .from(lancamentosTable)
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    lt(lancamentosTable.vencimento, hoje),
                    eq(lancamentosTable.tipo, "CP"),
                    emAbertoNoPainelWhere,
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
            .orderBy(desc(sql`coalesce(sum(${emAbertoLiquidoSql}), 0)`));

        return successResponse(
            res,
            agrupado.map((r) => ({
                risco: r.risco,
                quantidade: toNumber(r.quantidade),
                valor_total: toNumber(r.total),
            })),
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao calcular nível de risco.", e);
    }
});

router.get("/dashboard/fluxo-caixa-mensal", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
        const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
        const mesExpr = extractMonth(lancamentosTable.data_quitacao);

        const rows = await db
            .select({
                mes: mesExpr,
                tipo: lancamentosTable.tipo,
                total: sql<number>`coalesce(sum(
                ${lancamentosTable.valor_liquido}
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    extractYearEq(lancamentosTable.data_quitacao, ano),
                    inArray(lancamentosTable.status, STATUS_QUITADO),
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no fluxo de caixa mensal do dashboard.", e);
    }
});

router.get("/dashboard/saidas-plano-contas", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
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
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.tipo, "CP")))
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao consolidar saídas por plano de contas.", e);
    }
});

router.get("/dashboard/entradas-plano-contas", async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
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
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.tipo, "CR")))
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao consolidar entradas por plano de contas.", e);
    }
});

export default router;
