import {and, count, eq, gte, lte, sql} from "drizzle-orm";
import {db} from "@workspace/db";
import {contasBancariasTable, extratosTable, lancamentosTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {centsToDecimalString, fromCents, toCents} from "../../../utils/money";
import type {CreateContaBancariaBody, UpdateContaBancariaBody} from "./schemas";

async function calcularSaldoCents(contaId: number, dataRef?: string): Promise<{
    saldoInicialCents: number;
    creditosCents: number;
    debitosCents: number;
    saldoCents: number;
}> {
    const [conta] = await db
        .select()
        .from(contasBancariasTable)
        .where(eq(contasBancariasTable.id, contaId))
        .limit(1);

    if (!conta) {
        throw new AppError(404, "NOT_FOUND", "Conta bancária não encontrada.");
    }

    const saldoInicialCents = toCents(conta.saldo_inicial);
    const conditions = [
        eq(lancamentosTable.conta_id, contaId),
        gte(lancamentosTable.data_quitacao, conta.data_inicio),
        sql`${lancamentosTable.status}
        IN ('pago', 'recebido', 'pago_parcial')`,
    ];
    if (dataRef) {
        conditions.push(lte(lancamentosTable.data_quitacao, dataRef));
    }

    const rows = await db
        .select({
            tipo: lancamentosTable.tipo,
            valor_quitado: lancamentosTable.valor_quitado,
        })
        .from(lancamentosTable)
        .where(and(...conditions));

    let creditosCents = 0;
    let debitosCents = 0;
    for (const row of rows) {
        const q = toCents(row.valor_quitado);
        if (row.tipo === "CR") creditosCents += q;
        else debitosCents += q;
    }

    // saldo = inicial + CR quitado − CP quitado
    const saldoCents = saldoInicialCents + creditosCents - debitosCents;
    return {saldoInicialCents, creditosCents, debitosCents, saldoCents};
}

export const contasBancariasService = {
    async list() {
        const rows = await db.select().from(contasBancariasTable).orderBy(contasBancariasTable.nome);
        const withSaldo = await Promise.all(
            rows.map(async (row) => {
                const {saldoCents} = await calcularSaldoCents(row.id);
                return {
                    ...row,
                    saldo_atual: centsToDecimalString(saldoCents),
                };
            }),
        );
        return withSaldo;
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

    /**
     * Saldo posicional na data (DEF-03). Regra D-1: o saldo confiável é o do fechamento
     * do dia informado (tipicamente D-1), nunca "agora" sem data.
     */
    async saldoNaData(id: number, data: string) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            throw new AppError(400, "VALIDATION_ERROR", "Parâmetro data inválido. Use YYYY-MM-DD.");
        }
        const calc = await calcularSaldoCents(id, data);
        const [conta] = await db
            .select({
                id: contasBancariasTable.id,
                nome: contasBancariasTable.nome,
                saldo_inicial: contasBancariasTable.saldo_inicial,
                data_inicio: contasBancariasTable.data_inicio,
            })
            .from(contasBancariasTable)
            .where(eq(contasBancariasTable.id, id))
            .limit(1);

        return {
            conta_id: id,
            conta_nome: conta?.nome,
            data,
            data_inicio: conta?.data_inicio,
            saldo_inicial: fromCents(calc.saldoInicialCents),
            creditos_quitados: fromCents(calc.creditosCents),
            debitos_quitados: fromCents(calc.debitosCents),
            saldo: fromCents(calc.saldoCents),
            saldo_decimal: centsToDecimalString(calc.saldoCents),
        };
    },
};
