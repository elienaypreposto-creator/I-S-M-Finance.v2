import {count, eq, lte} from "drizzle-orm";
import {db} from "@workspace/db";
import {contasBancariasTable, extratosTable, lancamentosTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {centsToDecimalString, fromCents, toCents} from "../../../utils/money";
import {saldoInicialValeNaData, sqlMovimentosNoSaldoDaConta} from "../../../utils/lancamentos-conta";
import {diaAnterior} from "../../../utils/extrato-conta";
import {tenantScope, tenantWhere, withEmpresaId} from "../../../lib/tenant-scope";
import {TIPOS_CONTA_BANCARIA, type CreateContaBancariaBody, type UpdateContaBancariaBody} from "./schemas";
import {validarCadastroConta} from "./contas-bancarias.validacoes";

/**
 * Saldo da conta no FECHAMENTO de `dataRef` (sem data: saldo atual).
 * Com `aberturaDoDia`: saldo na ABERTURA de `dataRef` (movimentos até a véspera, mais
 * o saldo_inicial se `dataRef` já é a data de início), o "saldo anterior" do extrato.
 */
async function calcularSaldoCents(
    empresaId: number,
    contaId: number,
    dataRef?: string,
    {aberturaDoDia = false}: {aberturaDoDia?: boolean} = {},
): Promise<{
    /** saldo_inicial cadastrado na conta. */
    saldoInicialCents: number;
    /** false = data anterior à data de início (saldo desconhecido). */
    saldoInicialVale: boolean;
    /** Parte do saldo_inicial que vale na data (0 antes da data de início). */
    saldoAberturaCents: number;
    creditosCents: number;
    debitosCents: number;
    saldoCents: number;
}> {
    const [conta] = await db
        .select()
        .from(contasBancariasTable)
        .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, contaId)))
        .limit(1);

    if (!conta) {
        throw new AppError(404, "NOT_FOUND", "Conta bancária não encontrada.");
    }

    const saldoInicialCents = toCents(conta.saldo_inicial);
    // Antes da data de início o sistema não sabe o saldo: o saldo_inicial entra no
    // próprio dia de início (saldo atual, sem data, sempre o leva).
    const saldoInicialVale = saldoInicialValeNaData(dataRef, conta.data_inicio);
    const saldoAberturaCents = saldoInicialVale ? saldoInicialCents : 0;
    // Mesma regra do extrato da conta em Relatórios (utils/lancamentos-conta.ts).
    const conditions = sqlMovimentosNoSaldoDaConta(contaId, conta.data_inicio);
    if (dataRef) {
        conditions.push(lte(lancamentosTable.data_quitacao, aberturaDoDia ? diaAnterior(dataRef) : dataRef));
    }

    const rows = await db
        .select({
            tipo: lancamentosTable.tipo,
            valor_quitado: lancamentosTable.valor_quitado,
        })
        .from(lancamentosTable)
        .where(tenantWhere(lancamentosTable, empresaId, ...conditions));

    let creditosCents = 0;
    let debitosCents = 0;
    for (const row of rows) {
        const q = toCents(row.valor_quitado);
        if (row.tipo === "CR") creditosCents += q;
        else debitosCents += q;
    }

    // saldo = inicial (se já vale na data) + CR quitado − CP quitado
    const saldoCents = saldoAberturaCents + creditosCents - debitosCents;
    return {saldoInicialCents, saldoInicialVale, saldoAberturaCents, creditosCents, debitosCents, saldoCents};
}

export const contasBancariasService = {
    async list(empresaId: number) {
        const rows = await db
            .select()
            .from(contasBancariasTable)
            .where(tenantScope(contasBancariasTable, empresaId))
            .orderBy(contasBancariasTable.nome);
        const withSaldo = await Promise.all(
            rows.map(async (row) => {
                const {saldoCents} = await calcularSaldoCents(empresaId, row.id);
                return {
                    ...row,
                    saldo_atual: centsToDecimalString(saldoCents),
                };
            }),
        );
        return withSaldo;
    },

    async create(empresaId: number, payload: CreateContaBancariaBody) {
        await validarCadastroConta(empresaId, payload);
        const [item] = await db
            .insert(contasBancariasTable)
            .values(
                withEmpresaId(
                    {
                        tipo: payload.tipo,
                        banco: payload.banco ?? null,
                        agencia: payload.agencia ?? null,
                        digito_agencia: payload.digito_agencia ?? null,
                        conta: payload.conta ?? null,
                        digito_conta: payload.digito_conta ?? null,
                        nome: payload.nome,
                        titular: payload.titular ?? payload.empresa ?? null,
                        saldo_inicial: payload.saldo_inicial ?? "0",
                        data_inicio: payload.data_inicio,
                        status: payload.status ?? "ativo",
                        cor: payload.cor ?? "#3BA8DC",
                    },
                    empresaId,
                ),
            )
            .returning();

        return {
            ...item,
            saldo_atual: item.saldo_inicial ?? "0",
        };
    },

    async update(empresaId: number, id: number, payload: UpdateContaBancariaBody) {
        const [[{lancamentos}], [{extratos}]] = await Promise.all([
            db
                .select({lancamentos: count()})
                .from(lancamentosTable)
                .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.conta_id, id))),
            db
                .select({extratos: count()})
                .from(extratosTable)
                .where(tenantWhere(extratosTable, empresaId, eq(extratosTable.conta_id, id))),
        ]);

        if (Number(lancamentos) > 0 || Number(extratos) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível editar este cadastro, pois já existem lançamentos ou conciliações registrados utilizando-o.",
            );
        }

        if (payload.tipo !== undefined && !(TIPOS_CONTA_BANCARIA as readonly string[]).includes(payload.tipo)) {
            const [atual] = await db
                .select({tipo: contasBancariasTable.tipo})
                .from(contasBancariasTable)
                .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, id)));
            if (atual && atual.tipo !== payload.tipo) {
                throw new AppError(400, "VALIDATION_ERROR", `Tipo de conta inválido. Use: ${TIPOS_CONTA_BANCARIA.join(", ")}.`);
            }
        }

        await validarCadastroConta(empresaId, payload, id);

        const {empresa, titular, ...rest} = payload;
        const [item] = await db
            .update(contasBancariasTable)
            .set({
                ...rest,
                ...(titular !== undefined || empresa !== undefined
                    ? {titular: titular ?? empresa ?? null}
                    : {}),
                updated_at: new Date(),
            })
            .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, id)))
            .returning();

        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Conta bancária não encontrada.");
        }

        return {
            ...item,
            saldo_atual: item.saldo_inicial ?? "0",
        };
    },

    async remove(empresaId: number, id: number) {
        const [[{lancamentos}], [{extratos}]] = await Promise.all([
            db
                .select({lancamentos: count()})
                .from(lancamentosTable)
                .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.conta_id, id))),
            db
                .select({extratos: count()})
                .from(extratosTable)
                .where(tenantWhere(extratosTable, empresaId, eq(extratosTable.conta_id, id))),
        ]);

        if (Number(lancamentos) > 0 || Number(extratos) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível excluir esta conta bancária, pois existem lançamentos ou extratos vinculados a ela.",
            );
        }

        const [item] = await db
            .delete(contasBancariasTable)
            .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, id)))
            .returning({id: contasBancariasTable.id});
        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Conta bancária não encontrada.");
        }
        return {deleted: true};
    },

    /**
     * Saldo posicional na data (DEF-03). Regra D-1: o saldo confiável é o do fechamento
     * do dia informado (tipicamente D-1), nunca "agora" sem data.
     * Com `aberturaDoDia`, o saldo na ABERTURA do dia (antes dos movimentos dele): é o
     * que se compara com o "saldo anterior" de um extrato que começa em `data`.
     */
    async saldoNaData(empresaId: number, id: number, data: string, {aberturaDoDia = false}: {aberturaDoDia?: boolean} = {}) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            throw new AppError(400, "VALIDATION_ERROR", "Parâmetro data inválido. Use YYYY-MM-DD.");
        }
        const calc = await calcularSaldoCents(empresaId, id, data, {aberturaDoDia});
        const [conta] = await db
            .select({
                id: contasBancariasTable.id,
                nome: contasBancariasTable.nome,
                saldo_inicial: contasBancariasTable.saldo_inicial,
                data_inicio: contasBancariasTable.data_inicio,
            })
            .from(contasBancariasTable)
            .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, id)))
            .limit(1);

        return {
            conta_id: id,
            conta_nome: conta?.nome,
            data,
            data_inicio: conta?.data_inicio,
            saldo_inicial: fromCents(calc.saldoInicialCents),
            /**
             * Data anterior à data de início: o sistema não conhece o saldo da conta
             * nesse dia e o saldo_inicial não entra (saldo = só os movimentos).
             */
            antes_do_inicio: !calc.saldoInicialVale,
            creditos_quitados: fromCents(calc.creditosCents),
            debitos_quitados: fromCents(calc.debitosCents),
            saldo: fromCents(calc.saldoCents),
            saldo_decimal: centsToDecimalString(calc.saldoCents),
        };
    },
};