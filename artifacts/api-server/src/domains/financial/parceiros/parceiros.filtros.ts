import {eq, ilike, ne, or, sql, type SQL} from "drizzle-orm";
import {parceirosTable} from "@workspace/db/schema";
import {tenantWhere} from "../../../lib/tenant-scope";
import type {ListParceirosQuery} from "./schemas";

/** Escapa curingas do LIKE para a busca do usuário não virar padrão (%, _). */
function escaparLike(termo: string): string {
    return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Filtros da listagem de parceiros (sem paginação nem a regra `excluir_com_usuario`).
 * - search: nome ou CPF/CNPJ sem máscara (então "123.456" acha "123456..." e "12.abc" acha
 *   o CNPJ alfanumérico "12ABC...").
 * - status: "inativo" casa só inativos; "ativo" casa o resto (mesma regra da tela).
 * - tipo: elemento do array jsonb `tipos` (ex.: "Fornecedor").
 * - tipo_pessoa: PF | PJ.
 */
export function condicoesParceiros(
    filtros: Pick<ListParceirosQuery, "search" | "status" | "tipo" | "tipo_pessoa">,
): Array<SQL | undefined> {
    const {search, status, tipo, tipo_pessoa} = filtros;
    // Documento sem máscara e em maiúsculas (CNPJ alfanumérico); só busca por documento se houver dígito.
    const documento = search && /\d/.test(search) ? search.toUpperCase().replace(/[^0-9A-Z]/g, "") : "";

    return [
        search
            ? or(
                ilike(parceirosTable.nome, `%${escaparLike(search)}%`),
                documento
                    ? sql`regexp_replace(upper(coalesce(${parceirosTable.cpf_cnpj}, '')), '[^0-9A-Z]', '', 'g') like ${`%${documento}%`}`
                    : undefined,
            )
            : undefined,
        status === "inativo" ? eq(parceirosTable.status, "inativo") : undefined,
        status === "ativo" ? ne(parceirosTable.status, "inativo") : undefined,
        tipo ? sql`${parceirosTable.tipos} @> ${JSON.stringify([tipo])}::jsonb` : undefined,
        tipo_pessoa ? eq(parceirosTable.tipo_pessoa, tipo_pessoa) : undefined,
    ];
}

export function montarWhereParceiros(
    empresaId: number,
    filtros: Pick<ListParceirosQuery, "search" | "status" | "tipo" | "tipo_pessoa">,
    ...extras: Array<SQL | undefined>
): SQL {
    return tenantWhere(parceirosTable, empresaId, ...condicoesParceiros(filtros), ...extras);
}
