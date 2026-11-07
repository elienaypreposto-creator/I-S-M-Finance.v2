import {eq, sql} from "drizzle-orm";
import {db} from "@workspace/db";
import {contasBancariasTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {chaveContaBancaria, dataInicioNoFuturo, encontrarContaDuplicada, type DadosConta} from "./contas-bancarias.regras";
import {tenantScope, tenantWhere} from "../../../lib/tenant-scope";

/** Namespace (int4) do advisory lock da checagem de conta duplicada; o 2º argumento é a empresa. */
export const LOCK_CONTA_DUPLICADA = 0x43424450; // "CBDP"

/**
 * Valida criação/edição. Na edição só confere o que muda: uma conta antiga já duplicada
 * (ou com data futura) continua editável enquanto banco/agência/conta e data não mudarem.
 */
export async function validarCadastroConta(
    empresaId: number,
    payload: DadosConta & {data_inicio?: string | null},
    idAtual?: number,
): Promise<void> {
    let atual: (DadosConta & {data_inicio: string | null}) | undefined;
    if (idAtual !== undefined) {
        [atual] = await db
            .select({
                id: contasBancariasTable.id,
                banco: contasBancariasTable.banco,
                agencia: contasBancariasTable.agencia,
                conta: contasBancariasTable.conta,
                data_inicio: contasBancariasTable.data_inicio,
            })
            .from(contasBancariasTable)
            .where(tenantWhere(contasBancariasTable, empresaId, eq(contasBancariasTable.id, idAtual)))
            .limit(1);
        if (!atual) return; // o update devolve 404
    }

    if (payload.data_inicio !== undefined && payload.data_inicio !== atual?.data_inicio && dataInicioNoFuturo(payload.data_inicio)) {
        throw new AppError(400, "DATA_INICIO_FUTURA", "A data de início dos lançamentos não pode ser no futuro.");
    }

    const candidata: DadosConta = {
        banco: payload.banco !== undefined ? payload.banco : atual?.banco,
        agencia: payload.agencia !== undefined ? payload.agencia : atual?.agencia,
        conta: payload.conta !== undefined ? payload.conta : atual?.conta,
    };
    const chave = chaveContaBancaria(candidata);
    if (!chave || (atual && chaveContaBancaria(atual) === chave)) return;

    // Fecha a corrida de dois cadastros simultâneos da mesma conta: a checagem e o
    // INSERT/UPDATE rodam na transação da request (withTenantTxMiddleware) e este lock
    // por empresa só sai no COMMIT/ROLLBACK. Quem chega depois espera e, em READ
    // COMMITTED, o SELECT abaixo já enxerga a conta gravada pelo primeiro. Não há índice
    // único no banco porque bases antigas têm duplicadas (a migration falharia).
    await db.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_CONTA_DUPLICADA}::int4, ${empresaId}::int4)`);

    const existentes = await db
        .select({
            id: contasBancariasTable.id,
            nome: contasBancariasTable.nome,
            banco: contasBancariasTable.banco,
            agencia: contasBancariasTable.agencia,
            conta: contasBancariasTable.conta,
        })
        .from(contasBancariasTable)
        .where(tenantScope(contasBancariasTable, empresaId));
    const duplicada = encontrarContaDuplicada(candidata, existentes, idAtual);
    if (duplicada) {
        throw new AppError(
            409,
            "CONTA_DUPLICADA",
            `Já existe a conta "${duplicada.nome}" com este banco, agência e número de conta.`,
        );
    }
}
