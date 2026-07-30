import {Router} from "express";
import {and, eq, gte, lte, sql, desc, type SQLWrapper} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    conciliacoesTable,
    contasBancariasTable,
    extratosTable,
    lancamentosTable,
    metasTable,
    parceirosTable,
    planoContasTable,
} from "@workspace/db/schema";
import {errorResponse, successResponse} from "../utils/response";
import {fromCents, realizadoSemJurosCents, toCents} from "../utils/money";
import {sqlLancamentosDaConta} from "../utils/lancamentos-conta";
import {contasBancariasService} from "../domains/financial/contas-bancarias/contas-bancarias.service";
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
            })
            .from(lancamentosTable)
            .where(
                and(
                    sql`${lancamentosTable.data_quitacao}
                    IS NOT NULL`,
                    gte(lancamentosTable.data_quitacao, dataInicio),
                    lte(lancamentosTable.data_quitacao, dataFim),
                    STATUS_QUITADO_SQL,
                ),
            );

        let realizadoReceberCents = 0;
        let realizadoGastarCents = 0;
        let jurosCents = 0;
        for (const l of lancamentosMes) {
            const quitado = toCents(l.valor_quitado ?? l.valor ?? 0);
            const juros = toCents(l.juros ?? 0);
            const parcela = realizadoSemJurosCents(quitado, juros);
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
            .where(and(eq(metasTable.ano, ano), eq(metasTable.mes, mes)));

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
            /** Juros do período — fora do resultado operacional. */
            juros: fromCents(jurosCents),
            criterio: "data_quitacao",
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

router.get("/relatorios/dre", withPermission(PERM.RELATORIOS_DRE), async (req, res) => {
    try {
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

        const statusFilter = isCaixa
            ? STATUS_QUITADO_SQL
            : sql`${lancamentosTable.status}
                != 'cancelado'`;

        const rows = await db
            .select({
                mes: sql<number>`${mesExpr}`,
                tipo: lancamentosTable.tipo,
                categoria: planoContasTable.categoria,
                total: sql<number>`COALESCE(SUM(
                ${lancamentosTable.valor}
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
            const valorCents = toCents(row.total);
            const categoria = (row.categoria ?? "").toLowerCase();
            if (row.tipo === "CR") receitaBruta.set(m, (receitaBruta.get(m) ?? 0) + valorCents);
            else if (categoria.includes("imposto")) impostos.set(m, (impostos.get(m) ?? 0) + valorCents);
            else if (categoria.includes("custo")) custos.set(m, (custos.get(m) ?? 0) + valorCents);
            else despesas.set(m, (despesas.get(m) ?? 0) + valorCents);
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

router.get("/relatorios/fluxo-caixa", withPermission(PERM.RELATORIOS_FLUXO_CAIXA), async (req, res) => {
    try {
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
            .where(and(extractYearEq(lancamentosTable.data_quitacao, ano), STATUS_QUITADO_SQL))
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar fluxo de caixa.", String(e));
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/metas  (FEAT-10)
//
// Realizado = (valor_quitado − juros) por data_quitacao (RN-G5; não vencimento/competência).
// Juros ficam em campo separado e NÃO entram no valor_realizado.
// ---------------------------------------------------------------------------

router.get("/relatorios/metas", withPermission(PERM.RELATORIOS_METAS), async (req, res) => {
    try {
        const ano = parseInt(req.query.ano as string) || new Date().getFullYear();

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
                    categoria: planoContasTable.categoria,
                    mes: extractMonth(lancamentosTable.data_quitacao),
                    valor_quitado: lancamentosTable.valor_quitado,
                    valor: lancamentosTable.valor,
                    juros: lancamentosTable.juros,
                })
                .from(lancamentosTable)
                .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
                .where(
                    and(
                        sql`${lancamentosTable.data_quitacao}
                        IS NOT NULL`,
                        extractYearEq(lancamentosTable.data_quitacao, ano),
                        STATUS_QUITADO_SQL,
                    ),
                ),
        ]);

        // Agrega em centavos (DEF-06 / FEAT-10).
        // valor_quitado inclui juros embutidos (ex.: 6838 + 1162 = 8000).
        // Realizado da meta = parcela quitada SEM juros (RN-G5 / Card 62).
        const realizadoMap = new Map<string, number>();
        const jurosMap = new Map<string, number>();
        const categoriaPorPlano = new Map<number, string | null>();
        for (const r of realizadosRows) {
            if (r.plano_conta_id == null || r.mes == null) continue;
            const mesNum = Number(r.mes);
            const key = `${r.plano_conta_id}_${mesNum}`;
            const quitadoCents = toCents(r.valor_quitado ?? r.valor ?? 0);
            const jurosCents = toCents(r.juros ?? 0);
            const parcelaCents = realizadoSemJurosCents(quitadoCents, jurosCents);
            realizadoMap.set(key, (realizadoMap.get(key) ?? 0) + parcelaCents);
            jurosMap.set(key, (jurosMap.get(key) ?? 0) + jurosCents);
            if (!categoriaPorPlano.has(r.plano_conta_id)) {
                categoriaPorPlano.set(r.plano_conta_id, r.categoria ?? null);
            }
        }

        const metaKeys = new Set(metasRows.map((m) => `${m.plano_conta_id}_${m.mes}`));
        const rows = metasRows.map((m) => {
            const key = `${m.plano_conta_id}_${m.mes}`;
            const projetado = toNumber(m.valor_projetado);
            const realizado = fromCents(realizadoMap.get(key) ?? 0);
            const juros = fromCents(jurosMap.get(key) ?? 0);
            const atingimento_pct =
                projetado > 0 ? Math.round((realizado / projetado) * 10000) / 100 : null;
            return {
                ...m,
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
            rows.push({
                plano_conta_id,
                categoria: categoriaPorPlano.get(plano_conta_id) ?? null,
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório de metas.", String(e));
    }
});

// ---------------------------------------------------------------------------
// GET /relatorios/contabil-fiscal
// ---------------------------------------------------------------------------

router.get("/relatorios/contabil-fiscal", withPermission(PERM.RELATORIOS_CONTABIL), async (req, res) => {
    try {
        const {data_inicio, data_fim, conta_id, tipo = "ambos"} = req.query;

        const conditions = [
            STATUS_QUITADO_SQL,
            data_inicio ? gte(lancamentosTable.data_quitacao, String(data_inicio)) : undefined,
            data_fim ? lte(lancamentosTable.data_quitacao, String(data_fim)) : undefined,
            conta_id ? sqlLancamentosDaConta(parseInt(String(conta_id))) : undefined,
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

// ---------------------------------------------------------------------------
// GET /relatorios/conciliacao  (FEAT-10 / Card 62)
//
// Relatório por conta + período: saldo inicial/final sistema, movimentações
// quitadas (sem juros no resultado), extratos do período e confronto sistema × banco.
// ---------------------------------------------------------------------------

router.get("/relatorios/conciliacao", withPermission(PERM.RELATORIOS_CONCILIACAO), async (req, res) => {
    try {
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
            })
            .from(contasBancariasTable)
            .where(eq(contasBancariasTable.id, contaId))
            .limit(1);

        if (!conta) {
            return errorResponse(res, 404, "NOT_FOUND", "Conta bancária não encontrada.");
        }

        // Dia anterior ao início = saldo de abertura do período
        const diaAntes = new Date(dataInicio + "T12:00:00Z");
        diaAntes.setUTCDate(diaAntes.getUTCDate() - 1);
        const dataAbertura = diaAntes.toISOString().slice(0, 10);

        const [saldoAbertura, saldoFechamento] = await Promise.all([
            contasBancariasService.saldoNaData(contaId, dataAbertura),
            contasBancariasService.saldoNaData(contaId, dataFim),
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
                and(
                    sqlLancamentosDaConta(contaId),
                    gte(lancamentosTable.data_quitacao, dataInicio),
                    lte(lancamentosTable.data_quitacao, dataFim),
                    STATUS_QUITADO_SQL,
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
                status: extratosTable.status,
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
                and(
                    eq(conciliacoesTable.conta_id, contaId),
                    lte(conciliacoesTable.periodo_inicio, dataFim),
                    gte(conciliacoesTable.periodo_fim, dataInicio),
                ),
            )
            .orderBy(desc(conciliacoesTable.periodo_fim));

        const extratosDetalhe = [];
        for (const e of extratosPeriodo) {
            const ref = e.periodo_fim ?? dataFim;
            const saldoSistema = await contasBancariasService.saldoNaData(contaId, ref);
            const bancoCents = e.saldo_final_banco != null ? toCents(e.saldo_final_banco) : null;
            const sistemaCents = toCents(saldoSistema.saldo_decimal);
            const diferencaCents = bancoCents != null ? sistemaCents - bancoCents : null;
            extratosDetalhe.push({
                ...e,
                saldo_sistema: fromCents(sistemaCents),
                saldo_banco: bancoCents != null ? fromCents(bancoCents) : null,
                diferenca: diferencaCents != null ? fromCents(diferencaCents) : null,
                bate: diferencaCents === 0,
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
            saldo_final_sistema: fromCents(saldoFinalSistemaCents),
            movimentacoes: {
                creditos_quitados: fromCents(creditosCents),
                debitos_quitados: fromCents(debitosCents),
                /** Juros CR (entrada no caixa) — fora do resultado operacional da meta. */
                juros_credito: fromCents(jurosCreditoCents),
                /** Juros CP (saída no caixa). */
                juros_debito: fromCents(jurosDebitoCents),
                /** Total absoluto (compat UI). */
                juros: fromCents(jurosCreditoCents + jurosDebitoCents),
                /** Operacional sem juros: créditos − débitos. */
                liquido: fromCents(creditosCents - debitosCents),
                /**
                 * Identidade caixa:
                 * saldo_inicial + liquido_caixa ≈ saldo_final
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao gerar relatório de conciliação.", String(e));
    }
});

export default router;
