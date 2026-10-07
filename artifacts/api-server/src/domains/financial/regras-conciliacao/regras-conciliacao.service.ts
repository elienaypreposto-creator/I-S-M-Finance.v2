import {desc, eq, isNull, or} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    centrosCustosTable,
    contasBancariasTable,
    departamentosTable,
    parceirosTable,
    planoContasTable,
    regrasConciliacaoTable,
} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {tenantWhere, withEmpresaId} from "../../../lib/tenant-scope";
import type {
    CreateRegraConciliacaoBody,
    ListRegrasConciliacaoQuery,
    UpdateRegraConciliacaoBody,
} from "./schemas";

export const regrasConciliacaoService = {
    async list(empresaId: number, query: ListRegrasConciliacaoQuery) {
        const where = tenantWhere(
            regrasConciliacaoTable,
            empresaId,
            query.conta_id
                ? or(eq(regrasConciliacaoTable.conta_id, query.conta_id), isNull(regrasConciliacaoTable.conta_id))
                : undefined,
            query.natureza ? eq(regrasConciliacaoTable.natureza, query.natureza) : undefined,
            query.ativo !== undefined ? eq(regrasConciliacaoTable.ativo, query.ativo) : undefined,
        );

        return db
            .select({
                id: regrasConciliacaoTable.id,
                conta_id: regrasConciliacaoTable.conta_id,
                conta_nome: contasBancariasTable.nome,
                texto_gatilho: regrasConciliacaoTable.texto_gatilho,
                tipo_match: regrasConciliacaoTable.tipo_match,
                natureza: regrasConciliacaoTable.natureza,
                plano_conta_id: regrasConciliacaoTable.plano_conta_id,
                plano_conta_categoria: planoContasTable.categoria,
                plano_conta_subcategoria: planoContasTable.subcategoria,
                parceiro_id: regrasConciliacaoTable.parceiro_id,
                parceiro_nome: parceirosTable.nome,
                departamento_id: regrasConciliacaoTable.departamento_id,
                departamento_nome: departamentosTable.nome,
                centro_custo_id: regrasConciliacaoTable.centro_custo_id,
                centro_custo_nome: centrosCustosTable.nome,
                forma_pagamento: regrasConciliacaoTable.forma_pagamento,
                criar_lancamento_automatico: regrasConciliacaoTable.criar_lancamento_automatico,
                prioridade: regrasConciliacaoTable.prioridade,
                ativo: regrasConciliacaoTable.ativo,
                created_at: regrasConciliacaoTable.created_at,
            })
            .from(regrasConciliacaoTable)
            .leftJoin(contasBancariasTable, eq(regrasConciliacaoTable.conta_id, contasBancariasTable.id))
            .leftJoin(planoContasTable, eq(regrasConciliacaoTable.plano_conta_id, planoContasTable.id))
            .leftJoin(parceirosTable, eq(regrasConciliacaoTable.parceiro_id, parceirosTable.id))
            .leftJoin(departamentosTable, eq(regrasConciliacaoTable.departamento_id, departamentosTable.id))
            .leftJoin(centrosCustosTable, eq(regrasConciliacaoTable.centro_custo_id, centrosCustosTable.id))
            .where(where)
            .orderBy(desc(regrasConciliacaoTable.prioridade), desc(regrasConciliacaoTable.created_at));
    },

    async create(empresaId: number, payload: CreateRegraConciliacaoBody) {
        const [item] = await db
            .insert(regrasConciliacaoTable)
            .values(
                withEmpresaId(
                    {
                        conta_id: payload.conta_id ?? null,
                        texto_gatilho: payload.texto_gatilho,
                        tipo_match: payload.tipo_match,
                        natureza: payload.natureza,
                        plano_conta_id: payload.plano_conta_id ?? null,
                        parceiro_id: payload.parceiro_id ?? null,
                        departamento_id: payload.departamento_id ?? null,
                        centro_custo_id: payload.centro_custo_id ?? null,
                        forma_pagamento: payload.forma_pagamento ?? null,
                        criar_lancamento_automatico: payload.criar_lancamento_automatico,
                        prioridade: payload.prioridade,
                        ativo: payload.ativo,
                    },
                    empresaId,
                ),
            )
            .returning();
        return item;
    },

    async update(empresaId: number, id: number, payload: UpdateRegraConciliacaoBody) {
        const [item] = await db
            .update(regrasConciliacaoTable)
            .set({
                conta_id: payload.conta_id ?? null,
                texto_gatilho: payload.texto_gatilho,
                tipo_match: payload.tipo_match,
                natureza: payload.natureza,
                plano_conta_id: payload.plano_conta_id ?? null,
                parceiro_id: payload.parceiro_id ?? null,
                departamento_id: payload.departamento_id ?? null,
                centro_custo_id: payload.centro_custo_id ?? null,
                forma_pagamento: payload.forma_pagamento ?? null,
                criar_lancamento_automatico: payload.criar_lancamento_automatico,
                prioridade: payload.prioridade,
                ativo: payload.ativo,
                updated_at: new Date(),
            })
            .where(tenantWhere(regrasConciliacaoTable, empresaId, eq(regrasConciliacaoTable.id, id)))
            .returning();

        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Regra de conciliação não encontrada.");
        }
        return item;
    },

    async remove(empresaId: number, id: number) {
        const [item] = await db
            .delete(regrasConciliacaoTable)
            .where(tenantWhere(regrasConciliacaoTable, empresaId, eq(regrasConciliacaoTable.id, id)))
            .returning({id: regrasConciliacaoTable.id});
        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Regra de conciliação não encontrada.");
        }
        return {deleted: true};
    },

    async listarAtivasParaMatch(empresaId: number, contaId: number) {
        return db
            .select()
            .from(regrasConciliacaoTable)
            .where(
                tenantWhere(
                    regrasConciliacaoTable,
                    empresaId,
                    eq(regrasConciliacaoTable.ativo, true),
                    or(eq(regrasConciliacaoTable.conta_id, contaId), isNull(regrasConciliacaoTable.conta_id)),
                ),
            )
            .orderBy(desc(regrasConciliacaoTable.prioridade), desc(regrasConciliacaoTable.created_at));
    },
};
