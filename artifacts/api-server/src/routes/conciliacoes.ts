import {createHash} from "crypto";
import {Router} from "express";
import {z} from "zod";
import multer from "multer";
import {and, count, desc, eq, gte, inArray, lt, lte, or, sql} from "drizzle-orm";
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
} from "@workspace/db/schema";
import {validateBody} from "../middlewares/validate";
import {errorResponse, successResponse} from "../utils/response";
import {parseOFX} from "../utils/ofx-parser";
import {parseCSV} from "../utils/csv-parser";
import type {OFXParseResult} from "../utils/ofx-parser";
import {centsToDecimalString, fromCents, sumCents, toCents} from "../utils/money";
import {decidirVincular, statusAposQuitacao} from "../utils/conciliacao-vincular";
import {hashLinhaExtrato} from "../utils/extrato-hash";
import {contasBancariasService} from "../domains/financial/contas-bancarias/contas-bancarias.service";

const router = Router();
const upload = multer({storage: multer.memoryStorage()});

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
});

/** DEF-04: digitação manual de saldo_pos_linha quando o arquivo não trouxer. */
const saldoManualBodySchema = z.object({
    saldo_pos_linha: z.union([z.string(), z.number()]),
});

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
 * Compara SEMPRE na data final do extrato (regra D-1 do Card 41) — nunca
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
        // comparar — saldoInicialCheck permanece null e a UI não exibe o bloco.
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

router.get("/conciliacoes", async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;

        const conditions = [];
        if (req.query.status) conditions.push(eq(extratosTable.status, req.query.status as "pendente" | "parcial" | "conciliado" | "cancelado"));
        if (req.query.conta_id) conditions.push(eq(conciliacoesTable.conta_id, parseInt(req.query.conta_id as string)));

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
                arquivo_nome: extratosTable.arquivo_nome,
                periodo_inicio: conciliacoesTable.periodo_inicio,
                periodo_fim: conciliacoesTable.periodo_fim,
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
}): Promise < 
    | { parsed: OFXParseResult }
    | { error: { status: number; code: string; message: string; detail?: string } }
> {
    if (!req.file) {
        return {error: {status: 400, code: "VALIDATION_ERROR", message: "Campo obrigatório: arquivo (OFX ou CSV)."}};
    }
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "ofx" && ext !== "csv") {
        return {
            error: {
                status: 400,
                code: "VALIDATION_ERROR",
                message: "Formato de arquivo não suportado. Envie OFX ou CSV.",
            },
        };
    }
    try {
        const parsed = ext === "csv" ? parseCSV(req.file.buffer) : parseOFX(req.file.buffer);
        return {parsed};
    } catch (parseErr) {
        return {
            error: {
                status: 422,
                code: "PARSE_ERROR",
                message: "Arquivo inválido ou malformado.",
                detail: String(parseErr),
            },
        };
    }
}

/** Pré-análise sem persistir (DEF-02). */
router.post(
    "/conciliacoes/pre-analise",
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

            await tx.insert(itensConciliacaoTable).values(
                linhasInseridas.map((l) => ({
                    conciliacao_id: conciliacao.id,
                    extrato_linha_id: l.id,
                    valor_extrato: l.valor,
                    valor_vinculado_total: "0.00",
                    valor_saldo: l.valor,
                    status: "pendente" as const,
                    tipo_extrato: l.tipo_movimento,
                    descricao: l.descricao,
                    data: l.data_movimento,
                })),
            );

            return {conciliacao, extrato};
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

router.get("/conciliacoes/buscar-lancamentos", async (req, res) => {
    try {
        const linhaId = Number(req.query.linha_id);
        if (!linhaId) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Parâmetro obrigatório: linha_id.");
        }

        const diasJanela = Number(req.query.dias_janela ?? 7);
        const [linha] = await db
            .select({
                id: extratoLinhasTable.id,
                tipo_movimento: extratoLinhasTable.tipo_movimento,
                data_movimento: extratoLinhasTable.data_movimento,
            })
            .from(extratoLinhasTable)
            .where(eq(extratoLinhasTable.id, linhaId))
            .limit(1);

        if (!linha) {
            return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada.");
        }

        const tipoCompatvel = linha.tipo_movimento === "debito" ? "CP" : "CR";
        const dataRef = linha.data_movimento ? new Date(linha.data_movimento) : new Date();
        const dataInicio = new Date(dataRef);
        dataInicio.setDate(dataInicio.getDate() - diasJanela);
        const dataFim = new Date(dataRef);
        dataFim.setDate(dataFim.getDate() + diasJanela);

        const lancamentos = await db
            .select({
                id: lancamentosTable.id,
                tipo: lancamentosTable.tipo,
                vencimento: lancamentosTable.vencimento,
                descricao: lancamentosTable.descricao,
                valor: lancamentosTable.valor,
                status: lancamentosTable.status,
                parceiro_id: lancamentosTable.parceiro_id,
                plano_conta_id: lancamentosTable.plano_conta_id,
            })
            .from(lancamentosTable)
            .where(
                and(
                    eq(lancamentosTable.tipo, tipoCompatvel),
                    or(eq(lancamentosTable.status, "pendente"), eq(lancamentosTable.status, "atrasado")),
                    gte(lancamentosTable.vencimento, dataInicio.toISOString().split("T")[0]),
                    lte(lancamentosTable.vencimento, dataFim.toISOString().split("T")[0]),
                ),
            )
            .orderBy(desc(lancamentosTable.vencimento));

        return successResponse(
            res,
            lancamentos.map((l) => ({...l, valor: toDecimal(l.valor)})),
            {linha_id: linha.id, tipo_movimento: linha.tipo_movimento, dias_janela: diasJanela},
        );
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar lançamentos para vínculo.", String(e));
    }
});

router.get("/conciliacoes/:extrato_id", async (req, res) => {
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
            })
            .from(extratoLinhasTable)
            .innerJoin(itensConciliacaoTable, eq(itensConciliacaoTable.extrato_linha_id, extratoLinhasTable.id))
            .where(eq(extratoLinhasTable.extrato_id, extratoId))
            .orderBy(desc(extratoLinhasTable.data_movimento));

        const itemIds = linhas.map((l) => l.item_id);
        const vinculos = itemIds.length > 0
            ? await db
                .select({
                    item_conciliacao_id: itensConciliacaoLancamentosTable.item_conciliacao_id,
                    lancamento_id: itensConciliacaoLancamentosTable.lancamento_id,
                    valor_vinculado: itensConciliacaoLancamentosTable.valor_vinculado,
                    desconto: itensConciliacaoLancamentosTable.desconto,
                    juros_multa: itensConciliacaoLancamentosTable.juros_multa,
                    lancamento_descricao: lancamentosTable.descricao,
                    lancamento_tipo: lancamentosTable.tipo,
                    lancamento_status: lancamentosTable.status,
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
            vinculacoes: vinculos
                .filter((v) => v.item_conciliacao_id === linha.item_id)
                .map((v) => ({
                    lancamento_id: v.lancamento_id,
                    descricao: v.lancamento_descricao,
                    tipo: v.lancamento_tipo,
                    status: v.lancamento_status,
                    valor_vinculado: toDecimal(v.valor_vinculado),
                    desconto: toDecimal(v.desconto),
                    juros_multa: toDecimal(v.juros_multa),
                    /** @deprecated alias - usar juros_multa */
                    acrescimo: toDecimal(v.juros_multa),
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
            },
            linhas: linhasDetalhadas,
            diagnostico,
        });
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao detalhar extrato.", String(e));
    }
});

router.post("/conciliacoes/linhas/:linha_id/ignorar", async (req, res) => {
    try {
        const linhaId = Number(req.params.linha_id);
        const [item] = await db
            .select({
                id: itensConciliacaoTable.id,
                conciliacao_id: itensConciliacaoTable.conciliacao_id,
                extrato_linha_id: itensConciliacaoTable.extrato_linha_id,
            })
            .from(itensConciliacaoTable)
            .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
            .limit(1);

        if (!item) {
            return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada para conciliação.");
        }

        const [conciliacao] = await db
            .select({extrato_id: conciliacoesTable.extrato_id})
            .from(conciliacoesTable)
            .where(eq(conciliacoesTable.id, item.conciliacao_id))
            .limit(1);

        if (!conciliacao) {
            return errorResponse(res, 404, "NOT_FOUND", "Conciliação não encontrada.");
        }

        await db.transaction(async (tx) => {
            await tx
                .update(itensConciliacaoTable)
                .set({
                    status: "ignorado",
                    updated_at: new Date(),
                })
                .where(eq(itensConciliacaoTable.id, item.id));

            await tx.insert(historicoConciliacaoTable).values({
                conciliacao_id: item.conciliacao_id,
                item_conciliacao_id: item.id,
                usuario_id: req.user?.id,
                acao: "ignorar",
                detalhes: `Linha ${linhaId} marcada como ignorada.`,
            });

            await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);
        });

        return successResponse(res, {linha_id: linhaId, status: "ignorado"});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao ignorar linha do extrato.", String(e));
    }
});

router.post(
    "/conciliacoes/linhas/:linha_id/vincular",
    validateBody(vincularBodySchema),
    async (req, res) => {
        try {
            const linhaId = Number(req.params.linha_id);
            const {
                lancamentos: lancamentosPayload,
                gerar_parcial: gerarParcial,
                residuo_lancamento_id: residuoLancamentoId
            } =
                req.body as VincularBody;

            const [item] = await db
                .select()
                .from(itensConciliacaoTable)
                .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
                .limit(1);

            if (!item) {
                return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada para conciliação.");
            }
            if (item.status === "vinculado") {
                return errorResponse(res, 409, "CONFLICT", "Esta linha já está vinculada.");
            }

            const vinculosExistentes = await db
                .select({id: itensConciliacaoLancamentosTable.id})
                .from(itensConciliacaoLancamentosTable)
                .where(eq(itensConciliacaoLancamentosTable.item_conciliacao_id, item.id));
            if (vinculosExistentes.length > 0) {
                return errorResponse(res, 409, "CONFLICT", "Esta linha já possui vínculos registrados.");
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

            const idsLancamentos = lancamentosPayload.map((l) => l.lancamento_id);
            const lancamentos = await db
                .select()
                .from(lancamentosTable)
                .where(inArray(lancamentosTable.id, idsLancamentos));

            if (lancamentos.length !== idsLancamentos.length) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "Um ou mais lançamentos informados são inválidos.");
            }

            const valorExtratoCents = toCents(item.valor_extrato);
            const payloadMap = new Map(lancamentosPayload.map((l) => [l.lancamento_id, l]));

            const decision = decidirVincular({
                extratoCents: valorExtratoCents,
                lancamentos: lancamentos.map((lancamento) => {
                    const p = payloadMap.get(lancamento.id);
                    const jurosMulta = p?.juros_multa ?? p?.acrescimo ?? 0;
                    return {
                        lancamento_id: lancamento.id,
                        valorCents: toCents(lancamento.valor),
                        descontoCents: toCents(p?.desconto ?? 0),
                        jurosMultaCents: toCents(jurosMulta),
                        quitadoAnteriorCents: toCents(lancamento.valor_quitado),
                    };
                }),
                gerarParcial,
                residuoLancamentoId: residuoLancamentoId ?? null,
            });

            if (!decision.ok) {
                return errorResponse(res, decision.status, decision.code, decision.message);
            }

            const lancamentoById = new Map(lancamentos.map((l) => [l.id, l]));
            const totalConciliadoCents = sumCents(
                decision.itens.map((i) => i.valorVinculadoCents),
            );

            const resultado = await db.transaction(async (tx) => {
                let novoResiduo: unknown = null;

                if (decision.residual) {
                    const origem = lancamentoById.get(decision.residual.origemLancamentoId);
                    if (!origem) {
                        throw new Error("Não foi possível identificar lançamento de origem para o residual.");
                    }

                    const [residuo] = await tx
                        .insert(lancamentosTable)
                        .values({
                            tipo: origem.tipo,
                            vencimento: origem.vencimento,
                            competencia: origem.competencia,
                            conta_id: origem.conta_id,
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
                            criado_por: req.user?.id,
                        })
                        .returning();

                    novoResiduo = residuo;
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

                for (const vinculo of decision.itens) {
                    const lancamento = lancamentoById.get(vinculo.lancamento_id)!;
                    const quitadoAnteriorCents = toCents(lancamento.valor_quitado);
                    const quitadoAcumuladoCents =
                        quitadoAnteriorCents + vinculo.valorQuitadoNesteVinculoCents;
                    const valorLancamentoCents = toCents(lancamento.valor);

                    const jurosAnteriorCents = toCents(lancamento.juros);
                    const jurosNovoCents = jurosAnteriorCents + vinculo.jurosMultaCents;

                    const statusQuitacao = statusAposQuitacao({
                        tipoExtrato: item.tipo_extrato,
                        valorLancamentoCents,
                        valorQuitadoAcumuladoCents: quitadoAcumuladoCents,
                    });

                    await tx
                        .update(lancamentosTable)
                        .set({
                            status: statusQuitacao,
                            data_quitacao: linhaExtrato.data_movimento,
                            valor_quitado: centsToDecimalString(quitadoAcumuladoCents),
                            desconto: sql`${lancamentosTable.desconto}
                            +
                            ${centsToDecimalString(vinculo.descontoCents)}`,
                            juros: centsToDecimalString(jurosNovoCents),
                            updated_at: new Date(),
                        })
                        .where(eq(lancamentosTable.id, vinculo.lancamento_id));
                }

                await tx
                    .update(itensConciliacaoTable)
                    .set({
                        status: "vinculado",
                        valor_vinculado_total: centsToDecimalString(totalConciliadoCents),
                        valor_saldo: centsToDecimalString(decision.valorSaldoCents),
                        updated_at: new Date(),
                    })
                    .where(eq(itensConciliacaoTable.id, item.id));

                await tx.insert(historicoConciliacaoTable).values({
                    conciliacao_id: item.conciliacao_id,
                    item_conciliacao_id: item.id,
                    usuario_id: req.user?.id,
                    acao: decision.residual ? "criar_residuo_parcial" : "vincular",
                    detalhes: JSON.stringify({
                        linha_id: linhaId,
                        lancamentos: lancamentosPayload,
                        gerar_parcial: gerarParcial,
                        residuo_lancamento_id: residuoLancamentoId ?? null,
                        valor_extrato: fromCents(valorExtratoCents),
                        total_conciliado: fromCents(totalConciliadoCents),
                        delta: fromCents(decision.deltaCents),
                        ramo: decision.ramo,
                        valor_saldo: fromCents(decision.valorSaldoCents),
                    }),
                });

                await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);

                return {
                    linha_id: linhaId,
                    status: "vinculado",
                    ramo: decision.ramo,
                    delta: fromCents(decision.deltaCents),
                    total_conciliado: fromCents(totalConciliadoCents),
                    valor_saldo: fromCents(decision.valorSaldoCents),
                    residuo: novoResiduo,
                };
            });

            return successResponse(res, resultado);
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao vincular lançamentos da linha.", String(e));
        }
    },
);

/**
 * DEF-04: digitação manual de saldo_pos_linha quando o arquivo (CSV/OFX) não
 * trouxer essa informação. Não sobrescreve silenciosamente um valor já
 * capturado do arquivo — passe ?force=true para corrigir um valor existente.
 */
router.patch(
    "/conciliacoes/linhas/:linha_id/saldo",
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

router.post("/conciliacoes/:extrato_id/finalizar", async (req, res) => {
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

        const [pendente] = await db
            .select({total: count()})
            .from(itensConciliacaoTable)
            .where(and(eq(itensConciliacaoTable.conciliacao_id, conciliacao.id), eq(itensConciliacaoTable.status, "pendente")));

        if (Number(pendente.total) > 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Ainda existem linhas pendentes para conciliação.");
        }

        await db.transaction(async (tx) => {
            await tx
                .update(extratosTable)
                .set({status: "conciliado", updated_at: new Date()})
                .where(eq(extratosTable.id, extratoId));

            await tx
                .update(conciliacoesTable)
                .set({status: "conciliado", updated_at: new Date()})
                .where(eq(conciliacoesTable.id, conciliacao.id));

            await tx.insert(historicoConciliacaoTable).values({
                conciliacao_id: conciliacao.id,
                usuario_id: req.user?.id,
                acao: "salvar",
                detalhes: `Extrato ${extratoId} finalizado como conciliado.`,
            });
        });

        return successResponse(res, {extrato_id: extratoId, status: "conciliado"});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao finalizar extrato.", String(e));
    }
});

/** DEF-09: desfazer todos os vínculos da linha. */
router.delete("/conciliacoes/linhas/:linha_id/vinculos", async (req, res) => {
    try {
        const linhaId = Number(req.params.linha_id);
        const [item] = await db
            .select()
            .from(itensConciliacaoTable)
            .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
            .limit(1);

        if (!item) {
            return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada para conciliação.");
        }
        if (item.status !== "vinculado") {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A linha não está vinculada.");
        }

        const [conciliacao] = await db
            .select()
            .from(conciliacoesTable)
            .where(eq(conciliacoesTable.id, item.conciliacao_id))
            .limit(1);
        if (!conciliacao) {
            return errorResponse(res, 404, "NOT_FOUND", "Conciliação não encontrada.");
        }

        const vinculos = await db
            .select()
            .from(itensConciliacaoLancamentosTable)
            .where(eq(itensConciliacaoLancamentosTable.item_conciliacao_id, item.id));

        const residuos = await db
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
            return errorResponse(
                res,
                409,
                "CONFLICT",
                `Não é possível desfazer: o residual #${residuoQuitado.id} já foi quitado. Estorne o residual antes.`,
            );
        }

        await db.transaction(async (tx) => {
            for (const v of vinculos) {
                const [lanc] = await tx
                    .select()
                    .from(lancamentosTable)
                    .where(eq(lancamentosTable.id, v.lancamento_id))
                    .limit(1);
                if (!lanc) continue;

                const quitadoNovo = Math.max(
                    0,
                    toCents(lanc.valor_quitado) - toCents(v.valor_vinculado),
                );
                const jurosNovo = Math.max(0, toCents(lanc.juros) - toCents(v.juros_multa));
                const descontoNovo = Math.max(0, toCents(lanc.desconto) - toCents(v.desconto));

                let novoStatus: "pendente" | "atrasado" | "pago_parcial" | "pago" | "recebido" =
                    "pendente";
                if (quitadoNovo > 0 && quitadoNovo < toCents(lanc.valor)) {
                    novoStatus = "pago_parcial";
                } else if (quitadoNovo >= toCents(lanc.valor) && toCents(lanc.valor) > 0) {
                    novoStatus = lanc.tipo === "CR" ? "recebido" : "pago";
                } else if (lanc.vencimento) {
                    const hoje = new Date().toISOString().slice(0, 10);
                    if (lanc.vencimento < hoje) novoStatus = "atrasado";
                }

                await tx
                    .update(lancamentosTable)
                    .set({
                        status: novoStatus,
                        valor_quitado: quitadoNovo > 0 ? centsToDecimalString(quitadoNovo) : null,
                        data_quitacao: quitadoNovo > 0 ? lanc.data_quitacao : null,
                        juros: centsToDecimalString(jurosNovo),
                        desconto: centsToDecimalString(descontoNovo),
                        updated_at: new Date(),
                    })
                    .where(eq(lancamentosTable.id, lanc.id));
            }

            if (residuos.length > 0) {
                await tx.delete(lancamentosTable).where(
                    inArray(
                        lancamentosTable.id,
                        residuos.map((r) => r.id),
                    ),
                );
            }

            await tx
                .delete(itensConciliacaoLancamentosTable)
                .where(eq(itensConciliacaoLancamentosTable.item_conciliacao_id, item.id));

            await tx
                .update(itensConciliacaoTable)
                .set({
                    status: "pendente",
                    valor_vinculado_total: "0.00",
                    valor_saldo: item.valor_extrato,
                    updated_at: new Date(),
                })
                .where(eq(itensConciliacaoTable.id, item.id));

            await tx.insert(historicoConciliacaoTable).values({
                conciliacao_id: item.conciliacao_id,
                item_conciliacao_id: item.id,
                usuario_id: req.user?.id,
                acao: "desfazer_vinculo",
                detalhes: JSON.stringify({linha_id: linhaId, vinculos_removidos: vinculos.length}),
            });

            await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);
        });

        return successResponse(res, {linha_id: linhaId, status: "pendente"});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao desfazer vínculos da linha.", String(e));
    }
});

/** DEF-09: reverter linha ignorada (nunca exige motivo - RN-H5). */
router.post("/conciliacoes/linhas/:linha_id/reverter-ignorar", async (req, res) => {
    try {
        const linhaId = Number(req.params.linha_id);
        const [item] = await db
            .select()
            .from(itensConciliacaoTable)
            .where(eq(itensConciliacaoTable.extrato_linha_id, linhaId))
            .limit(1);

        if (!item) {
            return errorResponse(res, 404, "NOT_FOUND", "Linha de extrato não encontrada para conciliação.");
        }
        if (item.status !== "ignorado") {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A linha não está ignorada.");
        }

        const [conciliacao] = await db
            .select()
            .from(conciliacoesTable)
            .where(eq(conciliacoesTable.id, item.conciliacao_id))
            .limit(1);
        if (!conciliacao) {
            return errorResponse(res, 404, "NOT_FOUND", "Conciliação não encontrada.");
        }

        await db.transaction(async (tx) => {
            await tx
                .update(itensConciliacaoTable)
                .set({status: "pendente", updated_at: new Date()})
                .where(eq(itensConciliacaoTable.id, item.id));

            await tx.insert(historicoConciliacaoTable).values({
                conciliacao_id: item.conciliacao_id,
                item_conciliacao_id: item.id,
                usuario_id: req.user?.id,
                acao: "desfazer_vinculo",
                detalhes: JSON.stringify({linha_id: linhaId, acao: "reverter_ignorar"}),
            });

            await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);
        });

        return successResponse(res, {linha_id: linhaId, status: "pendente"});
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao reverter ignorar da linha.", String(e));
    }
});

export default router;