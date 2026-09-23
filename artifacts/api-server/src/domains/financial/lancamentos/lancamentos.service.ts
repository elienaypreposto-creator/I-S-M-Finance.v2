import {count, eq, gte, ilike, lte} from "drizzle-orm";
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
import type {CreateLancamentoBody, ListLancamentosQuery, UpdateLancamentoBody} from "./schemas";
import {statusAbertoPorVencimento} from "../../../utils/conciliacao-vincular";
import {hojeIsoLocal} from "../../../utils/date-civil";

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

export const lancamentosService = {
    async list(empresaId: number, query: ListLancamentosQuery) {
        const {page, limit, tipo, status, conta_id, parceiro_id, data_inicio, data_fim, search} = query;
        const offset = (page - 1) * limit;

        const where = tenantWhere(
            lancamentosTable,
            empresaId,
            tipo ? eq(lancamentosTable.tipo, tipo) : undefined,
            status ? eq(lancamentosTable.status, status) : undefined,
            conta_id ? eq(lancamentosTable.conta_id, conta_id) : undefined,
            parceiro_id ? eq(lancamentosTable.parceiro_id, parceiro_id) : undefined,
            data_inicio ? gte(lancamentosTable.vencimento, data_inicio) : undefined,
            data_fim ? lte(lancamentosTable.vencimento, data_fim) : undefined,
            search ? ilike(lancamentosTable.descricao, `%${search}%`) : undefined,
        );

        const [totalResult] = await db.select({count: count()}).from(lancamentosTable).where(where);

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
                valor: lancamentosTable.valor,
                // Ajustam o valor líquido exibido na tabela (ver map abaixo) -
                // sem selecioná-los aqui, a listagem sempre mostrava o valor
                // de face puro, mesmo depois de editar Desconto/Juros no modal.
                desconto: lancamentosTable.desconto,
                juros: lancamentosTable.juros,
                status: lancamentosTable.status,
                plano_conta_id: lancamentosTable.plano_conta_id,
                plano_conta_nome: planoContasTable.subcategoria,
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
            .orderBy(lancamentosTable.vencimento)
            .limit(limit)
            .offset(offset);

        return {
            items: items.map((item) => {
                const valorBruto = Number(item.valor ?? 0);
                const desconto = Number(item.desconto ?? 0);
                const juros = Number(item.juros ?? 0);
                return {
                    ...item,
                    // Valor líquido (Bruto - Desconto + Juros) - é o que a
                    // coluna "R$ Valor" da tabela de Lançamentos exibe, então
                    // precisa refletir qualquer edição feita no modal.
                    valor: Math.max(valorBruto - desconto + juros, 0),
                    valor_bruto: valorBruto,
                    desconto,
                    juros,
                };
            }),
            meta: {total: totalResult.count, page, limit},
        };
    },

    async create(empresaId: number, payload: CreateLancamentoBody) {
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
        const autoFill = await resolveDepartamentoCentroByParceiro(empresaId, payload.parceiro_id);
        const departamentoFinal = payload.departamento_id ?? autoFill.departamento_id;
        const centroCustoFinal = payload.centro_custo_id ?? autoFill.centro_custo_id;

        const {empresa_id: _ignored, ...safePayload} = payload as UpdateLancamentoBody & {empresa_id?: unknown};
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
