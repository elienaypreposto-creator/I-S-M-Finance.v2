import {eq, gte, ilike, inArray, lte, or, type SQL} from "drizzle-orm";
import {lancamentosTable, parceirosTable} from "@workspace/db/schema";
import {tenantWhere} from "../../../lib/tenant-scope";
import type {FiltrosLancamentos} from "./schemas";

/** Escapa curingas do LIKE para a busca do usuário não virar padrão (%, _). */
export function escaparLike(termo: string): string {
    return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * WHERE da listagem/export de lançamentos. Toda consulta que o usa precisa do
 * leftJoin com parceiros, porque a busca também procura no nome do parceiro.
 */
export function montarWhereLancamentos(empresaId: number, filtros: FiltrosLancamentos): SQL {
    const {
        tipo,
        status,
        conta_id,
        parceiro_id,
        plano_conta_id,
        departamento_id,
        centro_custo_id,
        valor_min,
        valor_max,
        data_inicio,
        data_fim,
        search,
    } = filtros;
    const termo = search ? `%${escaparLike(search)}%` : undefined;

    return tenantWhere(
        lancamentosTable,
        empresaId,
        tipo ? eq(lancamentosTable.tipo, tipo) : undefined,
        status && status.length > 0 ? inArray(lancamentosTable.status, status) : undefined,
        conta_id ? eq(lancamentosTable.conta_id, conta_id) : undefined,
        parceiro_id ? eq(lancamentosTable.parceiro_id, parceiro_id) : undefined,
        plano_conta_id ? eq(lancamentosTable.plano_conta_id, plano_conta_id) : undefined,
        departamento_id ? eq(lancamentosTable.departamento_id, departamento_id) : undefined,
        centro_custo_id ? eq(lancamentosTable.centro_custo_id, centro_custo_id) : undefined,
        // Valor de face (coluna `valor`), sem desconto/juros.
        valor_min !== undefined ? gte(lancamentosTable.valor, String(valor_min)) : undefined,
        valor_max !== undefined ? lte(lancamentosTable.valor, String(valor_max)) : undefined,
        data_inicio ? gte(lancamentosTable.vencimento, data_inicio) : undefined,
        data_fim ? lte(lancamentosTable.vencimento, data_fim) : undefined,
        termo
            ? or(
                ilike(lancamentosTable.descricao, termo),
                ilike(lancamentosTable.numero_documento, termo),
                ilike(parceirosTable.nome, termo),
            )
            : undefined,
    );
}
