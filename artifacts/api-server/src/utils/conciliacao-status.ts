/**
 * Quando um extrato está conciliado.
 *
 * Só o finalizar (botão Conciliar) grava `conciliacoes.status = "conciliado"`
 * junto com `data_conciliacao`; a partir daí o extrato fica travado até ser
 * reaberto. Até o lote de correções da conciliação, o resumo marcava
 * "conciliado" sozinho quando não sobrava linha pendente (ex.: todas as linhas
 * classificadas por regra na importação) sem finalizar nada - esses extratos
 * ficaram com `data_conciliacao` nula e são tratados como ainda abertos
 * ("parcial": falta Conciliar), sem precisar de script.
 */
import {sql} from "drizzle-orm";
import {conciliacoesTable, extratosTable} from "@workspace/db/schema";

export function conciliacaoFinalizada(c: {status: string; data_conciliacao: unknown}): boolean {
    return c.status === "conciliado" && c.data_conciliacao != null;
}

/** Status do extrato para exibir/filtrar (exige JOIN com conciliacoes). */
export const statusExtratoEfetivoSql = sql<string>`(CASE WHEN ${extratosTable.status} = 'conciliado' AND ${conciliacoesTable.data_conciliacao} IS NULL THEN 'parcial' ELSE ${extratosTable.status}::text END)`;

/** Status da conciliação: "conciliado" só quando finalizada de fato. */
export const statusConciliacaoEfetivoSql = sql<string>`(CASE WHEN ${conciliacoesTable.status} = 'conciliado' AND ${conciliacoesTable.data_conciliacao} IS NULL THEN 'pendente' ELSE ${conciliacoesTable.status}::text END)`;
