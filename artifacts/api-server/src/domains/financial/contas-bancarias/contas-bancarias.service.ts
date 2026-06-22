import {count, eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {contasBancariasTable, extratosTable, lancamentosTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import type {CreateContaBancariaBody, UpdateContaBancariaBody} from "./schemas";

export const contasBancariasService = {
    async list() {
        const rows = await db.select().from(contasBancariasTable).orderBy(contasBancariasTable.nome);
        return rows.map((row) => ({
            ...row,
            saldo_atual: row.saldo_inicial ?? "0",
        }));
    },

    async create(payload: CreateContaBancariaBody) {
        const [item] = await db
            .insert(contasBancariasTable)
            .values({
                tipo: payload.tipo,
                banco: payload.banco ?? null,
                agencia: payload.agencia ?? null,
                digito_agencia: payload.digito_agencia ?? null,
                conta: payload.conta ?? null,
                digito_conta: payload.digito_conta ?? null,
                nome: payload.nome,
                empresa: payload.empresa ?? null,
                saldo_inicial: payload.saldo_inicial ?? "0",
                data_inicio: payload.data_inicio,
                status: payload.status ?? "ativo",
                cor: payload.cor ?? "#3BA8DC",
            })
            .returning();

        return {
            ...item,
            saldo_atual: item.saldo_inicial ?? "0",
        };
    },

    async update(id: number, payload: UpdateContaBancariaBody) {
        const [[{lancamentos}], [{extratos}]] = await Promise.all([
            db
                .select({lancamentos: count()})
                .from(lancamentosTable)
                .where(eq(lancamentosTable.conta_id, id)),
            db
                .select({extratos: count()})
                .from(extratosTable)
                .where(eq(extratosTable.conta_id, id)),
        ]);

        if (Number(lancamentos) > 0 || Number(extratos) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível editar este cadastro, pois já existem lançamentos ou conciliações registrados utilizando-o.",
            );
        }

        const [item] = await db
            .update(contasBancariasTable)
            .set({...payload, updated_at: new Date()})
            .where(eq(contasBancariasTable.id, id))
            .returning();

        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Conta bancária não encontrada.");
        }

        return {
            ...item,
            saldo_atual: item.saldo_inicial ?? "0",
        };
    },

    async remove(id: number) {
        const [[{lancamentos}], [{extratos}]] = await Promise.all([
            db
                .select({lancamentos: count()})
                .from(lancamentosTable)
                .where(eq(lancamentosTable.conta_id, id)),
            db
                .select({extratos: count()})
                .from(extratosTable)
                .where(eq(extratosTable.conta_id, id)),
        ]);

        if (Number(lancamentos) > 0 || Number(extratos) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível excluir esta conta bancária, pois existem lançamentos ou extratos vinculados a ela.",
            );
        }

        await db.delete(contasBancariasTable).where(eq(contasBancariasTable.id, id));
        return {deleted: true};
    },
};
