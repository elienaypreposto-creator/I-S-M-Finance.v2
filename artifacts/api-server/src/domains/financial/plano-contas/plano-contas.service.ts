import {count, eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {lancamentosTable, metasTable, planoContasTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {tenantScope, tenantWhere, withEmpresaId} from "../../../lib/tenant-scope";
import type {CreatePlanoContaBody, UpdatePlanoContaBody} from "./schemas";

export const planoContasService = {
    async list(empresaId: number) {
        return db
            .select()
            .from(planoContasTable)
            .where(tenantScope(planoContasTable, empresaId))
            .orderBy(planoContasTable.tipo, planoContasTable.categoria);
    },

    async create(empresaId: number, payload: CreatePlanoContaBody) {
        const [item] = await db
            .insert(planoContasTable)
            .values(
                withEmpresaId(
                    {
                        tipo: payload.tipo,
                        categoria: payload.categoria,
                        subcategoria: payload.subcategoria ?? null,
                        codigo: payload.codigo ?? null,
                        grupo_dre: payload.grupo_dre ?? null,
                        ativo: payload.ativo ?? true,
                    },
                    empresaId,
                ),
            )
            .returning();

        return item;
    },

    async update(empresaId: number, id: number, payload: UpdatePlanoContaBody) {
        const [atual] = await db
            .select()
            .from(planoContasTable)
            .where(tenantWhere(planoContasTable, empresaId, eq(planoContasTable.id, id)))
            .limit(1);
        if (!atual) {
            throw new AppError(404, "NOT_FOUND", "Plano de contas não encontrado.");
        }

        // A linha da DRE é só classificação de relatório: pode mudar com a conta em uso.
        // Tipo, categoria, subcategoria, código e ativo continuam travados.
        const normalizar = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v ?? null);
        const mudaCadastro = (Object.keys(payload) as (keyof UpdatePlanoContaBody)[]).some(
            (campo) =>
                campo !== "grupo_dre" &&
                payload[campo] !== undefined &&
                normalizar(payload[campo]) !== normalizar(atual[campo]),
        );

        if (mudaCadastro) {
            const [[{lancamentos}], [{metas}]] = await Promise.all([
                db
                    .select({lancamentos: count()})
                    .from(lancamentosTable)
                    .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.plano_conta_id, id))),
                db
                    .select({metas: count()})
                    .from(metasTable)
                    .where(tenantWhere(metasTable, empresaId, eq(metasTable.plano_conta_id, id))),
            ]);

            if (Number(lancamentos) > 0 || Number(metas) > 0) {
                throw new AppError(
                    409,
                    "CONFLICT",
                    "Não é possível editar este cadastro, pois já existem lançamentos ou conciliações registrados utilizando-o. Só a linha da DRE pode ser alterada.",
                );
            }
        }

        const [item] = await db
            .update(planoContasTable)
            .set({...payload, updated_at: new Date()})
            .where(tenantWhere(planoContasTable, empresaId, eq(planoContasTable.id, id)))
            .returning();

        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Plano de contas não encontrado.");
        }

        return item;
    },

    async remove(empresaId: number, id: number) {
        const [[{lancamentos}], [{metas}]] = await Promise.all([
            db
                .select({lancamentos: count()})
                .from(lancamentosTable)
                .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.plano_conta_id, id))),
            db
                .select({metas: count()})
                .from(metasTable)
                .where(tenantWhere(metasTable, empresaId, eq(metasTable.plano_conta_id, id))),
        ]);

        if (Number(lancamentos) > 0 || Number(metas) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível excluir esta conta/categoria, pois existem lançamentos ou metas orçamentárias vinculadas a ela.",
            );
        }

        const [item] = await db
            .delete(planoContasTable)
            .where(tenantWhere(planoContasTable, empresaId, eq(planoContasTable.id, id)))
            .returning({id: planoContasTable.id});
        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Plano de contas não encontrado.");
        }
        return {deleted: true};
    },
};
