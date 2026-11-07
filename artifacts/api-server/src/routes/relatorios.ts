import {Router} from "express";
import {and, eq, gte, inArray, lte, sql, desc, type SQL, type SQLWrapper} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    conciliacoesTable,
    contasBancariasTable,
    extratoLinhasTable,
    extratosTable,
    itensConciliacaoLancamentosTable,
    itensConciliacaoTable,
    lancamentosTable,
    metasTable,
    parceirosTable,
    planoContasTable,
} from "@workspace/db/schema";
import {errorResponse, successResponse} from "../utils/response";
import {fromCents, realizadoSemJurosCents, toCents} from "../utils/money";
import {grupoDreDoLancamento, sqlValorDreCaixa, valorNaLinhaDreCents, type GrupoDre} from "../utils/dre";
import {sqlLancamentosDaConta, sqlMovimentosNoSaldoDaConta} from "../utils/lancamentos-conta";
import {statusConciliacaoEfetivoSql, statusExtratoEfetivoSql} from "../utils/conciliacao-status";
import {
    aberturaNoPeriodo,
    agruparVinculos,
    comSaldoCorrido,
    contaNoResumoDoPeriodo,
    diaAnterior,
    filtrarPorTipo,
    lerParamsExtratoConta,
    ordenarMovimentos,
    resumirNaoConciliados,
    semSaldoCorrido,
    type ResumoVinculo,
    type VinculoExtrato,
} from "../utils/extrato-conta";
import {AppError} from "../utils/app-error";
import {contasBancariasService} from "../domains/financial/contas-bancarias/contas-bancarias.service";
import {requireTenant, tenantScope, tenantWhere} from "../lib/tenant-scope";
import {withPermission} from "../middlewares/withPermission";
import {PERM} from "../constants/permissoes";

const router = Router();

/**
 * Quitados efetivos (FEAT-10 / conciliação).
 * SQL cru: `inArray` com strings falha silenciosamente contra enum Postgres `status_lancamento`
 * (mesmo workaround de contas-bancarias.service.ts).
 */
const STATUS_QUITADO_SQL = sql`${lancamentosTable.status}
IN ('pago', 'recebido', 'pago_parcial')`;
/** Transferência entre contas da própria empresa: mexe no caixa de cada conta, mas não é receita nem despesa. */
const SEM_TRANSFERENCIA_SQL = sql`${lancamentosTable.transferencia_grupo_id} IS NULL`;
/**
 * Retenções na fonte de título quitado: o banco só viu o líquido, mas a receita/despesa
 * é o bruto da nota. Somadas ao realizado quando o título fecha (pago/recebido).
 */
const RETENCOES_QUITADAS_SQL = sql<string>`CASE WHEN ${lancamentosTable.status} IN ('pago', 'recebido')
    THEN ${lancamentosTable.valor} - ${lancamentosTable.valor_liquido} ELSE 0 END`;
const toNumber = (value: unknown) => Number(value ?? 0);
const monthKey = (month: number) => String(month).padStart(2, "0");
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const extractMonth = (col: SQLWrapper) => sql<number>`EXTRACT(MONTH FROM
${col}
)`;
const extractYearEq = (col: SQLWrapper, ano: number) =>
    sql`EXTRACT(YEAR FROM
    ${col}
    )
    =
    ${ano}`;

// ---------------------------------------------------------------------------
// GET /relatorios/fechamento-mensal
// ---------------------------------------------------------------------------

router.get("/relatorios/fechamento-mensal", withPermission(PERM.RELATORIOS_FECHAMENTO), async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const mes = parseInt(req.query.mes as string);
        const ano = parseInt(req.query.ano as string);
        if (!mes || !ano) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Parâmetros obrigatórios: mes e ano.");
        }

        const mesStr = String(mes).padStart(2, "0");
        const dataInicio = `${ano}-${mesStr}-01`;
        const lastDay = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        const dataFim = `${ano}-${mesStr}-${String(lastDay).padStart(2, "0")}`;

        // FEAT-10: realizado por data_quitacao; juros fora do resultado (RN-G5).
        const lancamentosMes = await db
            .select({
                tipo: lancamentosTable.tipo,
                valor_quitado: lancamentosTable.valor_quitado,
                valor: lancamentosTable.valor,
                juros: lancamentosTable.juros,
                retencoes: RETENCOES_QUITADAS_SQL,
            })
            .from(lancamentosTable)
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    sql`${lancamentosTable.data_quitacao}
                    IS NOT NULL`,
                    gte(lancamentosTable.data_quitacao, dataInicio),
                    lte(lancamentosTable.data_quitacao, dataFim),
                    STATUS_QUITADO_SQL,
                    SEM_TRANSFERENCIA_SQL,
                ),
            );

        let realizadoReceberCents = 0;
        let realizadoGastarCents = 0;
        let jurosCents = 0;
        for (const l of lancamentosMes) {
            const quitado = toCents(l.valor_quitado ?? l.valor ?? 0);
            const juros = toCents(l.juros ?? 0);
            const parcela = realizadoSemJurosCents(quitado, juros) + toCents(l.retencoes);
            jurosCents += juros;
            if (l.tipo === "CR") realizadoReceberCents += parcela;
            else realizadoGastarCents += parcela;
        }

        const metas = await db
            .select({
                valor_projetado: metasTable.valor_projetado,
                tipo_plano: planoContasTable.tipo,
            })
            .from(metasTable)
            .leftJoin(planoContasTable, eq(metasTable.plano_conta_id, planoContasTable.id))
            .where(tenantWhere(metasTable, empresaId, eq(metasTable.ano, ano), eq(metasTable.mes, mes)));

        let planejadoReceberCents = 0;
        let planejadoGastarCents = 0;
        for (const m of metas) {
            const v = toCents(m.valor_projetado);
            const tipo = (m.tipo_plano ?? "").toLowerCase();
            if (tipo === "receita") planejadoReceberCents += v;
            else planejadoGastarCents += v;
        }

        return successResponse(res, {
            mes,
            ano,
            planejado_receber: fromCents(planejadoReceberCents),
            realizado_receber: fromCents(realizadoReceberCents),
            planejado_gastar: fromCents(planejadoGastarCents),
            realizado_gastar: fromCents(realizadoGastarCents),
            /** Juros do período - fora do resultado operacional. */
            juros: fromCents(jurosCents),
            criterio: "data_quitacao",
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar fechamento mensal.", e);
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/dre
//
// Regime de competência -> data COALESCE(competencia, vencimento), valor do título,
//   todos exceto cancelados e resíduos de quitação parcial (o resíduo é o mesmo
//   título da origem; somar os dois contaria a receita/despesa duas vezes).
// Regime de caixa -> data_quitacao e valor_quitado de cada título quitado, a mesma
//   base do Fluxo de Caixa e do Contábil (juros pagos entram; não são descontados
//   como no realizado das metas), mais as retenções do título fechado (sqlValorDreCaixa).
// Linha de cada título: grupo DRE da conta do plano (utils/dre.ts), nunca o texto
// da categoria. Transferências entre contas ficam fora.
// ---------------------------------------------------------------------------

router.get("/relatorios/dre", withPermission(PERM.RELATORIOS_DRE), async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
        const regime = (req.query.regime as string) === "caixa" ? "caixa" : "competencia";

        const isCaixa = regime === "caixa";

        const dataCaixa = lancamentosTable.data_quitacao;
        const dataCompetencia = sql`COALESCE(
        ${lancamentosTable.competencia},
        ${lancamentosTable.vencimento}
        )`;
        const mesExpr = isCaixa ? extractMonth(dataCaixa) : sql<number>`EXTRACT(MONTH FROM
        ${dataCompetencia}
        )`;
        const anoFilter = isCaixa
            ? extractYearEq(dataCaixa, ano)
            : sql`EXTRACT(YEAR FROM
                ${dataCompetencia}
                )
                =
                ${ano}`;

        const filtrosRegime = isCaixa
            ? [STATUS_QUITADO_SQL]
            : [
                sql`${lancamentosTable.status} != 'cancelado'`,
                sql`${lancamentosTable.is_residuo_parcial} = false`,
            ];
        const valorExpr = isCaixa
            ? sqlValorDreCaixa(RETENCOES_QUITADAS_SQL)
            : sql`${lancamentosTable.valor}`;

        const rows = await db
            .select({
                mes: sql<number>`${mesExpr}`,
                tipo: lancamentosTable.tipo,
                tipo_plano: planoContasTable.tipo,
                grupo_dre: planoContasTable.grupo_dre,
                total: sql<number>`COALESCE(SUM(${valorExpr}), 0)`,
            })
            .from(lancamentosTable)
            .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
            .where(tenantWhere(lancamentosTable, empresaId, anoFilter, SEM_TRANSFERENCIA_SQL, ...filtrosRegime))
            .groupBy(sql`${mesExpr}`, lancamentosTable.tipo, planoContasTable.tipo, planoContasTable.grupo_dre);

        const porGrupo: Record<Exclude<GrupoDre, "fora">, Map<number, number>> = {
            receita: new Map(),
            deducao: new Map(),
            custo: new Map(),
            despesa: new Map(),
        };

        for (const row of rows) {
            const m = Number(row.mes);
            const grupo = grupoDreDoLancamento({
                tipoLancamento: row.tipo,
                grupoDre: row.grupo_dre,
                tipoPlano: row.tipo_plano,
            });
            if (grupo === "fora") continue;
            const cents = valorNaLinhaDreCents(grupo, row.tipo, toCents(row.total));
            porGrupo[grupo].set(m, (porGrupo[grupo].get(m) ?? 0) + cents);
        }

        const montarLinha = (codigo: string, descricao: string, formula: (m: number) => number) => {
            const valores: Record<string, number> = {};
            let totalCents = 0;
            for (let m = 1; m <= 12; m++) {
                const cents = formula(m);
                valores[monthKey(m)] = fromCents(cents);
                totalCents += cents;
            }
            return {codigo, descricao, valores, total: fromCents(totalCents)};
        };

        const rb = (m: number) => porGrupo.receita.get(m) ?? 0;
        const imp = (m: number) => porGrupo.deducao.get(m) ?? 0;
        const cst = (m: number) => porGrupo.custo.get(m) ?? 0;
        const dsp = (m: number) => porGrupo.despesa.get(m) ?? 0;

        const linhas = [
            montarLinha("1", "RECEITA BRUTA DE SERVIÇOS", (m) => rb(m)),
            montarLinha("2", "(-) DEDUÇÕES (IMPOSTOS SOBRE A RECEITA)", (m) => -imp(m)),
            montarLinha("3", "RECEITA LÍQUIDA", (m) => rb(m) - imp(m)),
            montarLinha("4", "(-) CUSTO DOS SERVIÇOS PRESTADOS", (m) => -cst(m)),
            montarLinha("5", "MARGEM DE CONTRIBUIÇÃO", (m) => rb(m) - imp(m) - cst(m)),
            montarLinha("6", "(-) DESPESAS OPERACIONAIS", (m) => -dsp(m)),
            montarLinha("7", "LUCRO LÍQUIDO DO PERÍODO", (m) => rb(m) - imp(m) - cst(m) - dsp(m)),
        ];

        return successResponse(res, {ano, regime, meses: MONTH_NAMES, linhas});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar DRE.", e);
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/fluxo-caixa
//
// Regime de Caixa exclusivo: agrupa por data_quitacao, soma valor_quitado
// (com fallback para valor quando valor_quitado for nulo).
// ---------------------------------------------------------------------------

router.get("/relatorios/fluxo-caixa", withPermission(PERM.RELATORIOS_FLUXO_CAIXA), async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
        const meses = Array.from({length: 12}, (_, i) => i + 1);

        const mesExpr = extractMonth(lancamentosTable.data_quitacao);
        const rows = await db
            .select({
                mes: mesExpr,
                tipo: lancamentosTable.tipo,
                categoria: planoContasTable.categoria,
                transferencia_grupo_id: lancamentosTable.transferencia_grupo_id,
                total: sql<number>`COALESCE(SUM(COALESCE(
                ${lancamentosTable.valor_quitado},
                ${lancamentosTable.valor}
                )
                ),
                0
                )`,
            })
            .from(lancamentosTable)
            .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
            .where(tenantWhere(lancamentosTable, empresaId, extractYearEq(lancamentosTable.data_quitacao, ano), STATUS_QUITADO_SQL))
            .groupBy(
                mesExpr,
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
            const valorCents = toCents(row.total);
            const categoria = row.categoria ?? "Sem Categoria";
            const ehTransferencia = Boolean(row.transferencia_grupo_id);

            if (ehTransferencia) {
                if (row.tipo === "CR") transferenciasCredito.set(mes, (transferenciasCredito.get(mes) ?? 0) + valorCents);
                else transferenciasDebito.set(mes, (transferenciasDebito.get(mes) ?? 0) + valorCents);
                continue;
            }

            const target = row.tipo === "CR" ? entradasPorCategoria : saidasPorCategoria;
            if (!target.has(categoria)) target.set(categoria, new Map());
            const mMap = target.get(categoria)!;
            mMap.set(mes, (mMap.get(mes) ?? 0) + valorCents);
        }

        const linhaCategoria = (codigo: string, descricao: string, source: Map<number, number>, sinal = 1) => {
            const valores: Record<string, number> = {};
            let totalCents = 0;
            for (const m of meses) {
                const cents = (source.get(m) ?? 0) * sinal;
                valores[monthKey(m)] = fromCents(cents);
                totalCents += cents;
            }
            return {codigo, descricao, valores, total: fromCents(totalCents)};
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar fluxo de caixa.", e);
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/metas  (FEAT-10)
//
// Realizado = (valor_quitado − juros) por data_quitacao (RN-G5; não vencimento/competência).
// Juros ficam em campo separado e NÃO entram no valor_realizado.
//
// Cada linha traz o `tipo` da conta do plano (receita, custo ou despesa) para a
// tela separar receitas de despesas: somar os dois num "orçado" só não faz
// sentido. O tipo é da conta, não da categoria: uma categoria com contas de tipos
// diferentes (ex.: "34343" com conta de receita e conta de custo) chega em linhas
// com tipos diferentes, e a tela mostra uma linha por tipo.
// Título no sentido contrário ao da conta (devolução de receita, estorno de
// despesa) abate o realizado, como na DRE.
// ---------------------------------------------------------------------------

type TipoMeta = "receita" | "custo" | "despesa";

/** Tipo da conta do plano; sem conta (ou tipo desconhecido) vale a natureza do título. */
function tipoDaMeta(tipoPlano: string | null | undefined, tipoLancamento?: string | null): TipoMeta {
    const t = (tipoPlano ?? "").toLowerCase();
    if (t === "receita" || t === "custo" || t === "despesa") return t;
    return tipoLancamento === "CR" ? "receita" : "despesa";
}

router.get("/relatorios/metas", withPermission(PERM.RELATORIOS_METAS), async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();

        const [metasRows, realizadosRows] = await Promise.all([
            db
                .select({
                    plano_conta_id: metasTable.plano_conta_id,
                    categoria: planoContasTable.categoria,
                    subcategoria: planoContasTable.subcategoria,
                    tipo_plano: planoContasTable.tipo,
                    mes: metasTable.mes,
                    valor_projetado: metasTable.valor_projetado,
                })
                .from(metasTable)
                .leftJoin(planoContasTable, eq(metasTable.plano_conta_id, planoContasTable.id))
                .where(tenantWhere(metasTable, empresaId, eq(metasTable.ano, ano))),

            db
                .select({
                    plano_conta_id: lancamentosTable.plano_conta_id,
                    categoria: planoContasTable.categoria,
                    subcategoria: planoContasTable.subcategoria,
                    tipo_plano: planoContasTable.tipo,
                    tipo_lancamento: lancamentosTable.tipo,
                    mes: extractMonth(lancamentosTable.data_quitacao),
                    valor_quitado: lancamentosTable.valor_quitado,
                    valor: lancamentosTable.valor,
                    juros: lancamentosTable.juros,
                    retencoes: RETENCOES_QUITADAS_SQL,
                })
                .from(lancamentosTable)
                .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
                .where(
                    tenantWhere(
                        lancamentosTable,
                        empresaId,
                        sql`${lancamentosTable.data_quitacao}
                        IS NOT NULL`,
                        extractYearEq(lancamentosTable.data_quitacao, ano),
                        STATUS_QUITADO_SQL,
                        SEM_TRANSFERENCIA_SQL,
                    ),
                ),
        ]);

        // Agrega em centavos (DEF-06 / FEAT-10).
        // valor_quitado inclui juros embutidos (ex.: 6838 + 1162 = 8000).
        // Realizado da meta = parcela quitada SEM juros (RN-G5 / Card 62),
        // mais as retenções na fonte do título já fechado (a meta é pelo bruto da nota).
        const realizadoMap = new Map<string, number>();
        const jurosMap = new Map<string, number>();
        const planoInfo = new Map<number, { categoria: string | null; subcategoria: string | null; tipo: TipoMeta }>();
        for (const r of realizadosRows) {
            if (r.plano_conta_id == null || r.mes == null) continue;
            const mesNum = Number(r.mes);
            const key = `${r.plano_conta_id}_${mesNum}`;
            const tipo = tipoDaMeta(r.tipo_plano, r.tipo_lancamento);
            const quitadoCents = toCents(r.valor_quitado ?? r.valor ?? 0);
            const jurosCents = toCents(r.juros ?? 0);
            const parcelaCents = realizadoSemJurosCents(quitadoCents, jurosCents) + toCents(r.retencoes);
            const naMetaCents = valorNaLinhaDreCents(tipo, r.tipo_lancamento, parcelaCents);
            realizadoMap.set(key, (realizadoMap.get(key) ?? 0) + naMetaCents);
            jurosMap.set(key, (jurosMap.get(key) ?? 0) + jurosCents);
            if (!planoInfo.has(r.plano_conta_id)) {
                planoInfo.set(r.plano_conta_id, {
                    categoria: r.categoria ?? null,
                    subcategoria: r.subcategoria ?? null,
                    tipo,
                });
            }
        }

        const metaKeys = new Set(metasRows.map((m) => `${m.plano_conta_id}_${m.mes}`));
        const rows = metasRows.map(({tipo_plano, ...m}) => {
            const key = `${m.plano_conta_id}_${m.mes}`;
            const projetado = toNumber(m.valor_projetado);
            const realizado = fromCents(realizadoMap.get(key) ?? 0);
            const juros = fromCents(jurosMap.get(key) ?? 0);
            const atingimento_pct =
                projetado > 0 ? Math.round((realizado / projetado) * 10000) / 100 : null;
            return {
                ...m,
                tipo: tipoDaMeta(tipo_plano),
                valor_projetado: projetado,
                valor_realizado: realizado,
                juros,
                atingimento_pct,
            };
        });

        for (const [key, realizadoCents] of realizadoMap) {
            if (metaKeys.has(key)) continue;
            const [planoStr, mesStr] = key.split("_");
            const plano_conta_id = Number(planoStr);
            const mes = Number(mesStr);
            const realizado = fromCents(realizadoCents);
            const juros = fromCents(jurosMap.get(key) ?? 0);
            const info = planoInfo.get(plano_conta_id);
            rows.push({
                plano_conta_id,
                categoria: info?.categoria ?? null,
                subcategoria: info?.subcategoria ?? null,
                tipo: info?.tipo ?? "despesa",
                mes,
                valor_projetado: 0,
                valor_realizado: realizado,
                juros,
                atingimento_pct: null,
            });
        }

        rows.sort((a, b) => a.mes - b.mes || a.plano_conta_id - b.plano_conta_id);

        return successResponse(res, rows, {ano, criterio: "data_quitacao"});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório de metas.", e);
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/contabil-fiscal
//
// Movimento para a contabilidade: `valor` é o valor do título (bruto da nota);
// `valor_pago` é o que saiu/entrou no banco (valor_quitado, que já traz juros/multa,
// desconto e o abatimento das retenções na fonte, exportadas uma a uma).
// ---------------------------------------------------------------------------

router.get("/relatorios/contabil-fiscal", withPermission(PERM.RELATORIOS_CONTABIL), async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const {data_inicio, data_fim, conta_id, tipo = "ambos"} = req.query;

        const conditions = [
            STATUS_QUITADO_SQL,
            data_inicio ? gte(lancamentosTable.data_quitacao, String(data_inicio)) : undefined,
            data_fim ? lte(lancamentosTable.data_quitacao, String(data_fim)) : undefined,
            conta_id ? sqlLancamentosDaConta(parseInt(String(conta_id))) : undefined,
            tipo !== "ambos" ? eq(lancamentosTable.tipo, tipo === "CP" ? "CP" : "CR") : undefined,
        ].filter(Boolean) as ReturnType<typeof eq>[];

        const items = await db
            .select({
                conta_bancaria: contasBancariasTable.nome,
                data_pgto: lancamentosTable.data_quitacao,
                descricao: lancamentosTable.descricao,
                nome_parceiro: parceirosTable.nome,
                valor: lancamentosTable.valor,
                desconto: lancamentosTable.desconto,
                juros: lancamentosTable.juros,
                multa: lancamentosTable.multa,
                retencao_ir: lancamentosTable.retencao_ir,
                retencao_pis: lancamentosTable.retencao_pis,
                retencao_cofins: lancamentosTable.retencao_cofins,
                retencao_csll: lancamentosTable.retencao_csll,
                retencao_inss: lancamentosTable.retencao_inss,
                retencao_iss: lancamentosTable.retencao_iss,
                valor_pago: sql<string>`COALESCE(${lancamentosTable.valor_quitado}, ${lancamentosTable.valor})`,
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
            .where(tenantWhere(lancamentosTable, empresaId, ...conditions))
            .orderBy(lancamentosTable.data_quitacao);

        return successResponse(
            res,
            items.map((i) => ({
                ...i,
                valor: toNumber(i.valor),
                desconto: toNumber(i.desconto),
                juros: toNumber(i.juros),
                multa: toNumber(i.multa),
                retencao_ir: toNumber(i.retencao_ir),
                retencao_pis: toNumber(i.retencao_pis),
                retencao_cofins: toNumber(i.retencao_cofins),
                retencao_csll: toNumber(i.retencao_csll),
                retencao_inss: toNumber(i.retencao_inss),
                retencao_iss: toNumber(i.retencao_iss),
                valor_pago: toNumber(i.valor_pago),
            })),
            {total: items.length},
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório contábil/fiscal.", e);
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/contabil-fiscal/movimentacoes
//
// Extrato da conta para conferir com o PDF do banco, linha a linha.
// - Com conta_id: saldo inicial (fim do dia anterior ao início), entradas, saídas,
//   saldo final e saldo corrido após cada linha. Mesma regra e mesmos movimentos
//   do saldo da conta (sqlMovimentosNoSaldoDaConta / saldoNaData): bate com o Painel,
//   o cadastro de contas e a conciliação. Transferências entram como CR/CP da conta.
// - Sem conta_id (todas): resumo de saldos por conta e as linhas sem saldo corrido.
// Data de início da conta: antes dela o saldo não é conhecido (zero); se a conta
// começa dentro do período, o saldo_inicial cadastrado entra como "saldo de abertura"
// na data de início (fora de entradas/saídas): inicial + abertura + entradas − saídas = final.
// Conciliado = vinculado a uma linha de extrato importado (item "vinculado").
// O filtro de tipo só esconde linhas: saldos e totais da conta são do período inteiro.
// ---------------------------------------------------------------------------

type MovimentoExtratoRow = {
    id: number;
    conta_id: number | null;
    conta_bancaria: string | null;
    data_pgto: string | null;
    descricao: string | null;
    nome_parceiro: string | null;
    categoria: string;
    tipo_documento: string | null;
    numero_documento: string | null;
    tipo: string;
    valor_quitado: string | null;
    transferencia_grupo_id: string | null;
};

async function movimentosDoExtrato(empresaId: number, ...conditions: SQL[]): Promise<MovimentoExtratoRow[]> {
    return db
        .select({
            id: lancamentosTable.id,
            conta_id: lancamentosTable.conta_id,
            conta_bancaria: contasBancariasTable.nome,
            data_pgto: lancamentosTable.data_quitacao,
            descricao: lancamentosTable.descricao,
            nome_parceiro: parceirosTable.nome,
            categoria: sql<string>`COALESCE(${planoContasTable.subcategoria}, ${planoContasTable.categoria}, CASE WHEN ${lancamentosTable.transferencia_grupo_id} IS NOT NULL THEN 'Transferência entre contas' ELSE 'Sem Categoria' END)`,
            tipo_documento: lancamentosTable.tipo_documento,
            numero_documento: lancamentosTable.numero_documento,
            tipo: lancamentosTable.tipo,
            valor_quitado: lancamentosTable.valor_quitado,
            transferencia_grupo_id: lancamentosTable.transferencia_grupo_id,
        })
        .from(lancamentosTable)
        .leftJoin(
            contasBancariasTable,
            and(eq(lancamentosTable.conta_id, contasBancariasTable.id), tenantScope(contasBancariasTable, empresaId)),
        )
        .leftJoin(
            parceirosTable,
            and(eq(lancamentosTable.parceiro_id, parceirosTable.id), tenantScope(parceirosTable, empresaId)),
        )
        .leftJoin(
            planoContasTable,
            and(eq(lancamentosTable.plano_conta_id, planoContasTable.id), tenantScope(planoContasTable, empresaId)),
        )
        .where(tenantWhere(lancamentosTable, empresaId, ...conditions));
}

/** Vínculos (item "vinculado") dos lançamentos com linhas de extrato importado. */
async function vinculosDoExtrato(empresaId: number, lancamentoIds: number[], contaId: number | null): Promise<VinculoExtrato[]> {
    const saida: VinculoExtrato[] = [];
    const LOTE = 1000;
    for (let i = 0; i < lancamentoIds.length; i += LOTE) {
        const lote = lancamentoIds.slice(i, i + LOTE);
        const rows = await db
            .select({
                lancamento_id: itensConciliacaoLancamentosTable.lancamento_id,
                conciliacao_status: statusConciliacaoEfetivoSql,
                extrato_id: conciliacoesTable.extrato_id,
                extrato_linha_id: extratoLinhasTable.id,
                data: extratoLinhasTable.data_movimento,
                valor: extratoLinhasTable.valor,
                descricao: extratoLinhasTable.descricao,
                documento: extratoLinhasTable.documento,
            })
            .from(itensConciliacaoLancamentosTable)
            .innerJoin(
                itensConciliacaoTable,
                and(
                    eq(itensConciliacaoLancamentosTable.item_conciliacao_id, itensConciliacaoTable.id),
                    tenantScope(itensConciliacaoTable, empresaId),
                ),
            )
            .innerJoin(
                conciliacoesTable,
                and(eq(itensConciliacaoTable.conciliacao_id, conciliacoesTable.id), tenantScope(conciliacoesTable, empresaId)),
            )
            .innerJoin(
                extratoLinhasTable,
                and(eq(itensConciliacaoTable.extrato_linha_id, extratoLinhasTable.id), tenantScope(extratoLinhasTable, empresaId)),
            )
            .where(
                tenantWhere(
                    itensConciliacaoLancamentosTable,
                    empresaId,
                    inArray(itensConciliacaoLancamentosTable.lancamento_id, lote),
                    eq(itensConciliacaoTable.status, "vinculado"),
                    contaId != null ? eq(conciliacoesTable.conta_id, contaId) : undefined,
                ),
            );
        saida.push(...rows);
    }
    return saida;
}

type LinhaExtratoCalculada = MovimentoExtratoRow & {
    entradaCents: number;
    saidaCents: number;
    saldoAposCents?: number;
    conciliado: boolean;
    vinculo: ResumoVinculo | null;
};

function linhaExtratoHttp(l: LinhaExtratoCalculada) {
    return {
        id: l.id,
        conta_id: l.conta_id,
        conta_bancaria: l.conta_bancaria,
        data_pgto: l.data_pgto,
        descricao: l.descricao,
        nome_parceiro: l.nome_parceiro,
        categoria: l.categoria,
        tipo_documento: l.tipo_documento,
        numero_documento: l.numero_documento,
        tipo: l.tipo,
        transferencia: l.transferencia_grupo_id != null,
        entrada: fromCents(l.entradaCents),
        saida: fromCents(l.saidaCents),
        /** Saldo da conta após a linha (null na visão de todas as contas). */
        saldo_apos: l.saldoAposCents != null ? fromCents(l.saldoAposCents) : null,
        conciliado: l.conciliado,
        extrato: l.vinculo,
    };
}

function naoConciliadosHttp(linhas: LinhaExtratoCalculada[]) {
    const r = resumirNaoConciliados(linhas);
    return {
        quantidade: r.quantidade,
        entradas: fromCents(r.entradasCents),
        saidas: fromCents(r.saidasCents),
        total: fromCents(r.totalCents),
    };
}

router.get("/relatorios/contabil-fiscal/movimentacoes", withPermission(PERM.RELATORIOS_CONTABIL), async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const leitura = lerParamsExtratoConta(req.query as Record<string, unknown>);
        if (!leitura.ok) {
            return errorResponse(res, 400, "VALIDATION_ERROR", leitura.mensagem);
        }
        const {contaId, dataInicio, dataFim, tipo} = leitura.params;
        const dataAbertura = diaAnterior(dataInicio);
        const periodo = {inicio: dataInicio, fim: dataFim};
        const noPeriodo = [
            gte(lancamentosTable.data_quitacao, dataInicio),
            lte(lancamentosTable.data_quitacao, dataFim),
        ];

        const anexarVinculos = async (movs: MovimentoExtratoRow[], contaVinculo: number | null) => {
            const vinculos = agruparVinculos(await vinculosDoExtrato(empresaId, movs.map((m) => m.id), contaVinculo));
            return ordenarMovimentos(
                movs.map((m) => {
                    const vinculo = vinculos.get(m.id) ?? null;
                    return {...m, vinculo, conciliado: vinculo != null, ordem_extrato: vinculo?.linha_id ?? null};
                }),
            );
        };

        // ── Uma conta: saldo corrido ────────────────────────────────────────────
        if (contaId != null) {
            const [conta] = await db
                .select({
                    id: contasBancariasTable.id,
                    nome: contasBancariasTable.nome,
                    banco: contasBancariasTable.banco,
                    agencia: contasBancariasTable.agencia,
                    conta: contasBancariasTable.conta,
                    data_inicio: contasBancariasTable.data_inicio,
                })
                .from(contasBancariasTable)
                .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, contaId)))
                .limit(1);
            if (!conta) {
                return errorResponse(res, 404, "NOT_FOUND", "Conta bancária não encontrada.");
            }

            const [abertura, fechamento, movs] = await Promise.all([
                contasBancariasService.saldoNaData(empresaId, contaId, dataAbertura),
                contasBancariasService.saldoNaData(empresaId, contaId, dataFim),
                movimentosDoExtrato(empresaId, ...sqlMovimentosNoSaldoDaConta(contaId, conta.data_inicio), ...noPeriodo),
            ]);

            const ordenados = await anexarVinculos(movs, contaId);
            // Antes da data de início o saldo é desconhecido (zero); o saldo_inicial
            // cadastrado entra como linha "Saldo de abertura" na data de início.
            const saldoInicialCents = toCents(abertura.saldo_decimal);
            const calc = comSaldoCorrido(saldoInicialCents, ordenados, aberturaNoPeriodo(abertura, fechamento, conta.data_inicio));
            const saldoFinalSistemaCents = toCents(fechamento.saldo_decimal);
            const linhas = filtrarPorTipo(calc.linhas, tipo);

            return successResponse(res, {
                modo: "conta" as const,
                conta,
                periodo,
                tipo,
                resumo: {
                    data_saldo_inicial: dataAbertura,
                    saldo_inicial: fromCents(saldoInicialCents),
                    /** Data de início da conta no sistema (saldo_inicial = saldo na abertura desse dia). */
                    inicio_conta: conta.data_inicio,
                    /** Período começa antes da conta: saldo inicial do período é desconhecido (zero). */
                    antes_do_inicio: abertura.antes_do_inicio,
                    /** saldo_inicial cadastrado que entra no período (0 se a conta não começa nele). */
                    saldo_abertura: fromCents(calc.abertura?.valorCents ?? 0),
                    /** Linha "Saldo de abertura" do saldo corrido (antes dos movimentos da data de início). */
                    abertura_conta: calc.abertura
                        ? {
                              data: calc.abertura.data,
                              valor: fromCents(calc.abertura.valorCents),
                              saldo_apos: fromCents(calc.abertura.saldoAposCents),
                          }
                        : null,
                    entradas: fromCents(calc.entradasCents),
                    saidas: fromCents(calc.saidasCents),
                    saldo_final: fromCents(calc.saldoFinalCents),
                    /** saldoNaData(data_fim): deve ser igual ao saldo_final (mesma regra). */
                    saldo_final_sistema: fromCents(saldoFinalSistemaCents),
                    confere: calc.saldoFinalCents === saldoFinalSistemaCents,
                },
                nao_conciliados: naoConciliadosHttp(linhas),
                linhas: linhas.map(linhaExtratoHttp),
            }, {total: linhas.length});
        }

        // ── Todas as contas: resumo por conta, sem saldo corrido ─────────────────
        const [contas, movs] = await Promise.all([
            db
                .select({
                    id: contasBancariasTable.id,
                    nome: contasBancariasTable.nome,
                    banco: contasBancariasTable.banco,
                    status: contasBancariasTable.status,
                    data_inicio: contasBancariasTable.data_inicio,
                })
                .from(contasBancariasTable)
                .where(tenantScope(contasBancariasTable, empresaId))
                .orderBy(contasBancariasTable.nome),
            movimentosDoExtrato(empresaId, STATUS_QUITADO_SQL, ...noPeriodo),
        ]);

        const ordenados = await anexarVinculos(movs, null);
        const linhas: LinhaExtratoCalculada[] = filtrarPorTipo(semSaldoCorrido(ordenados), tipo);
        const contasComMovimento = new Set(movs.map((m) => m.conta_id));
        const contasNoResumo = contas.filter((c) => contaNoResumoDoPeriodo(c, contasComMovimento.has(c.id), dataFim));

        const porConta = await Promise.all(
            contasNoResumo.map(async (c) => {
                const [abertura, fechamento] = await Promise.all([
                    contasBancariasService.saldoNaData(empresaId, c.id, dataAbertura),
                    contasBancariasService.saldoNaData(empresaId, c.id, dataFim),
                ]);
                // Entradas/saídas do período = diferença dos acumulados da mesma regra do saldo.
                const entradasCents = toCents(fechamento.creditos_quitados) - toCents(abertura.creditos_quitados);
                const saidasCents = toCents(fechamento.debitos_quitados) - toCents(abertura.debitos_quitados);
                // Conta que começa no período: saldo inicial zero e o cadastrado como abertura.
                const saldoAberturaCents = aberturaNoPeriodo(abertura, fechamento, c.data_inicio)?.valorCents ?? 0;
                return {
                    conta_id: c.id,
                    nome: c.nome,
                    banco: c.banco,
                    inicio_conta: c.data_inicio,
                    antes_do_inicio: abertura.antes_do_inicio,
                    saldoInicialCents: toCents(abertura.saldo_decimal),
                    saldoAberturaCents,
                    entradasCents,
                    saidasCents,
                    saldoFinalCents: toCents(fechamento.saldo_decimal),
                    nao_conciliados: naoConciliadosHttp(linhas.filter((l) => l.conta_id === c.id)),
                };
            }),
        );

        const soma = (f: (c: (typeof porConta)[number]) => number) => porConta.reduce((s, c) => s + f(c), 0);

        return successResponse(res, {
            modo: "todas" as const,
            conta: null,
            periodo,
            tipo,
            resumo: {
                data_saldo_inicial: dataAbertura,
                saldo_inicial: fromCents(soma((c) => c.saldoInicialCents)),
                saldo_abertura: fromCents(soma((c) => c.saldoAberturaCents)),
                entradas: fromCents(soma((c) => c.entradasCents)),
                saidas: fromCents(soma((c) => c.saidasCents)),
                saldo_final: fromCents(soma((c) => c.saldoFinalCents)),
            },
            contas: porConta.map((c) => ({
                conta_id: c.conta_id,
                nome: c.nome,
                banco: c.banco,
                inicio_conta: c.inicio_conta,
                antes_do_inicio: c.antes_do_inicio,
                saldo_inicial: fromCents(c.saldoInicialCents),
                saldo_abertura: fromCents(c.saldoAberturaCents),
                entradas: fromCents(c.entradasCents),
                saidas: fromCents(c.saidasCents),
                saldo_final: fromCents(c.saldoFinalCents),
                nao_conciliados: c.nao_conciliados,
            })),
            nao_conciliados: naoConciliadosHttp(linhas),
            linhas: linhas.map(linhaExtratoHttp),
        }, {total: linhas.length});
    } catch (e) {
        if (e instanceof AppError) {
            return errorResponse(res, e.statusCode, e.code, e.message);
        }
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar movimentações da conta.", e);
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/conciliacao  (FEAT-10 / Card 62)
//
// Relatório por conta + período: saldo inicial/final sistema, movimentações
// quitadas (sem juros no resultado), extratos do período e confronto sistema × banco.
// ---------------------------------------------------------------------------

router.get("/relatorios/conciliacao", withPermission(PERM.RELATORIOS_CONCILIACAO), async (req, res) => {
    try {
        const {empresaId} = requireTenant(req);
        const contaId = parseInt(String(req.query.conta_id ?? ""), 10);
        let dataInicio = typeof req.query.data_inicio === "string" ? req.query.data_inicio : undefined;
        let dataFim = typeof req.query.data_fim === "string" ? req.query.data_fim : undefined;

        const mesQ = req.query.mes ? parseInt(String(req.query.mes), 10) : NaN;
        const anoQ = req.query.ano ? parseInt(String(req.query.ano), 10) : NaN;
        if (!Number.isNaN(mesQ) && !Number.isNaN(anoQ) && mesQ >= 1 && mesQ <= 12) {
            dataInicio = dataInicio ?? `${anoQ}-${String(mesQ).padStart(2, "0")}-01`;
            const last = new Date(Date.UTC(anoQ, mesQ, 0)).getUTCDate();
            dataFim = dataFim ?? `${anoQ}-${String(mesQ).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
        }

        if (!contaId || Number.isNaN(contaId)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Parâmetro obrigatório: conta_id.");
        }
        if (!dataInicio || !dataFim) {
            return errorResponse(
                res,
                400,
                "VALIDATION_ERROR",
                "Informe data_inicio e data_fim, ou mes e ano.",
            );
        }

        const [conta] = await db
            .select({
                id: contasBancariasTable.id,
                nome: contasBancariasTable.nome,
                banco: contasBancariasTable.banco,
                data_inicio: contasBancariasTable.data_inicio,
            })
            .from(contasBancariasTable)
            .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, contaId)))
            .limit(1);

        if (!conta) {
            return errorResponse(res, 404, "NOT_FOUND", "Conta bancária não encontrada.");
        }

        // Dia anterior ao início = saldo de abertura do período
        const diaAntes = new Date(dataInicio + "T12:00:00Z");
        diaAntes.setUTCDate(diaAntes.getUTCDate() - 1);
        const dataAbertura = diaAntes.toISOString().slice(0, 10);

        const [saldoAbertura, saldoFechamento] = await Promise.all([
            contasBancariasService.saldoNaData(empresaId, contaId, dataAbertura),
            contasBancariasService.saldoNaData(empresaId, contaId, dataFim),
        ]);

        const movs = await db
            .select({
                tipo: lancamentosTable.tipo,
                valor_quitado: lancamentosTable.valor_quitado,
                valor: lancamentosTable.valor,
                juros: lancamentosTable.juros,
            })
            .from(lancamentosTable)
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    // Mesmos movimentos do saldo da conta (inclui a regra da data de início).
                    ...sqlMovimentosNoSaldoDaConta(contaId, conta.data_inicio),
                    gte(lancamentosTable.data_quitacao, dataInicio),
                    lte(lancamentosTable.data_quitacao, dataFim),
                ),
            );

        let creditosCents = 0;
        let debitosCents = 0;
        let jurosCreditoCents = 0;
        let jurosDebitoCents = 0;
        for (const m of movs) {
            const quitado = toCents(m.valor_quitado ?? m.valor ?? 0);
            const juros = toCents(m.juros ?? 0);
            // RN-G5 / Card 62: totais operacionais sem juros embutidos no quitado.
            const parcela = realizadoSemJurosCents(quitado, juros);
            if (m.tipo === "CR") {
                creditosCents += parcela;
                jurosCreditoCents += juros;
            } else {
                debitosCents += parcela;
                jurosDebitoCents += juros;
            }
        }

        // Identidade caixa: abertura + créditos − débitos + juros_CR − juros_CP = fechamento
        // (créditos/débitos já sem juros; juros separados por natureza).
        const jurosNetCents = jurosCreditoCents - jurosDebitoCents;
        const liquidoCaixaCents = creditosCents - debitosCents + jurosNetCents;

        const extratosPeriodo = await db
            .select({
                conciliacao_id: conciliacoesTable.id,
                extrato_id: extratosTable.id,
                arquivo_nome: extratosTable.arquivo_nome,
                periodo_inicio: conciliacoesTable.periodo_inicio,
                periodo_fim: conciliacoesTable.periodo_fim,
                data_conciliacao: conciliacoesTable.data_conciliacao,
                status: statusExtratoEfetivoSql,
                resumo_conciliados: conciliacoesTable.resumo_conciliados,
                resumo_ignorados: conciliacoesTable.resumo_ignorados,
                resumo_pendentes: conciliacoesTable.resumo_pendentes,
                resumo_total: conciliacoesTable.resumo_total,
                saldo_final_banco: extratosTable.saldo_final_banco,
                saldo_banco_data: extratosTable.saldo_banco_data,
            })
            .from(conciliacoesTable)
            .innerJoin(extratosTable, eq(conciliacoesTable.extrato_id, extratosTable.id))
            .where(
                tenantWhere(
                    conciliacoesTable,
                    empresaId,
                    eq(conciliacoesTable.conta_id, contaId),
                    lte(conciliacoesTable.periodo_inicio, dataFim),
                    gte(conciliacoesTable.periodo_fim, dataInicio),
                ),
            )
            .orderBy(desc(conciliacoesTable.periodo_fim));

        const extratosDetalhe = [];
        for (const e of extratosPeriodo) {
            const ref = e.periodo_fim ?? dataFim;
            const saldoSistema = await contasBancariasService.saldoNaData(empresaId, contaId, ref);
            const bancoCents = e.saldo_final_banco != null ? toCents(e.saldo_final_banco) : null;
            const sistemaCents = toCents(saldoSistema.saldo_decimal);
            // Extrato que termina antes da data de início da conta: sem saldo do sistema para comparar.
            const diferencaCents = bancoCents != null && !saldoSistema.antes_do_inicio ? sistemaCents - bancoCents : null;
            extratosDetalhe.push({
                ...e,
                saldo_sistema: fromCents(sistemaCents),
                saldo_banco: bancoCents != null ? fromCents(bancoCents) : null,
                diferenca: diferencaCents != null ? fromCents(diferencaCents) : null,
                bate: saldoSistema.antes_do_inicio ? null : diferencaCents === 0,
                antes_do_inicio: saldoSistema.antes_do_inicio,
            });
        }

        const ultimoComBanco = [...extratosDetalhe].reverse().find((e) => e.saldo_banco != null);
        const saldoInicialSistemaCents = toCents(saldoAbertura.saldo_decimal);
        const saldoFinalSistemaCents = toCents(saldoFechamento.saldo_decimal);
        const saldoBancoCents = ultimoComBanco ? toCents(ultimoComBanco.saldo_banco!) : null;
        const diferencaFinalCents =
            saldoBancoCents != null ? saldoFinalSistemaCents - saldoBancoCents : null;

        const totaisResumo = {
            extratos: extratosDetalhe.length,
            linhas_total: extratosDetalhe.reduce((s, e) => s + Number(e.resumo_total ?? 0), 0),
            vinculadas: extratosDetalhe.reduce((s, e) => s + Number(e.resumo_conciliados ?? 0), 0),
            ignoradas: extratosDetalhe.reduce((s, e) => s + Number(e.resumo_ignorados ?? 0), 0),
            pendentes: extratosDetalhe.reduce((s, e) => s + Number(e.resumo_pendentes ?? 0), 0),
        };

        return successResponse(res, {
            conta,
            periodo: {inicio: dataInicio, fim: dataFim},
            saldo_inicial_sistema: fromCents(saldoInicialSistemaCents),
            /** saldo_inicial cadastrado quando a conta começa dentro do período (senão 0). */
            saldo_abertura_conta: fromCents(aberturaNoPeriodo(saldoAbertura, saldoFechamento, conta.data_inicio)?.valorCents ?? 0),
            saldo_final_sistema: fromCents(saldoFinalSistemaCents),
            movimentacoes: {
                creditos_quitados: fromCents(creditosCents),
                debitos_quitados: fromCents(debitosCents),
                /** Juros CR (entrada no caixa) - fora do resultado operacional da meta. */
                juros_credito: fromCents(jurosCreditoCents),
                /** Juros CP (saída no caixa). */
                juros_debito: fromCents(jurosDebitoCents),
                /** Total absoluto (compat UI). */
                juros: fromCents(jurosCreditoCents + jurosDebitoCents),
                /** Operacional sem juros: créditos − débitos. */
                liquido: fromCents(creditosCents - debitosCents),
                /**
                 * Identidade caixa:
                 * saldo_inicial + saldo_abertura_conta + liquido_caixa ≈ saldo_final
                 * (créditos − débitos + juros_CR − juros_CP).
                 */
                liquido_caixa: fromCents(liquidoCaixaCents),
            },
            confronto: {
                saldo_sistema: fromCents(saldoFinalSistemaCents),
                saldo_banco: saldoBancoCents != null ? fromCents(saldoBancoCents) : null,
                diferenca: diferencaFinalCents != null ? fromCents(diferencaFinalCents) : null,
                bate: diferencaFinalCents === 0,
            },
            extratos: extratosDetalhe,
            totais: totaisResumo,
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório de conciliação.", e);
    }
});

export default router;
