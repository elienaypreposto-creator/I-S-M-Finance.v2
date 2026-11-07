import {and, count, desc, eq, sql, type SQL} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    contasBancariasTable,
    centrosCustosTable,
    departamentosTable,
    itensConciliacaoLancamentosTable,
    lancamentosTable,
    parceirosTable,
    planoContasTable,
} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {tenantScope, tenantWhere, withEmpresaId} from "../../../lib/tenant-scope";

import {assertRefsDaEmpresa} from "../../../lib/tenant-refs-guard";
import {
    LIMITE_EXPORT_LANCAMENTOS,
    type CreateLancamentoBody,
    type FiltrosLancamentos,
    type ListLancamentosQuery,
    type UpdateLancamentoBody,
} from "./schemas";
import {montarWhereLancamentos} from "./lancamentos.filtros";
import {MSG_REABRIR_CONCILIADO, statusNaCriacao, type StatusManual} from "./status-manual";
import {hojeIsoLocal} from "../../../utils/date-civil";
import {fromCents, toCents} from "../../../utils/money";
import {emAbertoLinhaCents, emAbertoLinhaSql, quitadoCents, quitadoSql, temResidualAtivoSql} from "./em-aberto";
import {CAMPOS_RETENCAO, MSG_RETENCOES_ACIMA_DO_VALOR, somaRetencoesCents} from "../../../utils/retencoes";

function formatPlanoContaPath(categoria: string | null, subcategoria: string | null): string | null {
    const pai = categoria?.trim() ?? "";
    const sub = subcategoria?.trim() ?? "";
    if (pai && sub) return `${pai} / ${sub}`;
    if (sub) return sub;
    if (pai) return pai;
    return null;
}

const STATUS_EXCLUIVEIS = new Set(["pendente", "atrasado"]);

const resolveDepartamentoCentroByParceiro = async (empresaId: number, parceiroId?: number | null) => {
    if (!parceiroId) {
        return {departamento_id: undefined, centro_custo_id: undefined};
    }

    const [parceiro] = await db
        .select({
            departamento_id: parceirosTable.departamento_id,
            centro_custo_id: parceirosTable.centro_custo_id,
        })
        .from(parceirosTable)
        .where(tenantWhere(parceirosTable, empresaId, eq(parceirosTable.id, parceiroId)))
        .limit(1);

    return {
        departamento_id: parceiro?.departamento_id ?? undefined,
        centro_custo_id: parceiro?.centro_custo_id ?? undefined,
    };
};

/** Retenções + líquido como número (borda HTTP). */
function retencoesParaHttp(item: Partial<Record<(typeof CAMPOS_RETENCAO)[number] | "valor_liquido", unknown>>) {
    return {
        retencao_ir: Number(item.retencao_ir ?? 0),
        retencao_pis: Number(item.retencao_pis ?? 0),
        retencao_cofins: Number(item.retencao_cofins ?? 0),
        retencao_csll: Number(item.retencao_csll ?? 0),
        retencao_inss: Number(item.retencao_inss ?? 0),
        retencao_iss: Number(item.retencao_iss ?? 0),
        valor_liquido: Number(item.valor_liquido ?? 0),
    };
}

async function buscarItens(where: SQL, limit: number, offset: number) {
    const items = await db
        .select({
            id: lancamentosTable.id,
            tipo: lancamentosTable.tipo,
            vencimento: lancamentosTable.vencimento,
            competencia: lancamentosTable.competencia,
            conta_id: lancamentosTable.conta_id,
            conta_nome: contasBancariasTable.nome,
            parceiro_id: lancamentosTable.parceiro_id,
            parceiro_nome: parceirosTable.nome,
            descricao: lancamentosTable.descricao,
            tipo_documento: lancamentosTable.tipo_documento,
            numero_documento: lancamentosTable.numero_documento,
            observacao: lancamentosTable.observacao,
            valor: lancamentosTable.valor,
            desconto: lancamentosTable.desconto,
            juros: lancamentosTable.juros,
            retencao_ir: lancamentosTable.retencao_ir,
            retencao_pis: lancamentosTable.retencao_pis,
            retencao_cofins: lancamentosTable.retencao_cofins,
            retencao_csll: lancamentosTable.retencao_csll,
            retencao_inss: lancamentosTable.retencao_inss,
            retencao_iss: lancamentosTable.retencao_iss,
            valor_liquido: lancamentosTable.valor_liquido,
            valor_quitado: lancamentosTable.valor_quitado,
            // Pago parcial cujo restante passou para um residual (não conta aqui);
            // o CASE só roda a subconsulta nas linhas pago_parcial.
            tem_residual_ativo: sql<boolean>`(case when ${lancamentosTable.status} = 'pago_parcial' then ${temResidualAtivoSql} else false end)`,
            status: lancamentosTable.status,
            plano_conta_id: lancamentosTable.plano_conta_id,
            plano_conta_categoria: planoContasTable.categoria,
            plano_conta_subcategoria: planoContasTable.subcategoria,
            departamento_id: lancamentosTable.departamento_id,
            departamento_nome: departamentosTable.nome,
            centro_custo_id: lancamentosTable.centro_custo_id,
            centro_custo_nome: centrosCustosTable.nome,
            parcela_atual: lancamentosTable.parcela_atual,
            total_parcelas: lancamentosTable.total_parcelas,
            riscos: lancamentosTable.riscos,
            dados_pagamento: lancamentosTable.dados_pagamento,
            created_at: lancamentosTable.created_at,
        })
        .from(lancamentosTable)
        .leftJoin(contasBancariasTable, eq(lancamentosTable.conta_id, contasBancariasTable.id))
        .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
        .leftJoin(planoContasTable, eq(lancamentosTable.plano_conta_id, planoContasTable.id))
        .leftJoin(departamentosTable, eq(lancamentosTable.departamento_id, departamentosTable.id))
        .leftJoin(centrosCustosTable, eq(lancamentosTable.centro_custo_id, centrosCustosTable.id))
        .where(where)
        .orderBy(desc(lancamentosTable.vencimento), desc(lancamentosTable.id))
        .limit(limit)
        .offset(offset);

    return items.map((item) => {
        const valorBruto = Number(item.valor ?? 0);
        const desconto = Number(item.desconto ?? 0);
        const juros = Number(item.juros ?? 0);
        return {
            ...item,
            ...retencoesParaHttp(item),
            plano_conta_nome: formatPlanoContaPath(item.plano_conta_categoria, item.plano_conta_subcategoria),
            // Valor da linha: bruto − desconto + juros (sem tirar retenções).
            valor: Math.max(valorBruto - desconto + juros, 0),
            valor_bruto: valorBruto,
            desconto,
            juros,
            valor_quitado: fromCents(quitadoCents(item)),
            /** O que falta quitar (mesma regra do resumo "A receber / A pagar"). */
            valor_em_aberto: fromCents(emAbertoLinhaCents(item)),
        };
    });
}

/**
 * Resumo da lista com os mesmos filtros: quantidade (todos os status),
 * "A receber / A pagar" = só o que está em aberto, no critério da coluna de
 * valor (ver em-aberto.ts), e "Recebido / Pago" = o que já foi quitado.
 */
async function resumir(where: SQL) {
    const linhas = await db
        .select({
            tipo: lancamentosTable.tipo,
            quantidade: count(),
            em_aberto: sql<string>`coalesce(sum(${emAbertoLinhaSql}), 0)`,
            quitado: sql<string>`coalesce(sum(${quitadoSql}), 0)`,
        })
        .from(lancamentosTable)
        .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
        .where(where)
        .groupBy(lancamentosTable.tipo);

    const doTipo = (t: "CR" | "CP", campo: "em_aberto" | "quitado") =>
        fromCents(toCents(linhas.find((l) => l.tipo === t)?.[campo]));
    return {
        total: linhas.reduce((acc, l) => acc + Number(l.quantidade), 0),
        totais: {
            receber: doTipo("CR", "em_aberto"),
            pagar: doTipo("CP", "em_aberto"),
            recebido: doTipo("CR", "quitado"),
            pago: doTipo("CP", "quitado"),
        },
    };
}

export const lancamentosService = {
    async list(empresaId: number, query: ListLancamentosQuery) {
        const {page, limit, ...filtros} = query;
        const offset = (page - 1) * limit;
        const where = montarWhereLancamentos(empresaId, filtros);

        // Sequencial: na transação do tenant as consultas dividem a mesma conexão.
        const resumo = await resumir(where);
        const items = await buscarItens(where, limit, offset);

        return {
            items,
            meta: {total: resumo.total, page, limit, totais: resumo.totais},
        };
    },

    /** Só o resumo (quantidade e totais), com os mesmos filtros da lista. */
    async resumo(empresaId: number, filtros: FiltrosLancamentos) {
        return resumir(montarWhereLancamentos(empresaId, filtros));
    },

    /** Export sem paginação, com teto de LIMITE_EXPORT_LANCAMENTOS linhas. */
    async exportar(empresaId: number, filtros: FiltrosLancamentos) {
        const where = montarWhereLancamentos(empresaId, filtros);
        const resumo = await resumir(where);
        const items = await buscarItens(where, LIMITE_EXPORT_LANCAMENTOS, 0);
        return {
            items,
            meta: {
                total: resumo.total,
                exportados: items.length,
                truncado: resumo.total > items.length,
                limite: LIMITE_EXPORT_LANCAMENTOS,
            },
        };
    },

    /** `criadoPor`: usuário da sessão (null em chamada por token de API). */
    async create(empresaId: number, payload: CreateLancamentoBody, criadoPor: number | null = null) {
        await assertRefsDaEmpresa(empresaId, {
            conta_id: payload.conta_id,
            parceiro_id: payload.parceiro_id,
            plano_conta_id: payload.plano_conta_id,
            departamento_id: payload.departamento_id,
            centro_custo_id: payload.centro_custo_id,
        });
        const autoFill = await resolveDepartamentoCentroByParceiro(empresaId, payload.parceiro_id);
        const departamentoFinal = payload.departamento_id ?? autoFill.departamento_id;
        const centroCustoFinal = payload.centro_custo_id ?? autoFill.centro_custo_id;

        const [item] = await db
            .insert(lancamentosTable)
            .values(
                withEmpresaId(
                    {
                        tipo: payload.tipo,
                        vencimento: payload.vencimento,
                        competencia: payload.competencia ?? null,
                        conta_id: payload.conta_id ?? null,
                        parceiro_id: payload.parceiro_id ?? null,
                        descricao: payload.descricao ?? null,
                        tipo_documento: payload.tipo_documento ?? null,
                        numero_documento: payload.numero_documento ?? null,
                        observacao: payload.observacao ?? null,
                        valor: payload.valor,
                        desconto: payload.desconto ?? "0",
                        juros: payload.juros ?? "0",
                        retencao_ir: payload.retencao_ir ?? "0",
                        retencao_pis: payload.retencao_pis ?? "0",
                        retencao_cofins: payload.retencao_cofins ?? "0",
                        retencao_csll: payload.retencao_csll ?? "0",
                        retencao_inss: payload.retencao_inss ?? "0",
                        retencao_iss: payload.retencao_iss ?? "0",
                        // Quitação só pela conciliação/transferência (ver status-manual.ts).
                        status: statusNaCriacao(payload.status, payload.vencimento, hojeIsoLocal()),
                        plano_conta_id: payload.plano_conta_id ?? null,
                        departamento_id: departamentoFinal ?? null,
                        centro_custo_id: centroCustoFinal ?? null,
                        parcela_atual: payload.parcela_atual ?? 1,
                        total_parcelas: payload.total_parcelas ?? 1,
                        riscos: payload.riscos ?? [],
                        forma_pagamento: payload.forma_pagamento ?? null,
                        dados_pagamento: (payload.dados_pagamento ?? null) as typeof lancamentosTable.$inferInsert.dados_pagamento,
                        criado_por: criadoPor,
                    },
                    empresaId,
                ),
            )
            .returning();

        return item;
    },

    async getById(empresaId: number, id: number) {
        const [linha] = await db
            .select({item: lancamentosTable, conta_nome: contasBancariasTable.nome})
            .from(lancamentosTable)
            .leftJoin(
                contasBancariasTable,
                and(eq(lancamentosTable.conta_id, contasBancariasTable.id), tenantScope(contasBancariasTable, empresaId)),
            )
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id)))
            .limit(1);
        if (!linha) {
            throw new AppError(404, "NOT_FOUND", "Lançamento não encontrado.");
        }
        const {item, conta_nome} = linha;
        // Sequencial: na transação do tenant as consultas dividem a mesma conexão.
        const [vinculo] = await db
            .select({id: itensConciliacaoLancamentosTable.id})
            .from(itensConciliacaoLancamentosTable)
            .where(
                tenantWhere(itensConciliacaoLancamentosTable, empresaId, eq(itensConciliacaoLancamentosTable.lancamento_id, id)),
            )
            .limit(1);

        return {
            ...item,
            conta_nome: conta_nome ?? null,
            /** Vinculado a linha de extrato: a quitação é da conciliação (só leitura em Lançamentos). */
            tem_conciliacao: vinculo != null,
            valor: Number(item.valor ?? 0),
            ...retencoesParaHttp(item),
            riscos: Array.isArray(item.riscos) ? item.riscos : [],
        };
    },

    /**
     * O status do payload nunca é gravado direto: quem decide é `opcoes.status`
     * (ver status-manual.ts), e quitação nunca é gravada aqui. Ao mudar o status,
     * o UPDATE só passa se o título continua sem vínculo de conciliação (corrida
     * com um vincular entre a leitura e a escrita). O mesmo vale quando o PUT
     * muda valor/tipo/conta/desconto/juros/retenções (`conflitoSeVinculado`).
     */
    async update(
        empresaId: number,
        id: number,
        payload: UpdateLancamentoBody,
        opcoes: {status?: StatusManual; limparQuitacao?: boolean; conflitoSeVinculado?: string} = {},
    ) {
        await assertRefsDaEmpresa(empresaId, {
            conta_id: payload.conta_id,
            parceiro_id: payload.parceiro_id,
            plano_conta_id: payload.plano_conta_id,
            departamento_id: payload.departamento_id,
            centro_custo_id: payload.centro_custo_id,
        });
        const autoFill = await resolveDepartamentoCentroByParceiro(empresaId, payload.parceiro_id);
        const departamentoFinal = payload.departamento_id ?? autoFill.departamento_id;
        const centroCustoFinal = payload.centro_custo_id ?? autoFill.centro_custo_id;

        // Σ retenções <= valor, com o título mesclado (o update é parcial).
        if (payload.valor !== undefined || CAMPOS_RETENCAO.some((c) => payload[c] !== undefined)) {
            const [atual] = await db
                .select({
                    valor: lancamentosTable.valor,
                    retencao_ir: lancamentosTable.retencao_ir,
                    retencao_pis: lancamentosTable.retencao_pis,
                    retencao_cofins: lancamentosTable.retencao_cofins,
                    retencao_csll: lancamentosTable.retencao_csll,
                    retencao_inss: lancamentosTable.retencao_inss,
                    retencao_iss: lancamentosTable.retencao_iss,
                })
                .from(lancamentosTable)
                .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id)))
                .limit(1);
            if (!atual) {
                throw new AppError(404, "NOT_FOUND", "Lançamento não encontrado.");
            }
            const mesclado = {...atual};
            if (payload.valor !== undefined) mesclado.valor = payload.valor;
            for (const c of CAMPOS_RETENCAO) {
                if (payload[c] !== undefined) mesclado[c] = payload[c];
            }
            if (somaRetencoesCents(mesclado) > toCents(mesclado.valor)) {
                throw new AppError(400, "VALIDATION_ERROR", MSG_RETENCOES_ACIMA_DO_VALOR);
            }
        }

        const {empresa_id: _ignored, status: _statusPedido, ...safePayload} = payload as UpdateLancamentoBody & {
            empresa_id?: unknown;
        };
        const mudaStatus = opcoes.status !== undefined;
        const updateData = {
            ...safePayload,
            ...(mudaStatus ? {status: opcoes.status} : {}),
            // Reabrir quitação órfã (sem vínculo/transferência, do caminho antigo):
            // o título volta a ser só previsão e sai do saldo e dos relatórios de caixa.
            ...(opcoes.limparQuitacao ? {data_quitacao: null, valor_quitado: null} : {}),
            departamento_id: departamentoFinal ?? payload.departamento_id,
            centro_custo_id: centroCustoFinal ?? payload.centro_custo_id,
            updated_at: new Date(),
        };

        const semVinculo = sql`NOT EXISTS (SELECT 1 FROM itens_conciliacao_lancamentos icl WHERE icl.lancamento_id = ${lancamentosTable.id})`;
        const msgConflito = mudaStatus ? MSG_REABRIR_CONCILIADO : opcoes.conflitoSeVinculado;
        const [item] = await db
            .update(lancamentosTable)
            .set(updateData as typeof lancamentosTable.$inferInsert)
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id), msgConflito ? semVinculo : undefined))
            .returning();
        if (!item) {
            if (msgConflito) {
                const [existe] = await db
                    .select({id: lancamentosTable.id})
                    .from(lancamentosTable)
                    .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id)))
                    .limit(1);
                if (existe) throw new AppError(409, "CONFLICT", msgConflito);
            }
            throw new AppError(404, "NOT_FOUND", "Lançamento não encontrado.");
        }

        return item;
    },

    async remove(empresaId: number, id: number) {
        const [atual] = await db
            .select({
                id: lancamentosTable.id,
                status: lancamentosTable.status,
            })
            .from(lancamentosTable)
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id)))
            .limit(1);
        if (!atual) {
            throw new AppError(404, "NOT_FOUND", "Lançamento não encontrado.");
        }
        if (!STATUS_EXCLUIVEIS.has(atual.status)) {
            throw new AppError(
                409,
                "CONFLICT",
                "Só é possível excluir lançamentos com status Pendente ou Atrasado.",
            );
        }

        const [item] = await db
            .delete(lancamentosTable)
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id)))
            .returning({id: lancamentosTable.id});
        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Lançamento não encontrado.");
        }
        return {deleted: true};
    },
};