import {and, desc, eq, isNotNull} from "drizzle-orm";
import {db} from "@workspace/db";
import {contasBancariasTable, lancamentosTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import type {CreateTransferenciaBody, UpdateTransferenciaBody} from "./schemas";

export interface TransferenciaResult {
    transferencia_grupo_id: string;
    lancamento_saida_id: number;
    lancamento_entrada_id: number;
    conta_origem_id: number;
    conta_origem_nome: string;
    conta_destino_id: number;
    conta_destino_nome: string;
    valor: number;
    data: string;
    descricao: string | null;
    created_at: Date;
}

/**
 * Fetches both legs of a transfer by group ID and validates completeness.
 * Throws AppError(404) if the group doesn't exist or is incomplete (< 2 legs).
 */
async function fetchLegs(grupoId: string) {
    const rows = await db
        .select({
            id: lancamentosTable.id,
            tipo: lancamentosTable.tipo,
            conta_id: lancamentosTable.conta_id,
            valor: lancamentosTable.valor,
        })
        .from(lancamentosTable)
        .where(eq(lancamentosTable.transferencia_grupo_id, grupoId));

    const saida = rows.find((r) => r.tipo === "CP");
    const entrada = rows.find((r) => r.tipo === "CR");

    if (!saida || !entrada) {
        throw new AppError(
            404,
            "NOT_FOUND",
            `Transferência com grupo_id "${grupoId}" não encontrada.`,
        );
    }

    return {saida, entrada};
}

export async function listTransferencias(): Promise<TransferenciaResult[]> {
    const rows = await db
        .select({
            id: lancamentosTable.id,
            tipo: lancamentosTable.tipo,
            transferencia_grupo_id: lancamentosTable.transferencia_grupo_id,
            conta_id: lancamentosTable.conta_id,
            conta_nome: contasBancariasTable.nome,
            valor: lancamentosTable.valor,
            vencimento: lancamentosTable.vencimento,
            descricao: lancamentosTable.descricao,
            created_at: lancamentosTable.created_at,
        })
        .from(lancamentosTable)
        .leftJoin(contasBancariasTable, eq(lancamentosTable.conta_id, contasBancariasTable.id))
        .where(
            and(
                eq(lancamentosTable.origem, "transferencia"),
                isNotNull(lancamentosTable.transferencia_grupo_id),
            ),
        )
        .orderBy(desc(lancamentosTable.created_at));

    const gruposMap = new Map<string, {
        saida: (typeof rows)[number] | null;
        entrada: (typeof rows)[number] | null;
    }>();

    for (const row of rows) {
        const gid = row.transferencia_grupo_id!;
        if (!gruposMap.has(gid)) gruposMap.set(gid, {saida: null, entrada: null});
        const grupo = gruposMap.get(gid)!;
        if (row.tipo === "CP") grupo.saida = row;
        else grupo.entrada = row;
    }

    const resultado: TransferenciaResult[] = [];
    for (const [gid, {saida, entrada}] of gruposMap) {
        if (!saida || !entrada) continue;

        resultado.push({
            transferencia_grupo_id: gid,
            lancamento_saida_id: saida.id,
            lancamento_entrada_id: entrada.id,
            conta_origem_id: saida.conta_id!,
            conta_origem_nome: saida.conta_nome ?? `Conta #${saida.conta_id}`,
            conta_destino_id: entrada.conta_id!,
            conta_destino_nome: entrada.conta_nome ?? `Conta #${entrada.conta_id}`,
            valor: Number(saida.valor),
            data: saida.vencimento,
            descricao: saida.descricao,
            created_at: saida.created_at,
        });
    }

    return resultado;
}

export async function executeTransfer(
    payload: CreateTransferenciaBody,
): Promise<TransferenciaResult> {
    // Pre-flight: validate both accounts in parallel before opening the transaction.
    const [[contaOrigem], [contaDestino]] = await Promise.all([
        db
            .select({id: contasBancariasTable.id, nome: contasBancariasTable.nome})
            .from(contasBancariasTable)
            .where(
                and(
                    eq(contasBancariasTable.id, payload.conta_origem_id),
                    eq(contasBancariasTable.status, "ativo"),
                ),
            )
            .limit(1),

        db
            .select({id: contasBancariasTable.id, nome: contasBancariasTable.nome})
            .from(contasBancariasTable)
            .where(
                and(
                    eq(contasBancariasTable.id, payload.conta_destino_id),
                    eq(contasBancariasTable.status, "ativo"),
                ),
            )
            .limit(1),
    ]);

    if (!contaOrigem) {
        throw new AppError(
            404,
            "NOT_FOUND",
            `Conta de origem (id=${payload.conta_origem_id}) não encontrada ou inativa.`,
        );
    }
    if (!contaDestino) {
        throw new AppError(
            404,
            "NOT_FOUND",
            `Conta de destino (id=${payload.conta_destino_id}) não encontrada ou inativa.`,
        );
    }

    const grupoId = crypto.randomUUID();
    const valorStr = payload.valor.toFixed(2);

    const camposComuns = {
        origem: "transferencia" as const,
        valor: valorStr,
        vencimento: payload.data,
        data_quitacao: payload.data,
        valor_quitado: valorStr,
        descricao: payload.descricao,
        transferencia_grupo_id: grupoId,
        parceiro_id: null,
        plano_conta_id: null,
        departamento_id: null,
        centro_custo_id: null,
    };

    const resultado = await db.transaction(async (tx) => {
        const [saida] = await tx
            .insert(lancamentosTable)
            .values({...camposComuns, tipo: "CP", status: "pago", conta_id: payload.conta_origem_id})
            .returning({id: lancamentosTable.id});

        const [entrada] = await tx
            .insert(lancamentosTable)
            .values({...camposComuns, tipo: "CR", status: "recebido", conta_id: payload.conta_destino_id})
            .returning({id: lancamentosTable.id});

        return {
            transferencia_grupo_id: grupoId,
            lancamento_saida_id: saida.id,
            lancamento_entrada_id: entrada.id,
        };
    });

    return {
        ...resultado,
        conta_origem_id: contaOrigem.id,
        conta_origem_nome: contaOrigem.nome,
        conta_destino_id: contaDestino.id,
        conta_destino_nome: contaDestino.nome,
        valor: payload.valor,
        data: payload.data,
        descricao: payload.descricao,
        created_at: new Date(),
    };
}

export async function updateTransfer(
    grupoId: string,
    payload: UpdateTransferenciaBody,
): Promise<{ transferencia_grupo_id: string; lancamento_saida_id: number; lancamento_entrada_id: number }> {
    const {saida, entrada} = await fetchLegs(grupoId);

    const updates: Record<string, unknown> = {updated_at: new Date()};
    if (payload.valor !== undefined) {
        const valorStr = payload.valor.toFixed(2);
        updates.valor = valorStr;
        updates.valor_quitado = valorStr;
    }
    if (payload.data !== undefined) {
        updates.vencimento = payload.data;
        updates.data_quitacao = payload.data;
    }
    if (payload.descricao !== undefined) {
        updates.descricao = payload.descricao;
    }

    await db.transaction(async (tx) => {
        await tx.update(lancamentosTable).set(updates).where(eq(lancamentosTable.id, saida.id));
        await tx.update(lancamentosTable).set(updates).where(eq(lancamentosTable.id, entrada.id));
    });

    return {
        transferencia_grupo_id: grupoId,
        lancamento_saida_id: saida.id,
        lancamento_entrada_id: entrada.id,
    };
}

export async function deleteTransfer(grupoId: string): Promise<{ deleted: boolean }> {
    const {saida, entrada} = await fetchLegs(grupoId);

    await db.transaction(async (tx) => {
        await tx.delete(lancamentosTable).where(eq(lancamentosTable.id, saida.id));
        await tx.delete(lancamentosTable).where(eq(lancamentosTable.id, entrada.id));
    });

    return {deleted: true};
}
