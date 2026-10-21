import {count, desc, eq, sql, type SQL} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    contasBancariasTable,
    centrosCustosTable,
    departamentosTable,
    lancamentosTable,
    parceirosTable,
    planoContasTable,
} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {tenantWhere, withEmpresaId} from "../../../lib/tenant-scope";

import {assertRefsDaEmpresa} from "../../../lib/tenant-refs-guard";
import {
    LIMITE_EXPORT_LANCAMENTOS,
    type CreateLancamentoBody,
    type FiltrosLancamentos,
    type ListLancamentosQuery,
    type UpdateLancamentoBody,
} from "./schemas";
import {montarWhereLancamentos} from "./lancamentos.filtros";
import {statusAbertoPorVencimento} from "../../../utils/conciliacao-vincular";
import {hojeIsoLocal} from "../../../utils/date-civil";

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

/** Valor líquido exibido na lista: max(valor - desconto + juros, 0). */
const valorLiquidoSql = sql`greatest(${lancamentosTable.valor} - coalesce(${lancamentosTable.desconto}, 0) + coalesce(${lancamentosTable.juros}, 0), 0)`;

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
            plano_conta_nome: formatPlanoContaPath(item.plano_conta_categoria, item.plano_conta_subcategoria),
            valor: Math.max(valorBruto - desconto + juros, 0),
            valor_bruto: valorBruto,
            desconto,
            juros,
        };
    });
}

/** Quantidade e totais líquidos por tipo (resumo da linha de filtros). */
async function resumir(where: SQL) {
    const linhas = await db
        .select({
            tipo: lancamentosTable.tipo,
            quantidade: count(),
            total: sql<string>`coalesce(sum(${valorLiquidoSql}), 0)`,
        })
        .from(lancamentosTable)
        .leftJoin(parceirosTable, eq(lancamentosTable.parceiro_id, parceirosTable.id))
        .where(where)
        .groupBy(lancamentosTable.tipo);

    const totalDo = (t: "CR" | "CP") => Number(linhas.find((l) => l.tipo === t)?.total ?? 0);
    return {
        total: linhas.reduce((acc, l) => acc + Number(l.quantidade), 0),
        totais: {receber: totalDo("CR"), pagar: totalDo("CP")},
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

    async create(empresaId: number, payload: CreateLancamentoBody) {
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
                        status:
                            payload.status === "pago" ||
                            payload.status === "recebido" ||
                            payload.status === "pago_parcial" ||
                            payload.status === "cancelado"
                                ? payload.status
                                : statusAbertoPorVencimento(payload.vencimento, hojeIsoLocal()),
                        plano_conta_id: payload.plano_conta_id ?? null,
                        departamento_id: departamentoFinal ?? null,
                        centro_custo_id: centroCustoFinal ?? null,
                        parcela_atual: payload.parcela_atual ?? 1,
                        total_parcelas: payload.total_parcelas ?? 1,
                        riscos: payload.riscos ?? [],
                        forma_pagamento: payload.forma_pagamento ?? null,
                        dados_pagamento: (payload.dados_pagamento ?? null) as typeof lancamentosTable.$inferInsert.dados_pagamento,
                    },
                    empresaId,
                ),
            )
            .returning();

        return item;
    },

    async getById(empresaId: number, id: number) {
        const [item] = await db
            .select()
            .from(lancamentosTable)
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id)))
            .limit(1);
        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Lançamento não encontrado.");
        }

        return {
            ...item,
            valor: Number(item.valor ?? 0),
            riscos: Array.isArray(item.riscos) ? item.riscos : [],
        };
    },

    async update(empresaId: number, id: number, payload: UpdateLancamentoBody) {
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

        const {empresa_id: _ignored, ...safePayload} = payload as UpdateLancamentoBody & { empresa_id?: unknown };
        const updateData = {
            ...safePayload,
            departamento_id: departamentoFinal ?? payload.departamento_id,
            centro_custo_id: centroCustoFinal ?? payload.centro_custo_id,
            updated_at: new Date(),
        };

        const [item] = await db
            .update(lancamentosTable)
            .set(updateData as typeof lancamentosTable.$inferInsert)
            .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.id, id)))
            .returning();
        if (!item) {
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