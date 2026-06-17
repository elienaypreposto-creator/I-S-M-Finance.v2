import {and, eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {contasBancariasTable, lancamentosTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import type {CreateTransferenciaBody} from "./schemas";

export interface TransferenciaResult {
    transferencia_grupo_id: string;
    lancamento_saida_id: number;
    lancamento_entrada_id: number;
    conta_origem_nome: string;
    conta_destino_nome: string;
    valor: number;
    data: string;
}

export async function executeTransfer(
    payload: CreateTransferenciaBody,
): Promise<TransferenciaResult> {
    // valida ambas as contas em paralelo antes de abrir a transação
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
        // Colunas nulas para entradas geradas pelo sistema
        parceiro_id: null,
        plano_conta_id: null,
        departamento_id: null,
        centro_custo_id: null,
    };

    const resultado = await db.transaction(async (tx) => {
        // A - saída da conta de origem (Contas a Pagar, já liquidada)
        const [saida] = await tx
            .insert(lancamentosTable)
            .values({
                ...camposComuns,
                tipo: "CP",
                status: "pago",
                conta_id: payload.conta_origem_id,
            })
            .returning({id: lancamentosTable.id});

        // B - entrada na conta de destino (Contas a Receber, já liquidadas)
        const [entrada] = await tx
            .insert(lancamentosTable)
            .values({
                ...camposComuns,
                tipo: "CR",
                status: "recebido",
                conta_id: payload.conta_destino_id,
            })
            .returning({id: lancamentosTable.id});

        return {
            transferencia_grupo_id: grupoId,
            lancamento_saida_id: saida.id,
            lancamento_entrada_id: entrada.id,
        };
    });

    return {
        ...resultado,
        conta_origem_nome: contaOrigem.nome,
        conta_destino_nome: contaDestino.nome,
        valor: payload.valor,
        data: payload.data,
    };
}
