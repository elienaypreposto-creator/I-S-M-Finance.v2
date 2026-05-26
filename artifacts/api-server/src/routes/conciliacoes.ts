import {Router} from "express";
import multer from "multer";
import {and, count, desc, eq, gte, inArray, lte, or, sql} from "drizzle-orm";
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
import {errorResponse, successResponse} from "../utils/response";

const router = Router();
const upload = multer({storage: multer.memoryStorage()});

const toNumber = (value: unknown) => Number(value ?? 0);

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

router.post("/conciliacoes/importar", upload.single("arquivo"), async (req, res) => {
    if (!req.body?.conta_id) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "Campo obrigatório: conta_id.");
    }
    if (!req.file) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "Campo obrigatório: arquivo (OFX ou CSV).");
    }
    return errorResponse(
        res,
        501,
        "NOT_IMPLEMENTED",
        "Parser de extrato bancário (OFX/CSV) ainda não implementado. " +
        "Forneça um serviço de parsing e substitua este bloco pela lógica real de importação.",
    );
});

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
            lancamentos.map((l) => ({...l, valor: toNumber(l.valor)})),
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
                    acrescimo: itensConciliacaoLancamentosTable.acrescimo,
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
            valor: toNumber(linha.valor),
            data_movimento: linha.data_movimento,
            documento: linha.documento,
            status: linha.item_status,
            valor_vinculado_total: toNumber(linha.valor_vinculado_total),
            valor_saldo: toNumber(linha.valor_saldo),
            vinculacoes: vinculos
                .filter((v) => v.item_conciliacao_id === linha.item_id)
                .map((v) => ({
                    lancamento_id: v.lancamento_id,
                    descricao: v.lancamento_descricao,
                    tipo: v.lancamento_tipo,
                    status: v.lancamento_status,
                    valor_vinculado: toNumber(v.valor_vinculado),
                    desconto: toNumber(v.desconto),
                    acrescimo: toNumber(v.acrescimo),
                })),
        }));

        return successResponse(res, {
            extrato: {
                ...extrato,
                total_creditos: toNumber(extrato.total_creditos),
                total_debitos: toNumber(extrato.total_debitos),
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

router.post("/conciliacoes/linhas/:linha_id/vincular", async (req, res) => {
    try {
        const linhaId = Number(req.params.linha_id);
        const lancamentosPayload = Array.isArray(req.body?.lancamentos) ? req.body.lancamentos : [];
        const gerarParcial = Boolean(req.body?.gerar_parcial);

        if (lancamentosPayload.length === 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Envie ao menos um lançamento para vincular.");
        }

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

        const idsLancamentos = lancamentosPayload.map((l: { lancamento_id: number }) => Number(l.lancamento_id));
        const lancamentos = await db
            .select()
            .from(lancamentosTable)
            .where(inArray(lancamentosTable.id, idsLancamentos));

        if (lancamentos.length !== idsLancamentos.length) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Um ou mais lançamentos informados são inválidos.");
        }

        const valorExtrato = toNumber(item.valor_extrato);
        let totalConciliado = 0;

        const payloadMap = new Map(
            lancamentosPayload.map((l: {
                lancamento_id: number;
                desconto?: number;
                acrescimo?: number
            }) => [Number(l.lancamento_id), l]),
        );

        const vinculosParaInserir = lancamentos.map((lancamento) => {
            const p = payloadMap.get(lancamento.id) ?? {desconto: 0, acrescimo: 0};
            const desconto = Number(p.desconto ?? 0);
            const acrescimo = Number(p.acrescimo ?? 0);
            const valorBase = toNumber(lancamento.valor);
            const valorVinculado = valorBase - desconto + acrescimo;
            totalConciliado += valorVinculado;
            return {
                lancamento,
                desconto,
                acrescimo,
                valorVinculado,
            };
        });

        const valorSaldo = Math.max(0, Number((valorExtrato - totalConciliado).toFixed(2)));

        const resultado = await db.transaction(async (tx) => {
            let novoResiduo: unknown = null;

            if (gerarParcial && valorSaldo > 0) {
                const origem = vinculosParaInserir[0]?.lancamento;
                if (!origem) {
                    throw new Error("Não foi possível identificar lançamento de origem para gerar resíduo.");
                }

                const [residuo] = await tx
                    .insert(lancamentosTable)
                    .values({
                        tipo: origem.tipo,
                        vencimento: origem.vencimento,
                        competencia: origem.competencia,
                        conta_id: origem.conta_id,
                        parceiro_id: origem.parceiro_id,
                        descricao: `${origem.descricao ?? "Lançamento"} (Resíduo parcial automático)`,
                        valor: String(valorSaldo.toFixed(2)),
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
                vinculosParaInserir.map((v) => ({
                    item_conciliacao_id: item.id,
                    lancamento_id: v.lancamento.id,
                    valor_vinculado: String(v.valorVinculado.toFixed(2)),
                    desconto: String(v.desconto.toFixed(2)),
                    acrescimo: String(v.acrescimo.toFixed(2)),
                })),
            );

            const statusQuitacao = item.tipo_extrato === "credito" ? "recebido" : "pago";
            for (const vinculo of vinculosParaInserir) {
                await tx
                    .update(lancamentosTable)
                    .set({
                        status: statusQuitacao,
                        data_quitacao: linhaExtrato.data_movimento,
                        valor_quitado: String(vinculo.valorVinculado.toFixed(2)),
                        desconto: sql`${lancamentosTable.desconto}
                        +
                        ${String(vinculo.desconto.toFixed(2))}`,
                        acrescimo: sql`${lancamentosTable.acrescimo}
                        +
                        ${String(vinculo.acrescimo.toFixed(2))}`,
                        updated_at: new Date(),
                    })
                    .where(eq(lancamentosTable.id, vinculo.lancamento.id));
            }

            await tx
                .update(itensConciliacaoTable)
                .set({
                    status: "vinculado",
                    valor_vinculado_total: String(totalConciliado.toFixed(2)),
                    valor_saldo: String(valorSaldo.toFixed(2)),
                    updated_at: new Date(),
                })
                .where(eq(itensConciliacaoTable.id, item.id));

            await tx.insert(historicoConciliacaoTable).values({
                conciliacao_id: item.conciliacao_id,
                item_conciliacao_id: item.id,
                usuario_id: req.user?.id,
                acao: gerarParcial && valorSaldo > 0 ? "criar_residuo_parcial" : "vincular",
                detalhes: JSON.stringify({
                    linha_id: linhaId,
                    lancamentos: lancamentosPayload,
                    gerar_parcial: gerarParcial,
                    valor_extrato: valorExtrato,
                    total_conciliado: Number(totalConciliado.toFixed(2)),
                    valor_saldo: Number(valorSaldo.toFixed(2)),
                }),
            });

            await atualizarResumoConciliacao(tx, item.conciliacao_id, conciliacao.extrato_id);

            return {
                linha_id: linhaId,
                status: "vinculado",
                total_conciliado: Number(totalConciliado.toFixed(2)),
                valor_saldo: Number(valorSaldo.toFixed(2)),
                residuo: novoResiduo,
            };
        });

        return successResponse(res, resultado);
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao vincular lançamentos da linha.", String(e));
    }
});

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

export default router;
