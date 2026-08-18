import {createHash} from "crypto";
import {Router} from "express";
import {z} from "zod";
import multer from "multer";
import {and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, notInArray, or, sql} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    conciliacoesTable,
    contasBancariasTable,
    extratoLinhasTable,
    extratosTable,
    historicoConciliacaoTable,
    itensConciliacaoLancamentosTable,
    itensConciliacaoTable,
    lancamentosTable,
    MOTIVOS_IGNORAR_PREDEFINIDOS,
    PARAM_MOTIVO_IGNORAR_OBRIGATORIO,
    parametrosSistemaTable,
    parceirosTable,
    regrasConciliacaoTable,
} from "@workspace/db/schema";
import {validateBody} from "../middlewares/validate";
import {errorResponse, successResponse} from "../utils/response";
import {parseOFX} from "../utils/ofx-parser";
import type {OFXParseResult} from "../utils/ofx-parser";
import {centsToDecimalString, fromCents, sumCents, toCents} from "../utils/money";
import {
    decidirVincular,
    martelarQuitacaoNoFinalizar,
    statusAbertoPorVencimento,
    statusAposDesfazerVinculo,
    statusAposQuitacao,
} from "../utils/conciliacao-vincular";
import {hashLinhaExtrato} from "../utils/extrato-hash";
import {encontrarRegraParaLinha, type RegraParaMatch} from "../utils/regras-match";
import {hojeIsoLocal} from "../utils/date-civil";
import {contasBancariasService} from "../domains/financial/contas-bancarias/contas-bancarias.service";
import {regrasConciliacaoService} from "../domains/financial/regras-conciliacao/regras-conciliacao.service";
import {promoverLancamentosAtrasados} from "../jobs/promover-atrasados";
import {withPermission} from "../middlewares/withPermission";
import {PERM} from "../constants/permissoes";

const router = Router();
const upload = multer({storage: multer.memoryStorage()});

/**
 * Erro com status/code HTTP explícitos - usado para abortar uma transaction
 * (throw) em rotas que aplicam várias ações em lote (ex.: POST .../salvar) e
 * ainda assim devolver o errorResponse correto para quem chamou, em vez de
 * cair no catch genérico 500.
 */
class ErroComStatus extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function errorComStatus(status: number, code: string, message: string): ErroComStatus {
    return new ErroComStatus(status, code, message);
}

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

/** Valida o campo de formulário multipart enviado junto ao arquivo OFX/CSV. */
const importarBodySchema = z.object({
    conta_id: z.coerce.number().int().positive("conta_id deve ser um número inteiro positivo."),
    /** Se true, importa só linhas cujo hash/FITID ainda não existem na conta (DEF-02). */
    apenas_novas: z
        .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
        .optional()
        .transform((v) => v === true || v === "true" || v === "1"),
});

const ignorarBodySchema = z
    .object({
        motivo_codigo: z.enum(MOTIVOS_IGNORAR_PREDEFINIDOS).optional(),
        motivo: z.string().trim().max(500).optional(),
    })
    .default({});

const parametrosBodySchema = z.object({
    motivo_ignorar_obrigatorio: z.boolean(),
});

async function getMotivoIgnorarObrigatorio(): Promise<boolean> {
    const [row] = await db
        .select({valor: parametrosSistemaTable.valor})
        .from(parametrosSistemaTable)
        .where(eq(parametrosSistemaTable.chave, PARAM_MOTIVO_IGNORAR_OBRIGATORIO))
        .limit(1);
    return row?.valor === "true" || row?.valor === "1";
}

/** Intervalo civil YYYY-MM-DD do mês/ano (1–12). */
function boundsDoMes(ano: number, mes: number): { inicio: string; fim: string } {
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return {inicio, fim};
}

/** Normaliza date Drizzle / Date / string para YYYY-MM-DD civil (sem getters locais). */
function toDateIso(value: unknown): string | null {
    if (value == null || value === "") return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        // Instant -> dia civil UTC (evita America/Sao_Paulo deslocar YYYY-MM-DD).
        return value.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    const iso = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

const vincularBodySchema = z.object({
    lancamentos: z
        .array(
            z.object({
                lancamento_id: z.coerce.number().int().positive(),
                desconto: z.coerce.number().min(0).optional(),
                /** Campo canônico (DEF-05). */
                juros_multa: z.coerce.number().min(0).optional(),
                /** Alias legado - mapeado para juros_multa. */
                acrescimo: z.coerce.number().min(0).optional(),
            }),
        )
        .min(1, "Envie ao menos um lançamento para vincular."),
    gerar_parcial: z.boolean().default(false),
    /** Obrigatório com 2+ lançamentos quando gerar_parcial=true (DEF-07). */
    residuo_lancamento_id: z.coerce.number().int().positive().optional(),
    /**
     * Regra de Ouro (Fase 8): quando true, só CALCULA a decisão (mesma regra
     * de negócio do backend) e devolve, sem gravar nada no banco. Usado pelo
     * modal de "Vincular" para manter o resultado só em memória no front até
     * o usuário clicar em Salvar/Conciliar na tela do extrato.
     */
    preview: z.boolean().default(false),
    /**
     * Só relevante em preview=true: contexto de rascunhos AINDA não salvos
     * nesta sessão do usuário (outras rodadas de vincular na mesma linha, ou
     * em outras linhas do mesmo extrato que já reservaram parte do MESMO
     * lançamento). Sem isso, o preview de uma 2ª rodada não sabe que a 1ª
     * já "usou" parte do extrato/lançamento e recalcula tudo do zero. No
     * Salvar de verdade isso não é necessário: as ações são aplicadas em
     * sequência dentro da MESMA transaction e cada uma já vê o efeito da
     * anterior.
     */
    contexto_rascunho: z
        .object({
            ja_vinculado_local_cents: z.number().int().min(0).default(0),
            quitado_local_por_lancamento: z.record(z.string(), z.number().int()).default({}),
            /** true quando um "Desfazer" desta MESMA linha já está
             *  rascunhado antes deste vincular (ainda não salvo) - o vínculo
             *  real no banco será descartado no Salvar, então o preview
             *  também precisa ignorá-lo agora (senão calcularia incremental
             *  sobre um vínculo que, do ponto de vista do usuário, já foi
             *  desfeito). */
            ignorar_vinculos_reais: z.boolean().default(false),
        })
        .optional(),
});

/**
 * RN-G7: edição inline de desconto / juros-multa de um vínculo já existente.
 * Vencimento do residual NÃO é editável (Decisão nº 3 - igual à origem).
 */
const atualizarVinculoBodySchema = z.object({
    desconto: z.coerce.number().min(0).optional(),
    juros_multa: z.coerce.number().min(0).optional(),
}).refine((b) => b.desconto !== undefined || b.juros_multa !== undefined, {
    message: "Informe desconto e/ou juros_multa.",
});

/** DEF-04: digitação manual de saldo_pos_linha quando o arquivo não trouxer. */
const saldoManualBodySchema = z.object({
    saldo_pos_linha: z.union([z.string(), z.number()]),
});

/**
 * RN-D3: criação de lançamento a partir do botão [+] na linha do extrato
 * (ex.: antecipação de lucro do sócio, nunca provisionada). O valor é sempre
 * o mesmo da linha - o endpoint recusa valor divergente, já que o lançamento
 * nasce quitado 1:1 com ela (sem passo extra de vincular).
 */
const criarLancamentoBodySchema = z.object({
    tipo: z.enum(["CP", "CR"]),
    vencimento: z.string().trim().min(1),
    valor: z.coerce.number().positive(),
    descricao: z.string().trim().min(1).nullable().optional(),
    parceiro_id: z.coerce.number().int().positive().nullable().optional(),
    plano_conta_id: z.coerce.number().int().positive().nullable().optional(),
    departamento_id: z.coerce.number().int().positive().nullable().optional(),
    centro_custo_id: z.coerce.number().int().positive().nullable().optional(),
    forma_pagamento: z.enum(["PIX", "TED", "Boleto"]).nullable().optional(),
});
type CriarLancamentoBody = z.infer<typeof criarLancamentoBodySchema>;

type ImportarBody = z.infer<typeof importarBodySchema>;
type VincularBody = z.infer<typeof vincularBodySchema>;
type SaldoManualBody = z.infer<typeof saldoManualBodySchema>;

/** Decimal na borda HTTP: normaliza via centavos (DEF-06). */
const toDecimal = (value: unknown) => fromCents(toCents(value));

/** Soma/subtrai dias de uma data ISO (YYYY-MM-DD), sem depender de fuso local. */
function addDaysToISO(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * Painel de conciliação (Card 42 / RN-J2, RN-J5, RN-J7, RN-J8).
 *
 * Compara SEMPRE na data final do extrato (regra D-1 do Card 41) - nunca
 * "agora". Também verifica se o saldo de abertura deste extrato bate com o
 * fechamento do extrato anterior da mesma conta (RN-J8 / exigência Receita-DRE),
 * e se linhas ignoradas explicam uma eventual diferença (RN-J5).
 */
async function buildDiagnosticoSaldo(extrato: {
    id: number;
    conta_id: number;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    saldo_final_banco: string | null;
}) {
    if (!extrato.periodo_fim) {
        return null;
    }

    // --- Saldo final: sistema × banco, na DATA FINAL do extrato (regra D-1) ---
    const saldoSistemaFinal = await contasBancariasService.saldoNaData(extrato.conta_id, extrato.periodo_fim);
    const saldoSistemaFinalCents = toCents(saldoSistemaFinal.saldo_decimal);
    const saldoBancoFinalCents = extrato.saldo_final_banco != null ? toCents(extrato.saldo_final_banco) : null;

    let diferencaCents: number | null = null;
    let bate: boolean | null = null;
    let diagnostico: string;

    if (saldoBancoFinalCents === null) {
        diagnostico = "O arquivo importado não trouxe o saldo do banco (LEDGERBAL/BALAMT). Não é possível comparar.";
    } else {
        diferencaCents = saldoSistemaFinalCents - saldoBancoFinalCents;
        bate = diferencaCents === 0;
        if (bate) {
            diagnostico = "O saldo do sistema bate com o saldo do banco.";
        } else if (diferencaCents < 0) {
            diagnostico =
                "O saldo do sistema é MENOR que o do banco: falta lançar uma entrada (crédito) ou há uma saída (débito) registrada a mais no sistema.";
        } else {
            diagnostico =
                "O saldo do sistema é MAIOR que o do banco: falta lançar uma saída (débito) ou há uma entrada (crédito) registrada a mais no sistema.";
        }
    }

    // --- Linhas ignoradas podem explicar a diferença (RN-J5) ---
    const ignoradas = await db
        .select({
            valor: extratoLinhasTable.valor,
            tipo_movimento: extratoLinhasTable.tipo_movimento,
        })
        .from(extratoLinhasTable)
        .innerJoin(itensConciliacaoTable, eq(itensConciliacaoTable.extrato_linha_id, extratoLinhasTable.id))
        .where(and(eq(extratoLinhasTable.extrato_id, extrato.id), eq(itensConciliacaoTable.status, "ignorado")));

    const somaIgnoradasCents = sumCents(
        ignoradas.map((l) => (l.tipo_movimento === "credito" ? toCents(l.valor) : -toCents(l.valor))),
    );

    // "Explicam a diferença" quando reintegrar as linhas ignoradas move o saldo
    // do sistema na direção do saldo do banco (mesmo sinal do gap observado).
    const linhasIgnoradasExplicam =
        diferencaCents !== null &&
        diferencaCents !== 0 &&
        somaIgnoradasCents !== 0 &&
        Math.sign(somaIgnoradasCents) === Math.sign(diferencaCents);

    // --- Saldo inicial: fechamento do extrato anterior deve bater com o sistema
    //     no dia anterior ao início deste extrato (RN-J8 / fechamento de período) ---
    let saldoInicialCheck: {
        data_referencia: string;
        extrato_anterior_id: number;
        saldo_sistema: number;
        saldo_extrato_anterior: number;
        diferenca: number;
        bate: boolean;
    } | null = null;

    if (extrato.periodo_inicio) {
        const [extratoAnterior] = await db
            .select({
                id: extratosTable.id,
                periodo_fim: extratosTable.periodo_fim,
                saldo_final_banco: extratosTable.saldo_final_banco,
            })
            .from(extratosTable)
            .where(
                and(
                    eq(extratosTable.conta_id, extrato.conta_id),
                    lt(extratosTable.periodo_fim, extrato.periodo_inicio),
                ),
            )
            .orderBy(desc(extratosTable.periodo_fim))
            .limit(1);

        if (extratoAnterior?.saldo_final_banco != null) {
            const dataRef = addDaysToISO(extrato.periodo_inicio, -1);
            const saldoSistemaAbertura = await contasBancariasService.saldoNaData(extrato.conta_id, dataRef);
            const saldoSistemaAberturaCents = toCents(saldoSistemaAbertura.saldo_decimal);
            const saldoExtratoAnteriorCents = toCents(extratoAnterior.saldo_final_banco);
            const diferencaAberturaCents = saldoSistemaAberturaCents - saldoExtratoAnteriorCents;

            saldoInicialCheck = {
                data_referencia: dataRef,
                extrato_anterior_id: extratoAnterior.id,
                saldo_sistema: fromCents(saldoSistemaAberturaCents),
                saldo_extrato_anterior: fromCents(saldoExtratoAnteriorCents),
                diferenca: fromCents(diferencaAberturaCents),
                bate: diferencaAberturaCents === 0,
            };
        }
        // Se não há extrato anterior (primeiro extrato da conta), não há o que
        // comparar - saldoInicialCheck permanece null e a UI não exibe o bloco.
    }

    return {
        data_referencia: extrato.periodo_fim,
        saldo_sistema: fromCents(saldoSistemaFinalCents),
        saldo_banco: saldoBancoFinalCents !== null ? fromCents(saldoBancoFinalCents) : null,
        diferenca: diferencaCents !== null ? fromCents(diferencaCents) : null,
        bate,
        diagnostico,
        linhas_ignoradas_valor: fromCents(somaIgnoradasCents),
        linhas_ignoradas_explicam: linhasIgnoradasExplicam,
        saldo_inicial: saldoInicialCheck,
    };
}

const atualizarResumoConciliacao = async (
    tx: typeof db,
    conciliacaoId: number,
    extratoId: number,
) => {
    const statusRows = await tx
        .select({status: itensConciliacaoTable.status, total: count()})
        .from(itensConciliacaoTable)
        .where(eq(itensConciliacaoTable.conciliacao_id, conciliacaoId))
        .groupBy(itensConciliacaoTable.status);

    const conciliados = Number(statusRows.find((r) => r.status === "vinculado")?.total ?? 0);
    const ignorados = Number(statusRows.find((r) => r.status === "ignorado")?.total ?? 0);
    const pendentes = Number(statusRows.find((r) => r.status === "pendente")?.total ?? 0);
    const total = conciliados + ignorados + pendentes;

    const statusConciliacao = pendentes === 0 ? "conciliado" : "pendente";
    const statusExtrato = pendentes === 0 ? "conciliado" : (conciliados + ignorados > 0 ? "parcial" : "pendente");

    await tx
        .update(conciliacoesTable)
        .set({
            resumo_conciliados: conciliados,
            resumo_ignorados: ignorados,
            resumo_pendentes: pendentes,
            resumo_total: total,
            status: statusConciliacao,
            updated_at: new Date(),
        })
        .where(eq(conciliacoesTable.id, conciliacaoId));

    await tx
        .update(extratosTable)
        .set({
            status: statusExtrato,
            updated_at: new Date(),
        })
        .where(eq(extratosTable.id, extratoId));
};

router.get("/conciliacoes", withPermission(PERM.CONCILIACAO_ACESSAR), async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const conditions = [];
        if (req.query.status) {
            conditions.push(
                eq(
                    extratosTable.status,
                    req.query.status as "pendente" | "parcial" | "conciliado" | "cancelado",
                ),
            );
        }
        if (req.query.conta_id) {
            conditions.push(eq(conciliacoesTable.conta_id, parseInt(req.query.conta_id as string)));
        }

        // DEF-11: filtra pelo período do extrato (não pela data_conciliacao)
        let dataInicio = typeof req.query.data_inicio === "string" ? req.query.data_inicio : undefined;
        let dataFim = typeof req.query.data_fim === "string" ? req.query.data_fim : undefined;

        const mesQ = req.query.mes ? parseInt(req.query.mes as string, 10) : NaN;
        const anoQ = req.query.ano ? parseInt(req.query.ano as string, 10) : NaN;
        if (!Number.isNaN(mesQ) && !Number.isNaN(anoQ) && mesQ >= 1 && mesQ <= 12 && anoQ >= 2000) {
            const b = boundsDoMes(anoQ, mesQ);
            dataInicio = dataInicio ?? b.inicio;
            dataFim = dataFim ?? b.fim;
        }

        if (dataInicio && dataFim) {
            // Interseção: periodo_inicio <= data_fim AND periodo_fim >= data_inicio
            conditions.push(
                and(
                    lte(conciliacoesTable.periodo_inicio, dataFim),
                    gte(conciliacoesTable.periodo_fim, dataInicio),
                )!,
            );
        } else if (dataInicio) {
            conditions.push(gte(conciliacoesTable.periodo_fim, dataInicio));
        } else if (dataFim) {
            conditions.push(lte(conciliacoesTable.periodo_inicio, dataFim));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db
            .select({count: count()})
            .from(conciliacoesTable)
            .innerJoin(extratosTable, eq(conciliacoesTable.extrato_id, extratosTable.id))
            .where(where);

        const items = await db
            .select({
                conciliacao_id: conciliacoesTable.id,
                extrato_id: extratosTable.id,
                conta_id: conciliacoesTable.conta_id,
                conta_nome: contasBancariasTable.nome,
                conta_agencia: contasBancariasTable.agencia,
                conta_digito_agencia: contasBancariasTable.digito_agencia,
                conta_numero: contasBancariasTable.conta,
                conta_digito: contasBancariasTable.digito_conta,
                arquivo_nome: extratosTable.arquivo_nome,
                periodo_inicio: conciliacoesTable.periodo_inicio,
                periodo_fim: conciliacoesTable.periodo_fim,
                data_conciliacao: conciliacoesTable.data_conciliacao,
                status: extratosTable.status,
                resumo_conciliados: conciliacoesTable.resumo_conciliados,
                resumo_ignorados: conciliacoesTable.resumo_ignorados,
                resumo_pendentes: conciliacoesTable.resumo_pendentes,
                resumo_total: conciliacoesTable.resumo_total,
                created_at: extratosTable.created_at,
            })
            .from(conciliacoesTable)
            .innerJoin(extratosTable, eq(conciliacoesTable.extrato_id, extratosTable.id))
            .leftJoin(contasBancariasTable, eq(conciliacoesTable.conta_id, contasBancariasTable.id))
            .where(where)
            .orderBy(desc(extratosTable.created_at))
            .limit(limit)
            .offset(offset);

        return successResponse(res, items, {total: Number(totalResult.count), page, limit});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar conciliações.", String(e));
    }
});

/** Exclui extrato + conciliação ainda não finalizada (lista principal — lixeira). */
router.delete(
    "/conciliacoes/:extrato_id",
    withPermission(PERM.CONCILIACAO_IMPORTAR),
    async (req, res) => {
        try {
            const extratoId = Number(req.params.extrato_id);
            if (!Number.isFinite(extratoId) || extratoId <= 0) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "extrato_id inválido.");
            }

            const [extrato] = await db
                .select()
                .from(extratosTable)
                .where(eq(extratosTable.id, extratoId))
                .limit(1);
            if (!extrato) {
                return errorResponse(res, 404, "NOT_FOUND", "Extrato não encontrado.");
            }
            if (extrato.status === "conciliado") {
                return errorResponse(
                    res,
                    409,
                    "CONFLICT",
                    "Não é possível excluir um extrato já conciliado.",
                );
            }

            const [conciliacao] = await db
                .select()
                .from(conciliacoesTable)
                .where(eq(conciliacoesTable.extrato_id, extratoId))
                .limit(1);

            let residuoIds: number[] = [];
            if (conciliacao) {
                const itensPrevio = await db
                    .select({id: itensConciliacaoTable.id})
                    .from(itensConciliacaoTable)
                    .where(eq(itensConciliacaoTable.conciliacao_id, conciliacao.id));
                const itemIdsPrevio = itensPrevio.map((i) => i.id);

                if (itemIdsPrevio.length > 0) {
                    const vinculosPrevio = await db
                        .select({lancamento_id: itensConciliacaoLancamentosTable.lancamento_id})
                        .from(itensConciliacaoLancamentosTable)
                        .where(inArray(itensConciliacaoLancamentosTable.item_conciliacao_id, itemIdsPrevio));

                    if (vinculosPrevio.length > 0) {
                        const residuos = await db
                            .select({id: lancamentosTable.id, status: lancamentosTable.status})
                            .from(lancamentosTable)
                            .where(
                                and(
                                    eq(lancamentosTable.is_residuo_parcial, true),
                                    inArray(
                                        lancamentosTable.lancamento_origem_id,
                                        vinculosPrevio.map((v) => v.lancamento_id),
                                    ),
                                ),
                            );

                        const residuoQuitado = residuos.find(
                            (r) => r.status === "pago" || r.status === "recebido" || r.status === "pago_parcial",
                        );
                        if (residuoQuitado) {
                            return errorResponse(
                                res,
                                409,
                                "CONFLICT",
                                `Não é possível excluir: o residual #${residuoQuitado.id} já foi quitado. Estorne o residual antes.`,
                            );
                        }

                        residuoIds = residuos.map((r) => r.id);
                    }
                }
            }

            await db.transaction(async (tx) => {
                if (conciliacao) {
                    const itens = await tx
                        .select({id: itensConciliacaoTable.id})
                        .from(itensConciliacaoTable)
                        .where(eq(itensConciliacaoTable.conciliacao_id, conciliacao.id));
                    const itemIds = itens.map((i) => i.id);

                    if (residuoIds.length > 0) {
                        await tx.delete(lancamentosTable).where(inArray(lancamentosTable.id, residuoIds));
                    }

                    if (itemIds.length > 0) {
                        await tx
                            .delete(itensConciliacaoLancamentosTable)
                            .where(inArray(itensConciliacaoLancamentosTable.item_conciliacao_id, itemIds));
                    }

                    await tx
                        .delete(historicoConciliacaoTable)
                        .where(eq(historicoConciliacaoTable.conciliacao_id, conciliacao.id));

                    await tx
                        .delete(itensConciliacaoTable)
                        .where(eq(itensConciliacaoTable.conciliacao_id, conciliacao.id));

                    await tx.delete(conciliacoesTable).where(eq(conciliacoesTable.id, conciliacao.id));
                }

                await tx.delete(extratoLinhasTable).where(eq(extratoLinhasTable.extrato_id, extratoId));
                await tx.delete(extratosTable).where(eq(extratosTable.id, extratoId));
            });

            return successResponse(res, {deleted: true, extrato_id: extratoId});
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao excluir extrato.", String(e));
        }
    },
);
/** FEAT-07: pendências por mês (informativo). Deve ficar ANTES de /:extrato_id. */
router.get("/conciliacoes/pendencias-mes", withPermission(PERM.CONCILIACAO_ACESSAR), async (req, res) => {
    try {
        const hojeCivil = hojeIsoLocal(); // YYYY-MM-DD America/Sao_Paulo
        const [anoCivil, mesCivil] = hojeCivil.split("-").map(Number);
        const mesRef = req.query.mes ? parseInt(req.query.mes as string, 10) : mesCivil!;
        const anoRef = req.query.ano ? parseInt(req.query.ano as string, 10) : anoCivil!;

        // Inclui mês de referência e meses anteriores com pendência (últimos 6)
        const mesesAlvo: { mes: number; ano: number; inicio: string; fim: string }[] = [];
        for (let i = 0; i < 6; i++) {
            let m = mesRef - i;
            let a = anoRef;
            while (m <= 0) {
                m += 12;
                a -= 1;
            }
            const b = boundsDoMes(a, m);
            mesesAlvo.push({mes: m, ano: a, inicio: b.inicio, fim: b.fim});
        }

        const rows = await db
            .select({
                conciliacao_id: conciliacoesTable.id,
                extrato_id: extratosTable.id,
                conta_id: conciliacoesTable.conta_id,
                conta_nome: contasBancariasTable.nome,
                periodo_inicio: conciliacoesTable.periodo_inicio,
                periodo_fim: conciliacoesTable.periodo_fim,
                status: extratosTable.status,
                resumo_pendentes: conciliacoesTable.resumo_pendentes,
            })
            .from(conciliacoesTable)
            .innerJoin(extratosTable, eq(conciliacoesTable.extrato_id, extratosTable.id))
            .leftJoin(contasBancariasTable, eq(conciliacoesTable.conta_id, contasBancariasTable.id))
            .where(
                and(
                    inArray(extratosTable.status, ["pendente", "parcial"]),
                    gte(conciliacoesTable.periodo_fim, mesesAlvo[mesesAlvo.length - 1]!.inicio),
                    lte(conciliacoesTable.periodo_inicio, mesesAlvo[0]!.fim),
                ),
            );

        const linhasDatas = await db
            .select({
                conta_id: extratoLinhasTable.conta_id,
                data_movimento: extratoLinhasTable.data_movimento,
            })
            .from(extratoLinhasTable)
            .where(
                and(
                    gte(extratoLinhasTable.data_movimento, mesesAlvo[mesesAlvo.length - 1]!.inicio),
                    lte(extratoLinhasTable.data_movimento, mesesAlvo[0]!.fim),
                ),
            );

        const datasPorContaMes = new Map<string, Set<string>>();
        for (const l of linhasDatas) {
            if (!l.data_movimento) continue;
            const [y, m] = l.data_movimento.split("-");
            const key = `${l.conta_id}:${y}-${m}`;
            if (!datasPorContaMes.has(key)) datasPorContaMes.set(key, new Set());
            datasPorContaMes.get(key)!.add(l.data_movimento);
        }

        const meses = mesesAlvo
            .map(({mes, ano, inicio, fim}) => {
                const doMes = rows.filter((r) => {
                    if (!r.periodo_inicio || !r.periodo_fim) return false;
                    return r.periodo_inicio <= fim && r.periodo_fim >= inicio;
                });
                if (doMes.length === 0) return null;

                const contasMap = new Map<
                    number,
                    {
                        conta_id: number;
                        conta_nome: string | null;
                        extratos_pendentes: number;
                        linhas_pendentes: number;
                        dias_com_extrato: string[];
                        dias_sem_extrato: string[];
                    }
                >();

                for (const r of doMes) {
                    const prev = contasMap.get(r.conta_id) ?? {
                        conta_id: r.conta_id,
                        conta_nome: r.conta_nome,
                        extratos_pendentes: 0,
                        linhas_pendentes: 0,
                        dias_com_extrato: [] as string[],
                        dias_sem_extrato: [] as string[],
                    };
                    prev.extratos_pendentes += 1;
                    prev.linhas_pendentes += Number(r.resumo_pendentes ?? 0);
                    contasMap.set(r.conta_id, prev);
                }

                const contas = [...contasMap.values()].map((c) => {
                    const key = `${c.conta_id}:${ano}-${String(mes).padStart(2, "0")}`;
                    const comExtrato = datasPorContaMes.get(key) ?? new Set<string>();
                    const diasCom = [...comExtrato].sort();
                    // Buracos: dias entre min e max cobertos sem linha
                    const buracos: string[] = [];
                    if (diasCom.length >= 2) {
                        const cursor = new Date(diasCom[0]! + "T12:00:00Z");
                        const end = new Date(diasCom[diasCom.length - 1]! + "T12:00:00Z");
                        while (cursor < end) {
                            cursor.setUTCDate(cursor.getUTCDate() + 1);
                            const iso = cursor.toISOString().slice(0, 10);
                            if (iso >= diasCom[diasCom.length - 1]!) break;
                            if (!comExtrato.has(iso)) buracos.push(iso);
                        }
                    }
                    return {
                        ...c,
                        dias_com_extrato: diasCom,
                        dias_sem_extrato: buracos.slice(0, 31),
                    };
                });

                return {
                    mes,
                    ano,
                    extratos_pendentes: doMes.length,
                    linhas_pendentes: doMes.reduce((s, r) => s + Number(r.resumo_pendentes ?? 0), 0),
                    contas,
                };
            })
            .filter((m): m is NonNullable<typeof m> => m !== null && m.extratos_pendentes > 0);

        return successResponse(res, {meses});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao consultar pendências do mês.", String(e));
    }
});

/** FEAT-06: parâmetro motivo_ignorar_obrigatorio */
router.get("/conciliacoes/parametros", withPermission(PERM.CONCILIACAO_ACESSAR), async (_req, res) => {
    try {
        const obrigatorio = await getMotivoIgnorarObrigatorio();
        return successResponse(res, {
            motivo_ignorar_obrigatorio: obrigatorio,
            motivos_predefinidos: MOTIVOS_IGNORAR_PREDEFINIDOS,
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao ler parâmetros.", String(e));
    }
});

router.put(
    "/conciliacoes/parametros",
    withPermission(PERM.CONCILIACAO_CONFIGURAR),
    validateBody(parametrosBodySchema),
    async (req, res) => {
        try {
            const {motivo_ignorar_obrigatorio} = req.body as z.infer<typeof parametrosBodySchema>;
            await db
                .insert(parametrosSistemaTable)
                .values({
                    chave: PARAM_MOTIVO_IGNORAR_OBRIGATORIO,
                    valor: motivo_ignorar_obrigatorio ? "true" : "false",
                    updated_at: new Date(),
                })
                .onConflictDoUpdate({
                    target: parametrosSistemaTable.chave,
                    set: {
                        valor: motivo_ignorar_obrigatorio ? "true" : "false",
                        updated_at: new Date(),
                    },
                });
            return successResponse(res, {motivo_ignorar_obrigatorio});
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar parâmetros.", String(e));
        }
    });

/** FEAT-08: dispara promoção pendente -> atrasado (também roda no job periódico). */
router.post(
    "/conciliacoes/jobs/promover-atrasados",
    withPermission(PERM.CONCILIACAO_CONFIGURAR),
    async (_req, res) => {
        try {
            const result = await promoverLancamentosAtrasados();
            return successResponse(res, result);
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao promover atrasados.", String(e));
        }
    });

function enrichTransacoesComHash(
    contaId: number,
    transacoes: OFXParseResult["transacoes"],
) {
    return transacoes.map((t) => ({
        ...t,
        hash_linha: hashLinhaExtrato({
            contaId,
            data: t.data,
            tipo: t.tipo,
            valor: t.valor,
            descricao: t.descricao,
            ordinalNoGrupo: t.ordinal_no_grupo,
        }),
    }));
}

async function parseExtratoUpload(req: {
    file?: { buffer: Buffer; originalname: string };
}): Promise<
    | { parsed: OFXParseResult }
    | { error: { status: number; code: string; message: string; detail?: string } }
> {
    if (!req.file) {
        return {error: {status: 400, code: "VALIDATION_ERROR", message: "Campo obrigatório: arquivo OFX."}};
    }
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "ofx") {
        return {
            error: {
                status: 400,
                code: "VALIDATION_ERROR",
                message: "Formato não suportado. Envie apenas arquivo OFX.",
            },
        };
    }
    try {
        const parsed = parseOFX(req.file.buffer);
        return {parsed};
    } catch (parseErr) {
        return {
            error: {
                status: 422,
                code: "PARSE_ERROR",
                message: "Arquivo OFX inválido ou malformado.",
                detail: String(parseErr),
            },
        };
    }
}

/** Pré-análise sem persistir (DEF-02). */
router.post(
    "/conciliacoes/pre-analise",
    withPermission(PERM.CONCILIACAO_IMPORTAR),
    upload.single("arquivo"),
    validateBody(importarBodySchema),
    async (req, res) => {
        const {conta_id} = req.body as ImportarBody;
        const [conta] = await db
            .select({id: contasBancariasTable.id})
            .from(contasBancariasTable)
            .where(eq(contasBancariasTable.id, conta_id))
            .limit(1);
        if (!conta) {
            return errorResponse(res, 404, "NOT_FOUND", "Conta bancária não encontrada.");
        }

        const parsedOrErr = await parseExtratoUpload(req);
        if ("error" in parsedOrErr) {
            const e = parsedOrErr.error;
            return errorResponse(res, e.status, e.code, e.message, e.detail);
        }
        const {parsed} = parsedOrErr;
        const enriched = enrichTransacoesComHash(conta_id, parsed.transacoes);
        const hashes = enriched.map((t) => t.hash_linha);
        const fitids = enriched.map((t) => t.fitid).filter(Boolean);

        const existentes =
            hashes.length === 0
                ? []
                : await db
                    .select({
                        hash_linha: extratoLinhasTable.hash_linha,
                        identificador_externo: extratoLinhasTable.identificador_externo,
                        item_status: itensConciliacaoTable.status,
                    })
                    .from(extratoLinhasTable)
                    .leftJoin(
                        itensConciliacaoTable,
                        eq(itensConciliacaoTable.extrato_linha_id, extratoLinhasTable.id),
                    )
                    .where(
                        and(
                            eq(extratoLinhasTable.conta_id, conta_id),
                            or(
                                inArray(extratoLinhasTable.hash_linha, hashes),
                                fitids.length > 0
                                    ? inArray(extratoLinhasTable.identificador_externo, fitids)
                                    : sql`false`,
                            ),
                        ),
                    );

        const existingKeys = new Set<string>();
        let jaConciliadas = 0;
        for (const row of existentes) {
            if (row.hash_linha) existingKeys.add(`h:${row.hash_linha}`);
            if (row.identificador_externo) existingKeys.add(`f:${row.identificador_externo}`);
            if (row.item_status === "vinculado" || row.item_status === "ignorado") {
                jaConciliadas += 1;
            }
        }

        const novas = enriched.filter(
            (t) => !existingKeys.has(`h:${t.hash_linha}`) && !existingKeys.has(`f:${t.fitid}`),
        ).length;
        const jaExistentes = enriched.length - novas;

        return successResponse(res, {
            total_linhas: enriched.length,
            ja_existentes: jaExistentes,
            ja_conciliadas: jaConciliadas,
            novas,
            periodo_inicio: parsed.periodo_inicio,
            periodo_fim: parsed.periodo_fim,
            saldo_final_banco: parsed.saldo_final_banco,
            saldo_banco_data: parsed.saldo_banco_data,
        });
    },
);

router.post(
    "/conciliacoes/importar",
    withPermission(PERM.CONCILIACAO_IMPORTAR),
    upload.single("arquivo"),
    validateBody(importarBodySchema),
    async (req, res) => {
        const {conta_id, apenas_novas: apenasNovas} = req.body as ImportarBody;

        const [conta] = await db
            .select({id: contasBancariasTable.id, nome: contasBancariasTable.nome})
            .from(contasBancariasTable)
            .where(eq(contasBancariasTable.id, conta_id))
            .limit(1);

        if (!conta) {
            return errorResponse(res, 404, "NOT_FOUND", "Conta bancária não encontrada.");
        }

        const parsedOrErr = await parseExtratoUpload(req);
        if ("error" in parsedOrErr) {
            const e = parsedOrErr.error;
            return errorResponse(res, e.status, e.code, e.message, e.detail);
        }
        const {parsed} = parsedOrErr;
        const enriched = enrichTransacoesComHash(conta_id, parsed.transacoes);

        const hashes = enriched.map((t) => t.hash_linha);
        const fitids = enriched.map((t) => t.fitid).filter(Boolean);
        const existentes = await db
            .select({
                hash_linha: extratoLinhasTable.hash_linha,
                identificador_externo: extratoLinhasTable.identificador_externo,
            })
            .from(extratoLinhasTable)
            .where(
                and(
                    eq(extratoLinhasTable.conta_id, conta_id),
                    or(
                        inArray(extratoLinhasTable.hash_linha, hashes),
                        fitids.length > 0
                            ? inArray(extratoLinhasTable.identificador_externo, fitids)
                            : sql`false`,
                    ),
                ),
            );

        const existingKeys = new Set<string>();
        for (const row of existentes) {
            if (row.hash_linha) existingKeys.add(`h:${row.hash_linha}`);
            if (row.identificador_externo) existingKeys.add(`f:${row.identificador_externo}`);
        }

        const filtrarNovas = apenasNovas !== false; // default: só novas
        const paraImportar = filtrarNovas
            ? enriched.filter(
                (t) => !existingKeys.has(`h:${t.hash_linha}`) && !existingKeys.has(`f:${t.fitid}`),
            )
            : enriched;

        if (paraImportar.length === 0) {
            return errorResponse(
                res,
                409,
                "CONFLICT",
                "Todas as linhas deste arquivo já existem nesta conta. Nada a importar.",
            );
        }

        const arquivoHash = createHash("sha256").update(req.file!.buffer).digest("hex");

        const totalCreditosCents = sumCents(
            paraImportar.filter((t) => t.tipo === "credito").map((t) => toCents(t.valor)),
        );
        const totalDebitosCents = sumCents(
            paraImportar.filter((t) => t.tipo === "debito").map((t) => toCents(t.valor)),
        );

        const datas = paraImportar.map((t) => t.data).sort();
        const periodo_inicio = datas[0]!;
        const periodo_fim = datas[datas.length - 1]!;

        const regrasDb = await regrasConciliacaoService.listarAtivasParaMatch(conta_id);
        const regras: RegraParaMatch[] = regrasDb.map((r) => ({
            id: r.id,
            texto_gatilho: r.texto_gatilho,
            tipo_match: r.tipo_match,
            natureza: r.natureza,
            criar_lancamento_automatico: r.criar_lancamento_automatico,
            plano_conta_id: r.plano_conta_id,
            parceiro_id: r.parceiro_id,
            departamento_id: r.departamento_id,
            centro_custo_id: r.centro_custo_id,
            forma_pagamento: r.forma_pagamento,
        }));

        const resultado = await db.transaction(async (tx) => {
            const [extrato] = await tx
                .insert(extratosTable)
                .values({
                    conta_id,
                    periodo_inicio,
                    periodo_fim,
                    arquivo_nome: req.file!.originalname,
                    arquivo_hash: arquivoHash,
                    total_linhas: paraImportar.length,
                    total_creditos: centsToDecimalString(totalCreditosCents),
                    total_debitos: centsToDecimalString(totalDebitosCents),
                    saldo_final_banco: parsed.saldo_final_banco,
                    saldo_banco_data: parsed.saldo_banco_data,
                    status: "pendente",
                })
                .returning();

            const [conciliacao] = await tx
                .insert(conciliacoesTable)
                .values({
                    extrato_id: extrato.id,
                    conta_id,
                    periodo_inicio,
                    periodo_fim,
                    arquivo_nome: req.file!.originalname,
                    status: "pendente",
                    resumo_conciliados: 0,
                    resumo_ignorados: 0,
                    resumo_pendentes: paraImportar.length,
                    resumo_total: paraImportar.length,
                    resumo_classificadas_automaticamente: 0,
                })
                .returning();

            const linhasInseridas = await tx
                .insert(extratoLinhasTable)
                .values(
                    paraImportar.map((t) => ({
                        extrato_id: extrato.id,
                        conta_id,
                        identificador_externo: t.fitid,
                        hash_linha: t.hash_linha,
                        valor: t.valor,
                        tipo_movimento: t.tipo,
                        descricao: t.descricao,
                        data_movimento: t.data,
                        saldo_pos_linha: t.saldo_pos_linha,
                    })),
                )
                .returning({
                    id: extratoLinhasTable.id,
                    valor: extratoLinhasTable.valor,
                    tipo_movimento: extratoLinhasTable.tipo_movimento,
                    descricao: extratoLinhasTable.descricao,
                    data_movimento: extratoLinhasTable.data_movimento,
                });

            // Card 48 / FEAT-03: match por texto_gatilho antes de gravar itens.
            const matchPorLinhaId = new Map<number, RegraParaMatch>();
            for (const l of linhasInseridas) {
                const regra = encontrarRegraParaLinha(regras, {
                    tipo_movimento: l.tipo_movimento,
                    descricao: l.descricao,
                });
                if (regra) matchPorLinhaId.set(l.id, regra);
            }

            const itensInseridos = await tx
                .insert(itensConciliacaoTable)
                .values(
                    linhasInseridas.map((l) => {
                        const regra = matchPorLinhaId.get(l.id);
                        return {
                            conciliacao_id: conciliacao.id,
                            extrato_linha_id: l.id,
                            valor_extrato: l.valor,
                            valor_vinculado_total: "0.00",
                            valor_saldo: l.valor,
                            status: "pendente" as const,
                            tipo_extrato: l.tipo_movimento,
                            descricao: l.descricao,
                            data: l.data_movimento,
                            regra_id: regra?.id ?? null,
                            classificacao_automatica: Boolean(regra),
                        };
                    }),
                )
                .returning({
                    id: itensConciliacaoTable.id,
                    extrato_linha_id: itensConciliacaoTable.extrato_linha_id,
                    valor_extrato: itensConciliacaoTable.valor_extrato,
                    tipo_extrato: itensConciliacaoTable.tipo_extrato,
                });

            let classificadas = 0;
            for (const item of itensInseridos) {
                const regra = matchPorLinhaId.get(item.extrato_linha_id);
                if (!regra) continue;
                classificadas += 1;

                if (!regra.criar_lancamento_automatico) continue;

                const linha = linhasInseridas.find((l) => l.id === item.extrato_linha_id);
                if (!linha) continue;

                const valorCents = toCents(item.valor_extrato);
                const tipoLancamento = item.tipo_extrato === "credito" ? "CR" : "CP";
                const dataMovimento = toDateIso(linha.data_movimento) ?? hojeIsoLocal();
                // Status pago/recebido só na finalização da conciliação.
                const statusAberto = statusAbertoPorVencimento(dataMovimento, hojeIsoLocal());

                const [novoLancamento] = await tx
                    .insert(lancamentosTable)
                    .values({
                        tipo: tipoLancamento,
                        vencimento: dataMovimento,
                        conta_id,
                        parceiro_id: regra.parceiro_id,
                        descricao: linha.descricao,
                        valor: centsToDecimalString(valorCents),
                        status: statusAberto,
                        origem: "conciliacao",
                        plano_conta_id: regra.plano_conta_id,
                        departamento_id: regra.departamento_id,
                        centro_custo_id: regra.centro_custo_id,
                        forma_pagamento: regra.forma_pagamento,
                        criado_por: req.user?.id,
                    })
                    .returning({id: lancamentosTable.id});

                await tx.insert(itensConciliacaoLancamentosTable).values({
                    item_conciliacao_id: item.id,
                    lancamento_id: novoLancamento.id,
                    valor_vinculado: centsToDecimalString(valorCents),
                    desconto: "0.00",
                    juros_multa: "0.00",
                });

                await tx
                    .update(itensConciliacaoTable)
                    .set({
                        status: "vinculado",
                        valor_vinculado_total: centsToDecimalString(valorCents),
                        valor_saldo: "0.00",
                        data_conciliacao: hojeIsoLocal(),
                        updated_at: new Date(),
                    })
                    .where(eq(itensConciliacaoTable.id, item.id));

                await tx.insert(historicoConciliacaoTable).values({
                    conciliacao_id: conciliacao.id,
                    item_conciliacao_id: item.id,
                    usuario_id: req.user?.id,
                    acao: "vincular",
                    detalhes: JSON.stringify({
                        linha_id: linha.id,
                        acao: "classificacao_automatica",
                        regra_id: regra.id,
                        lancamento_id: novoLancamento.id,
                    }),
                });
            }

            await tx
                .update(conciliacoesTable)
                .set({
                    resumo_classificadas_automaticamente: classificadas,
                    updated_at: new Date(),
                })
                .where(eq(conciliacoesTable.id, conciliacao.id));

            await atualizarResumoConciliacao(tx, conciliacao.id, extrato.id);

            return {conciliacao, extrato, classificadas};
        });

        return successResponse(
            res,
            {
                conciliacao_id: resultado.conciliacao.id,
                extrato_id: resultado.extrato.id,
                extrato: {id: resultado.extrato.id, arquivo_nome: req.file!.originalname},
                conciliacao: {id: resultado.conciliacao.id},
                conta_id,
                conta_nome: conta.nome,
                total_linhas: paraImportar.length,
                linhas_ignoradas_duplicadas: enriched.length - paraImportar.length,
                linhas_classificadas_automaticamente: resultado.classificadas,
                total_creditos: fromCents(totalCreditosCents),
                total_debitos: fromCents(totalDebitosCents),
                periodo_inicio,
                periodo_fim,
                saldo_final_banco: parsed.saldo_final_banco,
            },
            null,
            201,
        );
    },
);

/**
 * RN-D4: busca lançamentos compatíveis para vincular a uma linha de extrato.
 *
 * - dias_janela é configurável pelo cliente (default 7, front usa 14); quando
 *   há busca por texto (descrição/parceiro) ou por valor, a janela de datas é
 *   ignorada - o usuário está procurando um lançamento específico, não
 *   navegando por proximidade temporal (ex.: lançamento pago com 20 dias de
 *   atraso).
 * - Resultados são ordenados por proximidade de valor (idêntico primeiro) e,
 *   em caso de empate, por proximidade de data em relação à linha do extrato.
 */
router.get("/conciliacoes/buscar-lancamentos", withPermission(PERM.CONCILIACAO_ACESSAR), async (req, res) => {
    try {
        const linhaId = Number(req.query.linha_id);
        if (!linhaId) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Parâmetro obrigatório: linha_id.");
        }

        const diasJanela = Number(req.query.dias_janela ?? 7);
        const busca = typeof req.query.busca === "string" ? req.query.busca.trim() : "";
        const valorBusca =
            typeof req.query.valor === "string" && req.query.valor !== "" ? toCents(req.query.valor) : null;
        // RN-D4: vencimento como critério próprio de busca (ex.: lançamento
        // pago com atraso, fora de qualquer janela razoável) - não apenas
        // como limite do range da janela.
        const vencimentoBusca =
            typeof req.query.vencimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.vencimento)
                ? req.query.vencimento
                : null;

        const [linha] = await db
            .select({
                id: extratoLinhasTable.id,
                tipo_movimento: extratoLinhasTable.tipo_movimento,
                data_movimento: extratoLinhasTable.data_movimento,
                valor: extratoLinhasTable.valor,
            })
            .from(extratoLinhasTable)
            .where(eq(extratoLinhasTable.id, linhaId))
            .limit(1);

        if (!linha) {
            return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada.");
        }

        const tipoCompatvel = linha.tipo_movimento === "debito" ? "CP" : "CR";
        const valorLinhaCents = toCents(linha.valor);

        const usaFiltroLivre = Boolean(busca) || valorBusca !== null || vencimentoBusca !== null;

        const condicoes = [
            eq(lancamentosTable.tipo, tipoCompatvel),
            // Card 71 + regressão Modo B: "pago_parcial" PRECISA continuar
            // aparecendo aqui, senão fica impossível conciliar o saldo restante
            // de um título que já recebeu parte do valor em outra linha do
            // extrato. Só status realmente encerrados ("pago"/"recebido") e
            // "cancelado" ficam de fora.
            notInArray(lancamentosTable.status, ["pago", "recebido", "cancelado"]),
        ];

        const [itemCtxPrevio] = await db
            .select({conciliacao_id: itensConciliacaoTable.conciliacao_id})
            .from(itensConciliacaoTable)
            .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
            .limit(1);
        const idsEmUsoNoExtrato = new Set<number>();
        if (itemCtxPrevio) {
            const vinculosExtratoPrevio = await db
                .select({lancamento_id: itensConciliacaoLancamentosTable.lancamento_id})
                .from(itensConciliacaoLancamentosTable)
                .innerJoin(
                    itensConciliacaoTable,
                    eq(itensConciliacaoLancamentosTable.item_conciliacao_id, itensConciliacaoTable.id),
                )
                .where(eq(itensConciliacaoTable.conciliacao_id, itemCtxPrevio.conciliacao_id));
            for (const v of vinculosExtratoPrevio) idsEmUsoNoExtrato.add(v.lancamento_id);
        }

        if (!usaFiltroLivre) {
            const dataRefIso =
                toDateIso(linha.data_movimento) ?? hojeIsoLocal();
            const dataInicio = addDaysToISO(dataRefIso, -diasJanela);
            const dataFim = addDaysToISO(dataRefIso, diasJanela);
            condicoes.push(gte(lancamentosTable.vencimento, dataInicio));
            condicoes.push(lte(lancamentosTable.vencimento, dataFim));
        }

        if (vencimentoBusca) {
            condicoes.push(eq(lancamentosTable.vencimento, vencimentoBusca));
        }

        if (busca) {
            condicoes.push(
                or(ilike(lancamentosTable.descricao, `%${busca}%`), ilike(parceirosTable.nome, `%${busca}%`)),
            );
        }

        if (valorBusca !== null) {
            // Tolerância de 1 centavo para absorver arredondamento na digitação.
            condicoes.push(
                and(
                    gte(lancamentosTable.valor, centsToDecimalString(valorBusca - 1)),
                    lte(lancamentosTable.valor, centsToDecimalString(valorBusca + 1)),
                ),
            );
        }

        // Incremental Modo A: não sugerir títulos já vinculados a esta linha.
        const [itemLinha] = await db
            .select({id: itensConciliacaoTable.id})
            .from(itensConciliacaoTable)
            .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
            .limit(1);
        if (itemLinha) {
            const jaNaLinha = await db
                .select({lancamento_id: itensConciliacaoLancamentosTable.lancamento_id})
                .from(itensConciliacaoLancamentosTable)
                .where(eq(itensConciliacaoLancamentosTable.item_conciliacao_id, itemLinha.id));
            if (jaNaLinha.length > 0) {
                condicoes.push(
                    notInArray(
                        lancamentosTable.id,
                        jaNaLinha.map((r) => r.lancamento_id),
                    ),
                );
            }
        }

        const candidatos = await db
            .select({
                id: lancamentosTable.id,
                tipo: lancamentosTable.tipo,
                vencimento: lancamentosTable.vencimento,
                descricao: lancamentosTable.descricao,
                valor: lancamentosTable.valor,
                valor_quitado: lancamentosTable.valor_quitado,
                status: lancamentosTable.status,
                parceiro_id: lancamentosTable.parceiro_id,
                parceiro_nome: parceirosTable.nome,
                plano_conta_id: lancamentosTable.plano_conta_id,
            })
            .from(lancamentosTable)
            .leftJoin(parceirosTable, eq(parceirosTable.id, lancamentosTable.parceiro_id))
            .where(and(...condicoes))
            .limit(100);

        // Ordena: Modo B (já no extrato) → proximidade de valor → proximidade de data.
        // (idsEmUsoNoExtrato já foi calculado acima, junto do filtro de status.)
        const dataRefTime = linha.data_movimento ? new Date(linha.data_movimento).getTime() : Date.now();
        const ordenados = [...candidatos].sort((a, b) => {
            const aModoB = idsEmUsoNoExtrato.has(a.id) ? 0 : 1;
            const bModoB = idsEmUsoNoExtrato.has(b.id) ? 0 : 1;
            if (aModoB !== bModoB) return aModoB - bModoB;

            const diffValorA = Math.abs(toCents(a.valor) - valorLinhaCents);
            const diffValorB = Math.abs(toCents(b.valor) - valorLinhaCents);
            if (diffValorA !== diffValorB) return diffValorA - diffValorB;

            const diffDataA = Math.abs(new Date(a.vencimento).getTime() - dataRefTime);
            const diffDataB = Math.abs(new Date(b.vencimento).getTime() - dataRefTime);
            return diffDataA - diffDataB;
        });

        return successResponse(
            res,
            ordenados.map((l) => {
                // Regra de Ouro: valor_quitado do título já é a fonte de
                // verdade em tempo real (persistirVinculo martela na hora do
                // Salvar) - não há mais "rascunho" via ledger pra somar aqui.
                const quitadoAcumuladoCents = toCents(l.valor_quitado);
                const valorCents = toCents(l.valor);
                return {
                    ...l,
                    valor: toDecimal(l.valor),
                    valor_quitado: l.valor_quitado != null ? toDecimal(l.valor_quitado) : null,
                    quitado_acumulado: fromCents(quitadoAcumuladoCents),
                    saldo_aberto_titulo: fromCents(Math.max(0, valorCents - quitadoAcumuladoCents)),
                    em_modo_b_neste_extrato: idsEmUsoNoExtrato.has(l.id),
                };
            }),
            {linha_id: linha.id, tipo_movimento: linha.tipo_movimento, dias_janela: diasJanela},
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar lançamentos para vínculo.", String(e));
    }
});

router.get("/conciliacoes/:extrato_id", withPermission(PERM.CONCILIACAO_ACESSAR), async (req, res) => {
    try {
        const extratoId = Number(req.params.extrato_id);
        const [extrato] = await db
            .select({
                id: extratosTable.id,
                conta_id: extratosTable.conta_id,
                conta_nome: contasBancariasTable.nome,
                status: extratosTable.status,
                arquivo_nome: extratosTable.arquivo_nome,
                periodo_inicio: extratosTable.periodo_inicio,
                periodo_fim: extratosTable.periodo_fim,
                total_linhas: extratosTable.total_linhas,
                total_creditos: extratosTable.total_creditos,
                total_debitos: extratosTable.total_debitos,
                saldo_final_banco: extratosTable.saldo_final_banco,
                saldo_banco_data: extratosTable.saldo_banco_data,
                created_at: extratosTable.created_at,
            })
            .from(extratosTable)
            .leftJoin(contasBancariasTable, eq(extratosTable.conta_id, contasBancariasTable.id))
            .where(eq(extratosTable.id, extratoId))
            .limit(1);

        if (!extrato) {
            return errorResponse(res, 404, "NOT_FOUND", "Extrato não encontrado.");
        }

        const [conciliacao] = await db
            .select()
            .from(conciliacoesTable)
            .where(eq(conciliacoesTable.extrato_id, extratoId))
            .limit(1);

        if (!conciliacao) {
            return errorResponse(res, 404, "NOT_FOUND", "Conciliação do extrato não encontrada.");
        }

        const linhas = await db
            .select({
                linha_id: extratoLinhasTable.id,
                tipo_movimento: extratoLinhasTable.tipo_movimento,
                descricao: extratoLinhasTable.descricao,
                valor: extratoLinhasTable.valor,
                data_movimento: extratoLinhasTable.data_movimento,
                documento: extratoLinhasTable.documento,
                saldo_pos_linha: extratoLinhasTable.saldo_pos_linha,
                item_id: itensConciliacaoTable.id,
                item_status: itensConciliacaoTable.status,
                valor_vinculado_total: itensConciliacaoTable.valor_vinculado_total,
                valor_saldo: itensConciliacaoTable.valor_saldo,
                regra_id: itensConciliacaoTable.regra_id,
                classificacao_automatica: itensConciliacaoTable.classificacao_automatica,
                regra_texto_gatilho: regrasConciliacaoTable.texto_gatilho,
                regra_criar_lancamento: regrasConciliacaoTable.criar_lancamento_automatico,
            })
            .from(extratoLinhasTable)
            .innerJoin(itensConciliacaoTable, eq(itensConciliacaoTable.extrato_linha_id, extratoLinhasTable.id))
            .leftJoin(regrasConciliacaoTable, eq(regrasConciliacaoTable.id, itensConciliacaoTable.regra_id))
            .where(eq(extratoLinhasTable.extrato_id, extratoId))
            .orderBy(asc(extratoLinhasTable.id));

        const itemIds = linhas.map((l) => l.item_id);
        const vinculos = itemIds.length > 0
            ? await db
                .select({
                    // PK do vínculo em si - necessário para PATCH /conciliacoes/vinculos/:id
                    // (edição inline de desconto/juros/data no card do lançamento, RN-G7).
                    id: itensConciliacaoLancamentosTable.id,
                    item_conciliacao_id: itensConciliacaoLancamentosTable.item_conciliacao_id,
                    lancamento_id: itensConciliacaoLancamentosTable.lancamento_id,
                    valor_vinculado: itensConciliacaoLancamentosTable.valor_vinculado,
                    desconto: itensConciliacaoLancamentosTable.desconto,
                    juros_multa: itensConciliacaoLancamentosTable.juros_multa,
                    lancamento_descricao: lancamentosTable.descricao,
                    lancamento_tipo: lancamentosTable.tipo,
                    lancamento_status: lancamentosTable.status,
                    // Vencimento do lançamento vinculado - usado pelo card para exibir/editar
                    // a data do residual parcial (RN-G3).
                    lancamento_vencimento: lancamentosTable.vencimento,
                    is_residuo_parcial: lancamentosTable.is_residuo_parcial,
                    // Card 76: residual ainda não materializado (só existe em
                    // lancamentosTable depois do finalizar) - front usa isso para
                    // avisar "vai gerar residual ao salvar/conciliar".
                    eh_origem_residuo: itensConciliacaoLancamentosTable.eh_origem_residuo,
                    residuo_valor_pendente: itensConciliacaoLancamentosTable.residuo_valor_pendente,
                })
                .from(itensConciliacaoLancamentosTable)
                .innerJoin(lancamentosTable, eq(lancamentosTable.id, itensConciliacaoLancamentosTable.lancamento_id))
                .where(inArray(itensConciliacaoLancamentosTable.item_conciliacao_id, itemIds))
            : [];

        const linhasDetalhadas = linhas.map((linha) => ({
            linha_id: linha.linha_id,
            tipo_movimento: linha.tipo_movimento,
            descricao: linha.descricao,
            valor: toDecimal(linha.valor),
            data_movimento: linha.data_movimento,
            documento: linha.documento,
            status: linha.item_status,
            valor_vinculado_total: toDecimal(linha.valor_vinculado_total),
            valor_saldo: toDecimal(linha.valor_saldo),
            saldo_pos_linha: linha.saldo_pos_linha != null ? toDecimal(linha.saldo_pos_linha) : null,
            regra_id: linha.regra_id,
            classificacao_automatica: Boolean(linha.classificacao_automatica),
            regra_texto_gatilho: linha.regra_texto_gatilho,
            /** true = regra criaria/criou lançamento; false = só classificação sugerida. */
            regra_criar_lancamento: linha.regra_criar_lancamento,
            vinculacoes: vinculos
                .filter((v) => v.item_conciliacao_id === linha.item_id)
                .map((v) => ({
                    vinculo_id: v.id,
                    lancamento_id: v.lancamento_id,
                    descricao: v.lancamento_descricao,
                    tipo: v.lancamento_tipo,
                    status: v.lancamento_status,
                    is_residuo_parcial: Boolean(v.is_residuo_parcial),
                    valor_vinculado: toDecimal(v.valor_vinculado),
                    desconto: toDecimal(v.desconto),
                    juros_multa: toDecimal(v.juros_multa),
                    /** @deprecated alias - usar juros_multa */
                    acrescimo: toDecimal(v.juros_multa),
                    vencimento: v.lancamento_vencimento,
                    // Card 76: enquanto não finalizar, o residual é só uma promessa -
                    // ainda não existe como lançamento em lancamentosTable.
                    residuo_pendente: v.eh_origem_residuo
                        ? {valor: toDecimal(v.residuo_valor_pendente ?? "0")}
                        : null,
                })),
        }));

        const diagnostico = await buildDiagnosticoSaldo({
            id: extrato.id,
            conta_id: extrato.conta_id,
            periodo_inicio: extrato.periodo_inicio,
            periodo_fim: extrato.periodo_fim,
            saldo_final_banco: extrato.saldo_final_banco,
        });

        return successResponse(res, {
            extrato: {
                ...extrato,
                total_creditos: toDecimal(extrato.total_creditos),
                total_debitos: toDecimal(extrato.total_debitos),
                saldo_final_banco: extrato.saldo_final_banco != null ? toDecimal(extrato.saldo_final_banco) : null,
            },
            conciliacao: {
                id: conciliacao.id,
                status: conciliacao.status,
                resumo_conciliados: conciliacao.resumo_conciliados,
                resumo_ignorados: conciliacao.resumo_ignorados,
                resumo_pendentes: conciliacao.resumo_pendentes,
                resumo_total: conciliacao.resumo_total,
                resumo_classificadas_automaticamente: conciliacao.resumo_classificadas_automaticamente,
            },
            linhas: linhasDetalhadas,
            diagnostico,
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao detalhar extrato.", String(e));
    }
});

/** Lê e valida o item/conciliação de uma linha para poder ignorá-la. */
async function validarIgnorar(executor: typeof db, linhaId: number) {
    const [item] = await executor
        .select({
            id: itensConciliacaoTable.id,
            conciliacao_id: itensConciliacaoTable.conciliacao_id,
            extrato_linha_id: itensConciliacaoTable.extrato_linha_id,
            status: itensConciliacaoTable.status,
        })
        .from(itensConciliacaoTable)
        .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
        .limit(1);

    if (!item) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Linha de extrato não encontrada para conciliação."};
    }
    if (item.status === "ignorado") {
        return {ok: false as const, status: 400, code: "VALIDATION_ERROR", message: "A linha já está ignorada."};
    }
    if (item.status === "vinculado") {
        return {ok: false as const, status: 400, code: "VALIDATION_ERROR", message: "Desfaça o vínculo antes de ignorar."};
    }

    const [conciliacao] = await executor
        .select({extrato_id: conciliacoesTable.extrato_id})
        .from(conciliacoesTable)
        .where(eq(conciliacoesTable.id, item.conciliacao_id))
        .limit(1);

    if (!conciliacao) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Conciliação não encontrada."};
    }

    return {ok: true as const, item, conciliacao};
}

/** Persiste o ignorar (mesma lógica usada pela rota individual e pelo Salvar em lote). */
async function persistirIgnorar(
    tx: any,
    ctx: { item: { id: number; conciliacao_id: number }; conciliacao: { extrato_id: number } },
    params: { linhaId: number; motivoCodigo: string | null; motivo: string | null; usuarioId?: number },
) {
    const {item, conciliacao} = ctx;
    const {linhaId, motivoCodigo, motivo, usuarioId} = params;
    const motivoTexto = motivo || (motivoCodigo ? motivoCodigo.replace(/_/g, " ") : null);

    await tx
        .update(itensConciliacaoTable)
        .set({
            status: "ignorado",
            motivo_ignorar: motivoTexto,
            motivo_ignorar_codigo: motivoCodigo,
            data_conciliacao: hojeIsoLocal(),
            updated_at: new Date(),
        })
        .where(eq(itensConciliacaoTable.id, item.id));

    await tx.insert(historicoConciliacaoTable).values({
        conciliacao_id: item.conciliacao_id,
        item_conciliacao_id: item.id,
        usuario_id: usuarioId,
        acao: "ignorar",
        detalhes: JSON.stringify({linha_id: linhaId, motivo_codigo: motivoCodigo, motivo: motivoTexto}),
    });

    await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);

    return {linha_id: linhaId, status: "ignorado" as const, motivo_ignorar: motivoTexto};
}

router.post(
    "/conciliacoes/linhas/:linha_id/ignorar",
    withPermission(PERM.CONCILIACAO_IGNORAR),
    validateBody(ignorarBodySchema),
    async (req, res) => {
        try {
            const linhaId = Number(req.params.linha_id);
            const body = req.body as z.infer<typeof ignorarBodySchema>;
            const motivoObrigatorio = await getMotivoIgnorarObrigatorio();

            if (motivoObrigatorio) {
                const temCodigo = Boolean(body.motivo_codigo);
                const temTexto = Boolean(body.motivo && body.motivo.length > 0);
                if (!temCodigo && !temTexto) {
                    return errorResponse(
                        res,
                        400,
                        "VALIDATION_ERROR",
                        "Motivo é obrigatório para ignorar (parâmetro motivo_ignorar_obrigatorio).",
                    );
                }
            }

            const validado = await validarIgnorar(db, linhaId);
            if (!validado.ok) {
                return errorResponse(res, validado.status, validado.code, validado.message);
            }

            const resultado = await db.transaction((tx) =>
                persistirIgnorar(tx, validado, {
                    linhaId,
                    motivoCodigo: body.motivo_codigo ?? null,
                    motivo: body.motivo ?? null,
                    usuarioId: req.user?.id,
                }),
            );

            return successResponse(res, resultado);
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao ignorar linha do extrato.", String(e));
        }
    },
);
/**
 * Lê e decide (regra de negócio pura, via decidirVincular) o resultado de um
 * vincular, SEM gravar nada. Reaproveitado tanto pelo preview (Regra de
 * Ouro - modal só mostra o resultado, não persiste) quanto pelo Salvar de
 * verdade (que decide de novo, agora dentro da transaction, e persiste).
 */
async function calcularVinculo(
    executor: typeof db,
    params: {
        linhaId: number;
        lancamentosPayload: VincularBody["lancamentos"];
        gerarParcial: boolean;
        residuoLancamentoId: number | null;
        contextoRascunho?: VincularBody["contexto_rascunho"];
    },
) {
    const {linhaId, lancamentosPayload, gerarParcial, residuoLancamentoId, contextoRascunho} = params;

    const [item] = await executor
        .select()
        .from(itensConciliacaoTable)
        .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
        .limit(1);

    if (!item) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Linha de extrato não encontrada para conciliação."};
    }
    if (item.status === "ignorado") {
        return {ok: false as const, status: 400, code: "VALIDATION_ERROR", message: "Reverta o ignorar antes de vincular."};
    }

    const vinculosExistentesReais = await executor
        .select({
            id: itensConciliacaoLancamentosTable.id,
            lancamento_id: itensConciliacaoLancamentosTable.lancamento_id,
            valor_vinculado: itensConciliacaoLancamentosTable.valor_vinculado,
        })
        .from(itensConciliacaoLancamentosTable)
        .where(eq(itensConciliacaoLancamentosTable.item_conciliacao_id, item.id));

    // Preview: se um "Desfazer" desta mesma linha já está rascunhado antes
    // deste vincular (ver ignorar_vinculos_reais), o vínculo real ainda no
    // banco será descartado no Salvar - trata como se já não existisse.
    const ignorarVinculosReais = contextoRascunho?.ignorar_vinculos_reais ?? false;
    const vinculosExistentes = ignorarVinculosReais ? [] : vinculosExistentesReais;

    const jaVinculadoIds = new Set(vinculosExistentes.map((v) => v.lancamento_id));
    const idsNovos = lancamentosPayload.map((l) => l.lancamento_id);
    const duplicados = idsNovos.filter((id) => jaVinculadoIds.has(id));
    if (duplicados.length > 0) {
        return {
            ok: false as const,
            status: 409,
            code: "CONFLICT",
            message: `Lançamento(s) já vinculado(s) a esta linha: ${duplicados.join(", ")}.`,
        };
    }

    const extratoTotalCents = toCents(item.valor_extrato);
    const jaVinculadoRealCents = sumCents(vinculosExistentes.map((v) => toCents(v.valor_vinculado)));
    // Preview: soma de rodadas de vincular ainda não salvas nesta sessão
    // (mesma linha) - sem persistência real de fato ainda não existe.
    const jaVinculadoLocalCents = contextoRascunho?.ja_vinculado_local_cents ?? 0;
    const jaVinculadoCents = jaVinculadoRealCents + jaVinculadoLocalCents;
    const saldoAbertoCents = Math.max(0, extratoTotalCents - jaVinculadoCents);
    const houveVinculoAnterior = vinculosExistentes.length > 0 || jaVinculadoLocalCents > 0;

    if (houveVinculoAnterior && saldoAbertoCents <= 0) {
        return {
            ok: false as const,
            status: 409,
            code: "CONFLICT",
            message: "Esta linha já está totalmente vinculada (valores batem).",
        };
    }

    // Base da decisão = saldo restante (incremental) ou valor cheio (1º vínculo).
    const extratoParaDecisaoCents = houveVinculoAnterior ? saldoAbertoCents : extratoTotalCents;

    const [conciliacao] = await executor
        .select()
        .from(conciliacoesTable)
        .where(eq(conciliacoesTable.id, item.conciliacao_id))
        .limit(1);
    if (!conciliacao) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Conciliação não encontrada."};
    }

    const lancamentos = await executor
        .select()
        .from(lancamentosTable)
        .where(inArray(lancamentosTable.id, idsNovos));

    if (lancamentos.length !== idsNovos.length) {
        return {ok: false as const, status: 400, code: "VALIDATION_ERROR", message: "Um ou mais lançamentos informados são inválidos."};
    }

    const payloadMap = new Map(lancamentosPayload.map((l) => [l.lancamento_id, l]));
    const quitadoLocalExtra = contextoRascunho?.quitado_local_por_lancamento ?? {};

    // Regra de Ouro: persistirVinculo agora martela o título assim que o
    // vínculo é salvo (não mais só no finalizar), então lancamento.valor_quitado
    // já é a fonte de verdade em tempo real - não soma mais um "rascunho" via
    // ledger de itens_conciliacao_lancamentos (isso duplicaria o valor).
    // O que falta somar é só o rascunho LOCAL (ainda em memória no front,
    // vindo de contexto_rascunho, nunca persistido).
    const decision = decidirVincular({
        extratoCents: extratoParaDecisaoCents,
        lancamentos: lancamentos.map((lancamento) => {
            const p = payloadMap.get(lancamento.id);
            const jurosMulta = p?.juros_multa ?? p?.acrescimo ?? 0;
            const quitadoAnteriorCents =
                toCents(lancamento.valor_quitado) +
                (quitadoLocalExtra[String(lancamento.id)] ?? 0);
            return {
                lancamento_id: lancamento.id,
                valorCents: toCents(lancamento.valor),
                descontoCents: toCents(p?.desconto ?? 0),
                jurosMultaCents: toCents(jurosMulta),
                quitadoAnteriorCents,
            };
        }),
        gerarParcial,
        residuoLancamentoId: residuoLancamentoId ?? null,
    });

    if (decision.ok === false) {
        return {ok: false as const, status: decision.status, code: decision.code, message: decision.message};
    }

    const lancamentoById = new Map(lancamentos.map((l) => [l.id, l]));
    const novoVinculoCents = sumCents(decision.itens.map((i) => i.valorVinculadoCents));
    const totalConciliadoCents = jaVinculadoRealCents + novoVinculoCents;
    // Saldo restante absoluto na linha após este acúmulo (só considera o que
    // já está REAL no banco - rascunho local ainda não é "saldo comprometido"
    // até o Salvar aplicar de verdade).
    const valorSaldoFinalCents = Math.max(0, extratoTotalCents - totalConciliadoCents);

    return {
        ok: true as const,
        item,
        conciliacao,
        lancamentoById,
        decision,
        extratoTotalCents,
        jaVinculadoRealCents,
        totalConciliadoCents,
        valorSaldoFinalCents,
    };
}

type VincularCalcOk = Extract<Awaited<ReturnType<typeof calcularVinculo>>, { ok: true }>;

/**
 * Grava de fato o resultado de `calcularVinculo` - inclui a criação
 * IMEDIATA do lançamento residual (Regra de Ouro: a persistência inteira do
 * vincular já foi adiada para o momento do Salvar/Conciliar, então não há
 * mais motivo para adiar o residual num segundo momento como antes).
 */
async function persistirVinculo(
    tx: any,
    calc: VincularCalcOk,
    params: {
        linhaId: number;
        lancamentosPayload: VincularBody["lancamentos"];
        gerarParcial: boolean;
        residuoLancamentoId: number | null;
        usuarioId?: number;
    },
) {
    const {item, conciliacao, lancamentoById, decision, extratoTotalCents, totalConciliadoCents, valorSaldoFinalCents} = calc;
    const {linhaId, lancamentosPayload, gerarParcial, residuoLancamentoId, usuarioId} = params;

    let residuoCriado: { lancamento_id: number; valor: number } | null = null;
    if (decision.residual) {
        const origem = lancamentoById.get(decision.residual.origemLancamentoId);
        if (!origem) {
            throw new Error("Não foi possível identificar lançamento de origem para o residual.");
        }
        const [novoResiduo] = await tx
            .insert(lancamentosTable)
            .values({
                tipo: origem.tipo,
                vencimento: origem.vencimento,
                competencia: origem.competencia,
                conta_id: origem.conta_id ?? conciliacao.conta_id,
                parceiro_id: origem.parceiro_id,
                descricao: `${origem.descricao ?? "Lançamento"} (pagamento parcial)`,
                valor: centsToDecimalString(decision.residual.valorCents),
                status: "pendente",
                origem: "residuo_parcial",
                plano_conta_id: origem.plano_conta_id,
                departamento_id: origem.departamento_id,
                centro_custo_id: origem.centro_custo_id,
                parcela_atual: origem.parcela_atual,
                total_parcelas: origem.total_parcelas,
                riscos: origem.riscos ?? [],
                is_residuo_parcial: true,
                lancamento_origem_id: origem.id,
                criado_por: usuarioId,
            })
            .returning();
        residuoCriado = {lancamento_id: novoResiduo.id, valor: fromCents(decision.residual.valorCents)};
    }

    await tx.insert(itensConciliacaoLancamentosTable).values(
        decision.itens.map((v) => ({
            item_conciliacao_id: item.id,
            lancamento_id: v.lancamento_id,
            valor_vinculado: centsToDecimalString(v.valorVinculadoCents),
            desconto: centsToDecimalString(v.descontoCents),
            juros_multa: centsToDecimalString(v.jurosMultaCents),
        })),
    );

    // Crítico: o título original (lancamentosTable) precisa refletir a
    // quitação já no momento em que o vínculo é de fato salvo (Salvar/Conciliar
    // em lote), sem esperar o finalizar da conciliação inteira - senão o
    // lançamento fica com status/valor_quitado antigos mesmo após persistir.
    for (const vinculoItem of decision.itens) {
        const origem = lancamentoById.get(vinculoItem.lancamento_id);
        if (!origem) continue;

        const novoQuitadoCents = toCents(origem.valor_quitado) + vinculoItem.valorVinculadoCents;
        const novoJurosCents = toCents(origem.juros) + vinculoItem.jurosMultaCents;
        const novoDescontoCents = toCents(origem.desconto) + vinculoItem.descontoCents;
        const tipoExtratoLancamento = origem.tipo === "CR" ? "credito" : "debito";
        const novoStatus = statusAposQuitacao({
            tipoExtrato: tipoExtratoLancamento,
            valorLancamentoCents: toCents(origem.valor),
            valorQuitadoAcumuladoCents: novoQuitadoCents,
            descontoAcumuladoCents: novoDescontoCents,
        });

        await tx
            .update(lancamentosTable)
            .set({
                status: novoStatus,
                data_quitacao: toDateIso(origem.data_quitacao) ?? toDateIso(item.data) ?? hojeIsoLocal(),
                conta_id: conciliacao.conta_id,
                valor_quitado: centsToDecimalString(novoQuitadoCents),
                juros: centsToDecimalString(novoJurosCents),
                desconto: centsToDecimalString(novoDescontoCents),
                updated_at: new Date(),
            })
            .where(eq(lancamentosTable.id, vinculoItem.lancamento_id));
    }

    await tx
        .update(itensConciliacaoTable)
        .set({
            status: "vinculado",
            valor_vinculado_total: centsToDecimalString(totalConciliadoCents),
            valor_saldo: centsToDecimalString(valorSaldoFinalCents),
            data_conciliacao: hojeIsoLocal(),
            updated_at: new Date(),
        })
        .where(eq(itensConciliacaoTable.id, item.id));

    await tx.insert(historicoConciliacaoTable).values({
        conciliacao_id: item.conciliacao_id,
        item_conciliacao_id: item.id,
        usuario_id: usuarioId,
        acao: decision.residual ? "criar_residuo_parcial" : "vincular",
        detalhes: JSON.stringify({
            linha_id: linhaId,
            lancamentos: lancamentosPayload,
            gerar_parcial: gerarParcial,
            residuo_lancamento_id: residuoLancamentoId ?? null,
            valor_extrato: fromCents(extratoTotalCents),
            total_conciliado: fromCents(totalConciliadoCents),
            delta: fromCents(decision.deltaCents),
            ramo: decision.ramo,
            valor_saldo: fromCents(valorSaldoFinalCents),
            residuo_criado_lancamento_id: residuoCriado?.lancamento_id ?? null,
        }),
    });

    await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);

    return {
        linha_id: linhaId,
        status: "vinculado" as const,
        ramo: decision.ramo,
        delta: fromCents(decision.deltaCents),
        total_conciliado: fromCents(totalConciliadoCents),
        valor_saldo: fromCents(valorSaldoFinalCents),
        residuo: residuoCriado,
    };
}

router.post(
    "/conciliacoes/linhas/:linha_id/vincular",
    withPermission(PERM.CONCILIACAO_VINCULAR),
    validateBody(vincularBodySchema),
    async (req, res) => {
        try {
            const linhaId = Number(req.params.linha_id);
            const {
                lancamentos: lancamentosPayload,
                gerar_parcial: gerarParcial,
                residuo_lancamento_id: residuoLancamentoId,
                preview,
                contexto_rascunho: contextoRascunho,
            } = req.body as VincularBody;

            const calc = await calcularVinculo(db, {
                linhaId,
                lancamentosPayload,
                gerarParcial,
                residuoLancamentoId: residuoLancamentoId ?? null,
                contextoRascunho,
            });

            if (!calc.ok) {
                return errorResponse(res, calc.status, calc.code, calc.message);
            }

            if (preview) {
                // Regra de Ouro (Fase 8): o modal só devolve o cálculo pro front
                // guardar em memória - nada é gravado até o Salvar/Conciliar.
                return successResponse(res, {
                    linha_id: linhaId,
                    status: "vinculado",
                    preview: true,
                    ramo: calc.decision.ramo,
                    delta: fromCents(calc.decision.deltaCents),
                    total_conciliado: fromCents(calc.totalConciliadoCents),
                    valor_saldo: fromCents(calc.valorSaldoFinalCents),
                    itens: calc.decision.itens.map((i) => ({
                        lancamento_id: i.lancamento_id,
                        valor_vinculado: fromCents(i.valorVinculadoCents),
                        desconto: fromCents(i.descontoCents),
                        juros_multa: fromCents(i.jurosMultaCents),
                    })),
                    residual: calc.decision.residual
                        ? {
                            lancamento_origem_id: calc.decision.residual.origemLancamentoId,
                            valor: fromCents(calc.decision.residual.valorCents),
                        }
                        : null,
                });
            }

            const resultado = await db.transaction((tx) =>
                persistirVinculo(tx, calc, {
                    linhaId,
                    lancamentosPayload,
                    gerarParcial,
                    residuoLancamentoId: residuoLancamentoId ?? null,
                    usuarioId: req.user?.id,
                }),
            );

            return successResponse(res, resultado);
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao vincular lançamentos da linha.", String(e));
        }
    },
);

/**
 * RN-D3: botão [+] na linha do extrato - cria o lançamento correspondente
 * e o vínculo N:N. Quitação financeira (valor_quitado/status) só no finalizar.
 */
router.post(
    "/conciliacoes/linhas/:linha_id/criar-lancamento",
    withPermission(PERM.CONCILIACAO_VINCULAR),
    validateBody(criarLancamentoBodySchema),
    async (req, res) => {
        try {
            const linhaId = Number(req.params.linha_id);
            const body = req.body as CriarLancamentoBody;

            const [item] = await db
                .select()
                .from(itensConciliacaoTable)
                .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
                .limit(1);
            if (!item) {
                return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada para conciliação.");
            }
            if (item.status !== "pendente") {
                return errorResponse(res, 400, "VALIDATION_ERROR", "Esta linha já foi tratada (vinculada ou ignorada).");
            }

            const [linhaExtrato] = await db
                .select()
                .from(extratoLinhasTable)
                .where(eq(extratoLinhasTable.id, linhaId))
                .limit(1);
            if (!linhaExtrato) {
                return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada.");
            }

            const [conciliacao] = await db
                .select()
                .from(conciliacoesTable)
                .where(eq(conciliacoesTable.id, item.conciliacao_id))
                .limit(1);
            if (!conciliacao) {
                return errorResponse(res, 404, "NOT_FOUND", "Conciliação não encontrada.");
            }

            const valorCents = toCents(body.valor);
            const valorExtratoCents = toCents(item.valor_extrato);
            if (valorCents !== valorExtratoCents) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "O valor do lançamento deve ser igual ao valor da linha do extrato.",
                );
            }

            const statusAberto = statusAbertoPorVencimento(body.vencimento, hojeIsoLocal());

            const resultado = await db.transaction(async (tx) => {
                const [novoLancamento] = await tx
                    .insert(lancamentosTable)
                    .values({
                        tipo: body.tipo,
                        vencimento: body.vencimento,
                        conta_id: linhaExtrato.conta_id,
                        parceiro_id: body.parceiro_id ?? null,
                        descricao: body.descricao ?? linhaExtrato.descricao ?? null,
                        valor: centsToDecimalString(valorCents),
                        status: statusAberto,
                        origem: "conciliacao",
                        plano_conta_id: body.plano_conta_id ?? null,
                        departamento_id: body.departamento_id ?? null,
                        centro_custo_id: body.centro_custo_id ?? null,
                        forma_pagamento: body.forma_pagamento ?? null,
                        criado_por: req.user?.id,
                    })
                    .returning();

                await tx.insert(itensConciliacaoLancamentosTable).values({
                    item_conciliacao_id: item.id,
                    lancamento_id: novoLancamento.id,
                    valor_vinculado: centsToDecimalString(valorCents),
                    desconto: "0.00",
                    juros_multa: "0.00",
                });

                await tx
                    .update(itensConciliacaoTable)
                    .set({
                        status: "vinculado",
                        valor_vinculado_total: centsToDecimalString(valorCents),
                        valor_saldo: "0.00",
                        data_conciliacao: hojeIsoLocal(),
                        updated_at: new Date(),
                    })
                    .where(eq(itensConciliacaoTable.id, item.id));

                await tx.insert(historicoConciliacaoTable).values({
                    conciliacao_id: item.conciliacao_id,
                    item_conciliacao_id: item.id,
                    usuario_id: req.user?.id,
                    acao: "vincular",
                    detalhes: JSON.stringify({
                        linha_id: linhaId,
                        acao: "criar_lancamento",
                        lancamento_id: novoLancamento.id,
                    }),
                });

                await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);

                return novoLancamento;
            });

            return successResponse(res, {linha_id: linhaId, status: "vinculado", lancamento: resultado}, null, 201);
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar lançamento a partir da linha.", String(e));
        }
    },
);

/**
 * RN-G7: edição inline de desconto/juros-multa de vínculo já existente.
 * Persiste só na auxiliar; o título é martelado no finalizar.
 * Vencimento do residual é imutável (Decisão nº 3).
 */
router.patch(
    "/conciliacoes/vinculos/:vinculo_id",
    withPermission(PERM.CONCILIACAO_VINCULAR),
    validateBody(atualizarVinculoBodySchema),
    async (req, res) => {
        try {
            const vinculoId = Number(req.params.vinculo_id);
            const body = req.body as z.infer<typeof atualizarVinculoBodySchema>;

            const [vinculo] = await db
                .select()
                .from(itensConciliacaoLancamentosTable)
                .where(eq(itensConciliacaoLancamentosTable.id, vinculoId))
                .limit(1);

            if (!vinculo) {
                return errorResponse(res, 404, "NOT_FOUND", "Vínculo não encontrado.");
            }

            const [lancamento] = await db
                .select()
                .from(lancamentosTable)
                .where(eq(lancamentosTable.id, vinculo.lancamento_id))
                .limit(1);

            if (!lancamento) {
                return errorResponse(res, 404, "NOT_FOUND", "Lançamento vinculado não encontrado.");
            }

            const [item] = await db
                .select()
                .from(itensConciliacaoTable)
                .where(eq(itensConciliacaoTable.id, vinculo.item_conciliacao_id))
                .limit(1);

            const descontoAnteriorCents = toCents(vinculo.desconto);
            const jurosAnteriorCents = toCents(vinculo.juros_multa);
            const novoDescontoCents =
                body.desconto !== undefined ? toCents(body.desconto) : descontoAnteriorCents;
            const novoJurosCents =
                body.juros_multa !== undefined ? toCents(body.juros_multa) : jurosAnteriorCents;

            const valorTituloCents = toCents(lancamento.valor);
            if (novoDescontoCents > valorTituloCents) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "Desconto não pode exceder o valor do lançamento.",
                );
            }

            const deltaJurosCents = novoJurosCents - jurosAnteriorCents;
            const deltaDescontoCents = novoDescontoCents - descontoAnteriorCents;
            const novoValorVinculadoCents = Math.max(
                0,
                toCents(vinculo.valor_vinculado) + deltaJurosCents - deltaDescontoCents,
            );

            if (novoJurosCents > novoValorVinculadoCents && novoValorVinculadoCents > 0) {
                return errorResponse(
                    res,
                    400,
                    "VALIDATION_ERROR",
                    "Juros/Multa não pode exceder o valor vinculado do título nesta linha.",
                );
            }

            await db.transaction(async (tx) => {
                await tx
                    .update(itensConciliacaoLancamentosTable)
                    .set({
                        desconto: centsToDecimalString(novoDescontoCents),
                        juros_multa: centsToDecimalString(novoJurosCents),
                        valor_vinculado: centsToDecimalString(novoValorVinculadoCents),
                    })
                    .where(eq(itensConciliacaoLancamentosTable.id, vinculoId));

                if (item) {
                    const deltaLinhaCents = novoValorVinculadoCents - toCents(vinculo.valor_vinculado);
                    const novoTotalCents = Math.max(0, toCents(item.valor_vinculado_total) + deltaLinhaCents);
                    const extratoCents = toCents(item.valor_extrato);
                    await tx
                        .update(itensConciliacaoTable)
                        .set({
                            valor_vinculado_total: centsToDecimalString(novoTotalCents),
                            valor_saldo: centsToDecimalString(Math.max(0, extratoCents - novoTotalCents)),
                            updated_at: new Date(),
                        })
                        .where(eq(itensConciliacaoTable.id, item.id));
                }
            });

            return successResponse(res, {
                vinculo_id: vinculoId,
                desconto: fromCents(novoDescontoCents),
                juros_multa: fromCents(novoJurosCents),
                valor_vinculado: fromCents(novoValorVinculadoCents),
                status: lancamento.status,
                vencimento: lancamento.vencimento,
            });
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar vínculo.", String(e));
        }
    },
);

/**
 * DEF-04: digitação manual de saldo_pos_linha quando o arquivo (CSV/OFX) não
 * trouxer essa informação. Não sobrescreve silenciosamente um valor já
 * capturado do arquivo - passe ?force=true para corrigir um valor existente.
 */
router.patch(
    "/conciliacoes/linhas/:linha_id/saldo",
    withPermission(PERM.CONCILIACAO_VINCULAR),
    validateBody(saldoManualBodySchema),
    async (req, res) => {
        try {
            const linhaId = Number(req.params.linha_id);
            const {saldo_pos_linha} = req.body as SaldoManualBody;
            const force = req.query.force === "true";

            const [linha] = await db
                .select({id: extratoLinhasTable.id, saldo_pos_linha: extratoLinhasTable.saldo_pos_linha})
                .from(extratoLinhasTable)
                .where(eq(extratoLinhasTable.id, linhaId))
                .limit(1);

            if (!linha) {
                return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada.");
            }
            if (linha.saldo_pos_linha != null && !force) {
                return errorResponse(
                    res,
                    409,
                    "CONFLICT",
                    "Esta linha já possui saldo capturado do arquivo. Use force=true para sobrescrever.",
                );
            }

            const saldoCents = toCents(saldo_pos_linha);
            const [atualizado] = await db
                .update(extratoLinhasTable)
                .set({saldo_pos_linha: centsToDecimalString(saldoCents), updated_at: new Date()})
                .where(eq(extratoLinhasTable.id, linhaId))
                .returning({id: extratoLinhasTable.id, saldo_pos_linha: extratoLinhasTable.saldo_pos_linha});

            return successResponse(res, {
                linha_id: atualizado.id,
                saldo_pos_linha: toDecimal(atualizado.saldo_pos_linha),
            });
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao registrar saldo manual da linha.", String(e));
        }
    },
);

/** Conta quantas linhas ainda estão pendentes nesta conciliação. */
async function contarPendentes(executor: typeof db, conciliacaoId: number): Promise<number> {
    const [pendente] = await executor
        .select({total: count()})
        .from(itensConciliacaoTable)
        .where(and(eq(itensConciliacaoTable.conciliacao_id, conciliacaoId), eq(itensConciliacaoTable.status, "pendente")));
    return Number(pendente?.total ?? 0);
}

/**
 * Materializa a conciliação: marca extrato/conciliação como conciliado,
 * marteliza `valor_quitado`/status dos títulos (RN-G) e faz uma varredura
 * legada de residuais que porventura ainda estejam com a flag antiga
 * `eh_origem_residuo` (fluxo anterior à Regra de Ouro - hoje o residual já
 * nasce no `persistirVinculo`, mas manter esta varredura aqui é inofensivo
 * e evita perder qualquer residual de uma conciliação criada antes deste
 * deploy). Só chamar depois de confirmar que não há linhas pendentes.
 */
async function persistirFinalizacao(tx: any, conciliacao: { id: number; conta_id: number | null }, extratoId: number, usuarioId?: number) {
    const dataConciliacao = hojeIsoLocal();

                await tx
                    .update(extratosTable)
                    .set({status: "conciliado", updated_at: new Date()})
                    .where(eq(extratosTable.id, extratoId));

                await tx
                    .update(conciliacoesTable)
                    .set({
                        status: "conciliado",
                        data_conciliacao: dataConciliacao,
                        updated_at: new Date(),
                    })
                    .where(eq(conciliacoesTable.id, conciliacao.id));

                // Espelha data nos itens ainda sem data (FEAT-08)
                await tx
                    .update(itensConciliacaoTable)
                    .set({data_conciliacao: dataConciliacao, updated_at: new Date()})
                    .where(
                        and(
                            eq(itensConciliacaoTable.conciliacao_id, conciliacao.id),
                            isNull(itensConciliacaoTable.data_conciliacao),
                        ),
                    );

                // agrega a auxiliar N:N e grava no título
                // (valor_quitado / juros / desconto / conta_id / status / data_quitacao).
                const vinculosFinalizar = await tx
                    .select({
                        lancamento_id: itensConciliacaoLancamentosTable.lancamento_id,
                        valor_vinculado: itensConciliacaoLancamentosTable.valor_vinculado,
                        juros_multa: itensConciliacaoLancamentosTable.juros_multa,
                        desconto_vinculo: itensConciliacaoLancamentosTable.desconto,
                        data_movimento: extratoLinhasTable.data_movimento,
                        data_compensacao: extratoLinhasTable.data_compensacao,
                        tipo: lancamentosTable.tipo,
                        valor: lancamentosTable.valor,
                        valor_quitado: lancamentosTable.valor_quitado,
                        juros: lancamentosTable.juros,
                        desconto: lancamentosTable.desconto,
                        data_quitacao: lancamentosTable.data_quitacao,
                    })
                    .from(itensConciliacaoLancamentosTable)
                    .innerJoin(
                        itensConciliacaoTable,
                        eq(
                            itensConciliacaoLancamentosTable.item_conciliacao_id,
                            itensConciliacaoTable.id,
                        ),
                    )
                    .innerJoin(
                        extratoLinhasTable,
                        eq(itensConciliacaoTable.extrato_linha_id, extratoLinhasTable.id),
                    )
                    .innerJoin(
                        lancamentosTable,
                        eq(itensConciliacaoLancamentosTable.lancamento_id, lancamentosTable.id),
                    )
                    .where(
                        and(
                            eq(itensConciliacaoTable.conciliacao_id, conciliacao.id),
                            eq(itensConciliacaoTable.status, "vinculado"),
                        ),
                    );

                type AggQuitacao = {
                    tipo: string;
                    valor: unknown;
                    valor_quitado_atual: unknown;
                    juros_atual: unknown;
                    desconto_atual: unknown;
                    data_quitacao: unknown;
                    sumVinculadoCents: number;
                    sumJurosCents: number;
                    sumDescontoCents: number;
                    data_movimento_candidatas: string[];
                };
                const porLancamento = new Map<number, AggQuitacao>();

                for (const row of vinculosFinalizar) {
                    const dataLinha =
                        toDateIso(row.data_movimento) ??
                        toDateIso(row.data_compensacao) ??
                        dataConciliacao;
                    const existente = porLancamento.get(row.lancamento_id);
                    if (!existente) {
                        porLancamento.set(row.lancamento_id, {
                            tipo: row.tipo,
                            valor: row.valor,
                            valor_quitado_atual: row.valor_quitado,
                            juros_atual: row.juros,
                            desconto_atual: row.desconto,
                            data_quitacao: row.data_quitacao,
                            sumVinculadoCents: toCents(row.valor_vinculado),
                            sumJurosCents: toCents(row.juros_multa),
                            sumDescontoCents: toCents(row.desconto_vinculo),
                            data_movimento_candidatas: [dataLinha],
                        });
                    } else {
                        existente.sumVinculadoCents += toCents(row.valor_vinculado);
                        existente.sumJurosCents += toCents(row.juros_multa);
                        existente.sumDescontoCents += toCents(row.desconto_vinculo);
                        existente.data_movimento_candidatas.push(dataLinha);
                    }
                }

                const lancamentoIdsFinalizar = [...porLancamento.keys()];
                type SomaVinculos = {
                    vinculadoCents: number;
                    jurosCents: number;
                    descontoCents: number;
                };
                const somasFinalizados = new Map<number, SomaVinculos>();
                const somasRascunhos = new Map<number, SomaVinculos>();

                if (lancamentoIdsFinalizar.length > 0) {
                    const vinculosLedger = await tx
                        .select({
                            lancamento_id: itensConciliacaoLancamentosTable.lancamento_id,
                            valor_vinculado: itensConciliacaoLancamentosTable.valor_vinculado,
                            juros_multa: itensConciliacaoLancamentosTable.juros_multa,
                            desconto: itensConciliacaoLancamentosTable.desconto,
                            conciliacao_id: conciliacoesTable.id,
                            conciliacao_status: conciliacoesTable.status,
                        })
                        .from(itensConciliacaoLancamentosTable)
                        .innerJoin(
                            itensConciliacaoTable,
                            eq(
                                itensConciliacaoLancamentosTable.item_conciliacao_id,
                                itensConciliacaoTable.id,
                            ),
                        )
                        .innerJoin(
                            conciliacoesTable,
                            eq(itensConciliacaoTable.conciliacao_id, conciliacoesTable.id),
                        )
                        .where(
                            inArray(
                                itensConciliacaoLancamentosTable.lancamento_id,
                                lancamentoIdsFinalizar,
                            ),
                        );

                    const acc = (map: Map<number, SomaVinculos>, id: number, v: SomaVinculos) => {
                        const prev = map.get(id) ?? {vinculadoCents: 0, jurosCents: 0, descontoCents: 0};
                        map.set(id, {
                            vinculadoCents: prev.vinculadoCents + v.vinculadoCents,
                            jurosCents: prev.jurosCents + v.jurosCents,
                            descontoCents: prev.descontoCents + v.descontoCents,
                        });
                    };

                    for (const row of vinculosLedger) {
                        // Esta conciliação entra via sumDesta (porLancamento), não nos mapas.
                        // (Status já pode estar "conciliado" neste ponto da transaction.)
                        if (row.conciliacao_id === conciliacao.id) continue;

                        const parcela = {
                            vinculadoCents: toCents(row.valor_vinculado),
                            jurosCents: toCents(row.juros_multa),
                            descontoCents: toCents(row.desconto),
                        };
                        if (row.conciliacao_status === "conciliado") {
                            acc(somasFinalizados, row.lancamento_id, parcela);
                        } else {
                            acc(somasRascunhos, row.lancamento_id, parcela);
                        }
                    }
                }

                for (const [lancamentoId, agg] of porLancamento) {
                    if (agg.sumVinculadoCents <= 0) continue;

                    const fin = somasFinalizados.get(lancamentoId) ?? {
                        vinculadoCents: 0,
                        jurosCents: 0,
                        descontoCents: 0,
                    };
                    const rascOutros = somasRascunhos.get(lancamentoId) ?? {
                        vinculadoCents: 0,
                        jurosCents: 0,
                        descontoCents: 0,
                    };

                    // Idempotente: strip inclui esta conciliação (legado já embutiu no título).
                    const {quitadoCents, jurosCents, descontoCents} = martelarQuitacaoNoFinalizar({
                        valorQuitadoTituloCents: toCents(agg.valor_quitado_atual),
                        jurosTituloCents: toCents(agg.juros_atual),
                        descontoTituloCents: toCents(agg.desconto_atual),
                        sumVinculadoDestaCents: agg.sumVinculadoCents,
                        sumJurosDestaCents: agg.sumJurosCents,
                        sumDescontoDestaCents: agg.sumDescontoCents,
                        sumVinculadoFinalizadosCents: fin.vinculadoCents,
                        sumJurosFinalizadosCents: fin.jurosCents,
                        sumDescontoFinalizadosCents: fin.descontoCents,
                        sumVinculadoRascunhosCents: rascOutros.vinculadoCents + agg.sumVinculadoCents,
                        sumJurosRascunhosCents: rascOutros.jurosCents + agg.sumJurosCents,
                        sumDescontoRascunhosCents: rascOutros.descontoCents + agg.sumDescontoCents,
                    });

                    const tipoExtrato = agg.tipo === "CR" ? "credito" : "debito";
                    const novoStatus = statusAposQuitacao({
                        tipoExtrato,
                        valorLancamentoCents: toCents(agg.valor),
                        valorQuitadoAcumuladoCents: quitadoCents,
                        descontoAcumuladoCents: descontoCents,
                    });

                    const dataQuitacao =
                        toDateIso(agg.data_quitacao) ??
                        agg.data_movimento_candidatas.sort()[0] ??
                        dataConciliacao;

                    await tx
                        .update(lancamentosTable)
                        .set({
                            status: novoStatus,
                            data_quitacao: dataQuitacao,
                            conta_id: conciliacao.conta_id,
                            valor_quitado: centsToDecimalString(quitadoCents),
                            juros: centsToDecimalString(jurosCents),
                            desconto: centsToDecimalString(descontoCents),
                            updated_at: new Date(),
                        })
                        .where(eq(lancamentosTable.id, lancamentoId));
                }

                // Card 76: só agora (Salvar/Conciliar confirmado) os residuais
                // parciais marcados durante o vincular nascem de fato em
                // lancamentosTable - até aqui existiam só como "promessa"
                // (eh_origem_residuo/residuo_valor_pendente) no vínculo.
                const residuaisPendentes = await tx
                    .select({
                        origemLancamentoId: itensConciliacaoLancamentosTable.lancamento_id,
                        valorPendente: itensConciliacaoLancamentosTable.residuo_valor_pendente,
                    })
                    .from(itensConciliacaoLancamentosTable)
                    .innerJoin(
                        itensConciliacaoTable,
                        eq(itensConciliacaoLancamentosTable.item_conciliacao_id, itensConciliacaoTable.id),
                    )
                    .where(
                        and(
                            eq(itensConciliacaoTable.conciliacao_id, conciliacao.id),
                            eq(itensConciliacaoLancamentosTable.eh_origem_residuo, true),
                        ),
                    );

                if (residuaisPendentes.length > 0) {
                    type OrigemResiduo = {
                        id: number;
                        tipo: string;
                        vencimento: string | null;
                        competencia: string | null;
                        conta_id: number | null;
                        parceiro_id: number | null;
                        descricao: string | null;
                        plano_conta_id: number | null;
                        departamento_id: number | null;
                        centro_custo_id: number | null;
                        parcela_atual: number | null;
                        total_parcelas: number | null;
                        riscos: unknown;
                    };
                    const origemIds = residuaisPendentes.map((r) => r.origemLancamentoId);
                    const origens: OrigemResiduo[] = await tx
                        .select({
                            id: lancamentosTable.id,
                            tipo: lancamentosTable.tipo,
                            vencimento: lancamentosTable.vencimento,
                            competencia: lancamentosTable.competencia,
                            conta_id: lancamentosTable.conta_id,
                            parceiro_id: lancamentosTable.parceiro_id,
                            descricao: lancamentosTable.descricao,
                            plano_conta_id: lancamentosTable.plano_conta_id,
                            departamento_id: lancamentosTable.departamento_id,
                            centro_custo_id: lancamentosTable.centro_custo_id,
                            parcela_atual: lancamentosTable.parcela_atual,
                            total_parcelas: lancamentosTable.total_parcelas,
                            riscos: lancamentosTable.riscos,
                        })
                        .from(lancamentosTable)
                        .where(inArray(lancamentosTable.id, origemIds));
                    const origemById = new Map<number, OrigemResiduo>(origens.map((o) => [o.id, o]));

                    for (const pendente of residuaisPendentes) {
                        const origem = origemById.get(pendente.origemLancamentoId);
                        if (!origem || pendente.valorPendente == null) continue;

                        await tx.insert(lancamentosTable).values({
                            tipo: origem.tipo,
                            vencimento: origem.vencimento,
                            competencia: origem.competencia,
                            conta_id: origem.conta_id ?? conciliacao.conta_id,
                            parceiro_id: origem.parceiro_id,
                            descricao: `${origem.descricao ?? "Lançamento"} (pagamento parcial)`,
                            valor: pendente.valorPendente,
                            status: "pendente",
                            origem: "residuo_parcial",
                            plano_conta_id: origem.plano_conta_id,
                            departamento_id: origem.departamento_id,
                            centro_custo_id: origem.centro_custo_id,
                            parcela_atual: origem.parcela_atual,
                            total_parcelas: origem.total_parcelas,
                            riscos: origem.riscos ?? [],
                            is_residuo_parcial: true,
                            lancamento_origem_id: origem.id,
                            criado_por: usuarioId,
                        });
                    }
                }

    await tx.insert(historicoConciliacaoTable).values({
        conciliacao_id: conciliacao.id,
        usuario_id: usuarioId,
        acao: "salvar",
        detalhes: `Extrato ${extratoId} finalizado como conciliado em ${dataConciliacao}. Lançamentos atualizados: ${porLancamento.size}.`,
    });
}

router.post(
    "/conciliacoes/:extrato_id/finalizar",
    withPermission(PERM.CONCILIACAO_CONCLUIR),
    async (req, res) => {
        try {
            const extratoId = Number(req.params.extrato_id);
            const [conciliacao] = await db
                .select()
                .from(conciliacoesTable)
                .where(eq(conciliacoesTable.extrato_id, extratoId))
                .limit(1);

            if (!conciliacao) {
                return errorResponse(res, 404, "NOT_FOUND", "Conciliação do extrato não encontrada.");
            }

            const pendentes = await contarPendentes(db, conciliacao.id);
            if (pendentes > 0) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "Ainda existem linhas pendentes para conciliação.");
            }

            await db.transaction((tx) => persistirFinalizacao(tx, conciliacao, extratoId, req.user?.id));

            return successResponse(res, {
                extrato_id: extratoId,
                status: "conciliado",
                data_conciliacao: hojeIsoLocal(),
            });
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao finalizar extrato.", String(e));
        }
    });

/**
 * Regra de Ouro (Fase 8): "Salvar"/"Conciliar" na tela do extrato. Recebe TODAS
 * as decisões de vincular/ignorar tomadas em memória no front (ainda não
 * persistidas em lugar nenhum) e aplica cada uma de verdade, em sequência,
 * dentro de UMA ÚNICA transaction - se qualquer ação falhar, nada é gravado.
 * Se `finalizar` vier true (botão "Conciliar", tudo tratado) e realmente não
 * sobrar linha pendente após aplicar as ações, finaliza no mesmo golpe.
 */
const acaoRascunhoSchema = z.discriminatedUnion("tipo", [
    z.object({
        tipo: z.literal("vincular"),
        linha_id: z.coerce.number().int().positive(),
        lancamentos: vincularBodySchema.shape.lancamentos,
        gerar_parcial: z.boolean().default(false),
        residuo_lancamento_id: z.coerce.number().int().positive().optional(),
    }),
    z.object({
        tipo: z.literal("ignorar"),
        linha_id: z.coerce.number().int().positive(),
        motivo_codigo: z.enum(MOTIVOS_IGNORAR_PREDEFINIDOS).optional(),
        motivo: z.string().trim().max(500).optional(),
    }),
    z.object({
        tipo: z.literal("desfazer"),
        linha_id: z.coerce.number().int().positive(),
    }),
    z.object({
        tipo: z.literal("reverter_ignorar"),
        linha_id: z.coerce.number().int().positive(),
    }),
]);

const salvarBodySchema = z.object({
    acoes: z.array(acaoRascunhoSchema).default([]),
    finalizar: z.boolean().default(false),
});

router.post(
    "/conciliacoes/:extrato_id/salvar",
    withPermission(PERM.CONCILIACAO_VINCULAR),
    validateBody(salvarBodySchema),
    async (req, res) => {
        try {
            const extratoId = Number(req.params.extrato_id);
            const body = req.body as z.infer<typeof salvarBodySchema>;
            const usuarioId = req.user?.id;

            const [conciliacao] = await db
                .select()
                .from(conciliacoesTable)
                .where(eq(conciliacoesTable.extrato_id, extratoId))
                .limit(1);
            if (!conciliacao) {
                return errorResponse(res, 404, "NOT_FOUND", "Conciliação do extrato não encontrada.");
            }

            const motivoObrigatorio = body.acoes.some((a) => a.tipo === "ignorar")
                ? await getMotivoIgnorarObrigatorio()
                : false;
            for (const acao of body.acoes) {
                if (acao.tipo !== "ignorar" || !motivoObrigatorio) continue;
                const temCodigo = Boolean(acao.motivo_codigo);
                const temTexto = Boolean(acao.motivo && acao.motivo.length > 0);
                if (!temCodigo && !temTexto) {
                    return errorResponse(
                        res,
                        400,
                        "VALIDATION_ERROR",
                        `Motivo é obrigatório para ignorar a linha ${acao.linha_id} (parâmetro motivo_ignorar_obrigatorio).`,
                    );
                }
            }

            const resultadoPorLinha: Array<Record<string, unknown>> = [];
            let finalizado = false;

            await db.transaction(async (tx) => {
                for (const acao of body.acoes) {
                    if (acao.tipo === "vincular") {
                        const calc = await calcularVinculo(tx, {
                            linhaId: acao.linha_id,
                            lancamentosPayload: acao.lancamentos,
                            gerarParcial: acao.gerar_parcial,
                            residuoLancamentoId: acao.residuo_lancamento_id ?? null,
                        });
                        if (!calc.ok) {
                            throw errorComStatus(calc.status, calc.code, `Linha ${acao.linha_id}: ${calc.message}`);
                        }
                        const resultado = await persistirVinculo(tx, calc, {
                            linhaId: acao.linha_id,
                            lancamentosPayload: acao.lancamentos,
                            gerarParcial: acao.gerar_parcial,
                            residuoLancamentoId: acao.residuo_lancamento_id ?? null,
                            usuarioId,
                        });
                        resultadoPorLinha.push(resultado);
                    } else if (acao.tipo === "ignorar") {
                        const validado = await validarIgnorar(tx, acao.linha_id);
                        if (!validado.ok) {
                            throw errorComStatus(validado.status, validado.code, `Linha ${acao.linha_id}: ${validado.message}`);
                        }
                        const resultado = await persistirIgnorar(tx, validado, {
                            linhaId: acao.linha_id,
                            motivoCodigo: acao.motivo_codigo ?? null,
                            motivo: acao.motivo ?? null,
                            usuarioId,
                        });
                        resultadoPorLinha.push(resultado);
                    } else if (acao.tipo === "desfazer") {
                        const validado = await validarDesfazer(tx, acao.linha_id);
                        if (!validado.ok) {
                            throw errorComStatus(validado.status, validado.code, `Linha ${acao.linha_id}: ${validado.message}`);
                        }
                        const resultado = await persistirDesfazer(tx, validado, {linhaId: acao.linha_id, usuarioId});
                        resultadoPorLinha.push(resultado);
                    } else {
                        const validado = await validarReverterIgnorar(tx, acao.linha_id);
                        if (!validado.ok) {
                            throw errorComStatus(validado.status, validado.code, `Linha ${acao.linha_id}: ${validado.message}`);
                        }
                        const resultado = await persistirReverterIgnorar(tx, validado, {linhaId: acao.linha_id, usuarioId});
                        resultadoPorLinha.push(resultado);
                    }
                }

                if (body.finalizar) {
                    const pendentes = await contarPendentes(tx, conciliacao.id);
                    if (pendentes > 0) {
                        throw errorComStatus(400, "VALIDATION_ERROR", "Ainda existem linhas pendentes para conciliação.");
                    }
                    await persistirFinalizacao(tx, conciliacao, extratoId, usuarioId);
                    finalizado = true;
                }
            });

            return successResponse(res, {
                extrato_id: extratoId,
                linhas_processadas: resultadoPorLinha,
                finalizado,
            });
        } catch (e) {
            if (e instanceof ErroComStatus) {
                return errorResponse(res, e.status, e.code, e.message);
            }
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao salvar alterações da conciliação.", String(e));
        }
    },
);

/** DEF-09: desfazer todos os vínculos da linha - lê e valida se é possível. */
async function validarDesfazer(executor: typeof db, linhaId: number) {
    const [item] = await executor
        .select()
        .from(itensConciliacaoTable)
        .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
        .limit(1);

    if (!item) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Linha de extrato não encontrada para conciliação."};
    }
    if (item.status !== "vinculado") {
        return {ok: false as const, status: 400, code: "VALIDATION_ERROR", message: "A linha não está vinculada."};
    }

    const [conciliacao] = await executor
        .select()
        .from(conciliacoesTable)
        .where(eq(conciliacoesTable.id, item.conciliacao_id))
        .limit(1);
    if (!conciliacao) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Conciliação não encontrada."};
    }

    const vinculos = await executor
        .select()
        .from(itensConciliacaoLancamentosTable)
        .where(eq(itensConciliacaoLancamentosTable.item_conciliacao_id, item.id));

    const residuos = await executor
        .select()
        .from(lancamentosTable)
        .where(
            and(
                eq(lancamentosTable.is_residuo_parcial, true),
                inArray(
                    lancamentosTable.lancamento_origem_id,
                    vinculos.map((v) => v.lancamento_id).length > 0
                        ? vinculos.map((v) => v.lancamento_id)
                        : [-1],
                ),
            ),
        );

    const residuoQuitado = residuos.find(
        (r) => r.status === "pago" || r.status === "recebido" || r.status === "pago_parcial",
    );
    if (residuoQuitado) {
        return {
            ok: false as const,
            status: 409,
            code: "CONFLICT",
            message: `Não é possível desfazer: o residual #${residuoQuitado.id} já foi quitado. Estorne o residual antes.`,
        };
    }

    return {ok: true as const, item, conciliacao, vinculos, residuos};
}

type DesfazerCtx = Extract<Awaited<ReturnType<typeof validarDesfazer>>, { ok: true }>;

/** Persiste o desfazer (mesma lógica usada pela rota individual e pelo Salvar em lote). */
async function persistirDesfazer(tx: any, ctx: DesfazerCtx, params: { linhaId: number; usuarioId?: number }) {
    const {item, conciliacao, vinculos, residuos} = ctx;
    const {linhaId, usuarioId} = params;

    // Crítico: como persistirVinculo agora martela o título já no momento do
    // Salvar (não mais só no finalizar), o desfazer TAMBÉM precisa sempre
    // reverter o título - independente do status da conciliação - senão a
    // quitação fica "presa" no lançamento mesmo após o vínculo ser desfeito.
    for (const v of vinculos) {
        const [lanc] = await tx
            .select()
            .from(lancamentosTable)
            .where(eq(lancamentosTable.id, v.lancamento_id))
            .limit(1);
        if (!lanc) continue;

        const quitadoNovo = Math.max(0, toCents(lanc.valor_quitado) - toCents(v.valor_vinculado));
        const jurosNovo = Math.max(0, toCents(lanc.juros) - toCents(v.juros_multa));
        const descontoNovo = Math.max(0, toCents(lanc.desconto) - toCents(v.desconto));

        const novoStatus = statusAposDesfazerVinculo({
            statusAtual: lanc.status,
            tipoExtrato: lanc.tipo === "CR" ? "credito" : "debito",
            valorLancamentoCents: toCents(lanc.valor),
            valorQuitadoAcumuladoCents: quitadoNovo,
            descontoAcumuladoCents: descontoNovo,
            vencimento: lanc.vencimento,
            hojeIso: hojeIsoLocal(),
        });

        await tx
            .update(lancamentosTable)
            .set({
                status: novoStatus,
                valor_quitado: quitadoNovo > 0 ? centsToDecimalString(quitadoNovo) : null,
                data_quitacao:
                    quitadoNovo > 0 && (novoStatus === "pago" || novoStatus === "recebido" || novoStatus === "pago_parcial")
                        ? lanc.data_quitacao
                        : null,
                juros: centsToDecimalString(jurosNovo),
                desconto: centsToDecimalString(descontoNovo),
                updated_at: new Date(),
            })
            .where(eq(lancamentosTable.id, lanc.id));
    }

    if (residuos.length > 0) {
        await tx.delete(lancamentosTable).where(inArray(lancamentosTable.id, residuos.map((r: { id: number }) => r.id)));
    }

    await tx.delete(itensConciliacaoLancamentosTable).where(eq(itensConciliacaoLancamentosTable.item_conciliacao_id, item.id));

    await tx
        .update(itensConciliacaoTable)
        .set({
            status: "pendente",
            valor_vinculado_total: "0.00",
            valor_saldo: item.valor_extrato,
            data_conciliacao: null,
            updated_at: new Date(),
        })
        .where(eq(itensConciliacaoTable.id, item.id));

    await tx.insert(historicoConciliacaoTable).values({
        conciliacao_id: item.conciliacao_id,
        item_conciliacao_id: item.id,
        usuario_id: usuarioId,
        acao: "desfazer_vinculo",
        detalhes: JSON.stringify({linha_id: linhaId, vinculos_removidos: vinculos.length, reverteu_titulo: true}),
    });

    await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);

    return {linha_id: linhaId, status: "pendente" as const};
}

router.delete(
    "/conciliacoes/linhas/:linha_id/vinculos",
    withPermission(PERM.CONCILIACAO_DESFAZER),
    async (req, res) => {
        try {
            const linhaId = Number(req.params.linha_id);
            const validado = await validarDesfazer(db, linhaId);
            if (!validado.ok) {
                return errorResponse(res, validado.status, validado.code, validado.message);
            }

            const resultado = await db.transaction((tx) => persistirDesfazer(tx, validado, {linhaId, usuarioId: req.user?.id}));

            return successResponse(res, resultado);
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao desfazer vínculos da linha.", String(e));
        }
    });

/** Lê e valida se dá pra reverter o ignorar desta linha. */
async function validarReverterIgnorar(executor: typeof db, linhaId: number) {
    const [item] = await executor
        .select()
        .from(itensConciliacaoTable)
        .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
        .limit(1);

    if (!item) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Linha de extrato não encontrada para conciliação."};
    }
    if (item.status !== "ignorado") {
        return {ok: false as const, status: 400, code: "VALIDATION_ERROR", message: "A linha não está ignorada."};
    }

    const [conciliacao] = await executor
        .select()
        .from(conciliacoesTable)
        .where(eq(conciliacoesTable.id, item.conciliacao_id))
        .limit(1);
    if (!conciliacao) {
        return {ok: false as const, status: 404, code: "NOT_FOUND", message: "Conciliação não encontrada."};
    }

    return {ok: true as const, item, conciliacao};
}

type ReverterIgnorarCtx = Extract<Awaited<ReturnType<typeof validarReverterIgnorar>>, { ok: true }>;

/** Persiste o reverter-ignorar (mesma lógica usada pela rota individual e pelo Salvar em lote). */
async function persistirReverterIgnorar(tx: any, ctx: ReverterIgnorarCtx, params: { linhaId: number; usuarioId?: number }) {
    const {item, conciliacao} = ctx;
    const {linhaId, usuarioId} = params;

    await tx
        .update(itensConciliacaoTable)
        .set({status: "pendente", motivo_ignorar: null, motivo_ignorar_codigo: null, data_conciliacao: null, updated_at: new Date()})
        .where(eq(itensConciliacaoTable.id, item.id));

    await tx.insert(historicoConciliacaoTable).values({
        conciliacao_id: item.conciliacao_id,
        item_conciliacao_id: item.id,
        usuario_id: usuarioId,
        acao: "desfazer_vinculo",
        detalhes: JSON.stringify({linha_id: linhaId, acao: "reverter_ignorar"}),
    });

    await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);

    return {linha_id: linhaId, status: "pendente" as const};
}

/** DEF-09: reverter linha ignorada (nunca exige motivo - RN-H5). */
router.post(
    "/conciliacoes/linhas/:linha_id/reverter-ignorar",
    withPermission(PERM.CONCILIACAO_DESFAZER),
    async (req, res) => {
        try {
            const linhaId = Number(req.params.linha_id);
            const validado = await validarReverterIgnorar(db, linhaId);
            if (!validado.ok) {
                return errorResponse(res, validado.status, validado.code, validado.message);
            }

            const resultado = await db.transaction((tx) => persistirReverterIgnorar(tx, validado, {linhaId, usuarioId: req.user?.id}));

            return successResponse(res, resultado);
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao reverter ignorar da linha.", String(e));
        }
    });

export default router;