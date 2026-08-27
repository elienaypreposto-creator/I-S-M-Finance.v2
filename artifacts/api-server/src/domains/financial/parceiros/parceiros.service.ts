import {and, count, eq, ilike, not, sql} from "drizzle-orm";
import {db} from "@workspace/db";
import {lancamentosTable, parceirosTable, usuariosTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import type {CreateParceiroBody, ListParceirosQuery, UpdateParceiroBody} from "./schemas";

export const parceirosService = {
    async list(query: ListParceirosQuery) {
        const {page, limit, search, excluir_com_usuario} = query;
        const offset = (page - 1) * limit;

        const conditions = [];
        if (search) conditions.push(ilike(parceirosTable.nome, `%${search}%`));

        // Exclui parceiros que já estão vinculados a um usuário
        // WHERE nome NOT IN (SELECT nome FROM usuarios)
        if (excluir_com_usuario) {
            conditions.push(
                not(
                    sql`${parceirosTable.nome}
                    IN (SELECT nome FROM
                    ${usuariosTable}
                    )`,
                ),
            );
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db.select({count: count()}).from(parceirosTable).where(where);
        const items = await db
            .select()
            .from(parceirosTable)
            .where(where)
            .limit(limit)
            .offset(offset)
            .orderBy(parceirosTable.nome);

        return {
            items,
            meta: {total: totalResult.count, page, limit},
        };
    },

    async create(payload: CreateParceiroBody) {
        try {
            const [item] = await db
                .insert(parceirosTable)
                .values({
                    ...payload,
                    tipos: payload.tipos ?? [],
                    chaves_pix: payload.chaves_pix ?? [],
                    dados_bancarios: payload.dados_bancarios ?? [],
                })
                .returning();

            return item;
        } catch (error: unknown) {
            const root = (
                (error as { cause?: unknown }).cause ?? error
            ) as { code?: string; constraint?: string; message?: string };

            const isUniqueViolation =
                root.code === "23505" ||
                root.constraint?.includes("cpf_cnpj") ||
                (root.message ?? "").includes("parceiros_cpf_cnpj_unique_idx");

            if (isUniqueViolation) {
                throw new AppError(
                    422,
                    "CPF_CNPJ_JA_CADASTRADO",
                    "Este CPF/CNPJ já está cadastrado no sistema para outro cliente ou fornecedor.",
                );
            }
            throw error;
        }
    },

    async getById(id: number) {
        const [item] = await db.select().from(parceirosTable).where(eq(parceirosTable.id, id)).limit(1);
        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Parceiro não encontrado.");
        }

        return item;
    },

    async update(id: number, payload: UpdateParceiroBody) {
        const LIFECYCLE_KEYS = new Set(["status", "ativo", "bloqueado"]);
        const isLifecycleOnly = Object.keys(payload).every((k) => LIFECYCLE_KEYS.has(k));

        if (!isLifecycleOnly) {
            const [{total}] = await db
                .select({total: count()})
                .from(lancamentosTable)
                .where(eq(lancamentosTable.parceiro_id, id));

            if (Number(total) > 0) {
                throw new AppError(
                    409,
                    "CONFLICT",
                    "Não é possível editar este cadastro, pois já existem lançamentos ou conciliações registrados utilizando-o.",
                );
            }
        }

        const [item] = await db
            .update(parceirosTable)
            .set({...payload, updated_at: new Date()})
            .where(eq(parceirosTable.id, id))
            .returning();

        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Parceiro não encontrado.");
        }

        return item;
    },

    async remove(id: number) {
        const [{total}] = await db
            .select({total: count()})
            .from(lancamentosTable)
            .where(eq(lancamentosTable.parceiro_id, id));

        if (Number(total) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível excluir este parceiro, pois existem lançamentos vinculados a ele.",
            );
        }

        await db.delete(parceirosTable).where(eq(parceirosTable.id, id));
        return {deleted: true};
    },
};