/**
 * Quanto de um título ainda está em aberto e quanto já foi quitado.
 *
 * Tela de Lançamentos (coluna "R$ Valor" e resumo "A receber / A pagar"):
 * o valor da linha é o BRUTO ajustado (valor − desconto + juros, sem tirar as
 * retenções). O resumo soma só o que está em aberto, no mesmo critério:
 *   - pendente / atrasado: o valor da linha;
 *   - pago_parcial: o que falta quitar = líquido − desconto + juros − quitado
 *     (as retenções já saíram junto com o primeiro pagamento; sem retenção é
 *     o próprio valor da linha menos o que foi pago). Se a conciliação gerou
 *     um residual (não cancelado) para o título, o que falta está NO residual
 *     e o restante do pago_parcial vale 0 - senão o saldo contava duas vezes
 *     (ou mais, em cadeia: 200.000 pago 9 → residual 199.991 pago 12.000 →
 *     residual 187.991 somava 199.991 + 187.991 + 187.991);
 *   - pago / recebido / cancelado: nada.
 * "Recebido / Pago" soma o `valor_quitado` (o que passou pelo banco) dos
 * títulos com quitação (pago, recebido e a parte paga do pago_parcial).
 *
 * A versão SQL (resumo) e a versão em centavos (linha) seguem a mesma regra.
 */
import {sql, type SQL} from "drizzle-orm";
import {alias} from "drizzle-orm/pg-core";
import {lancamentosTable} from "@workspace/db/schema";
import {toCents} from "../../../utils/money";

/** Status que podem ter saldo em aberto (o pago_parcial só sem residual ativo). */
export const STATUS_EM_ABERTO = ["pendente", "atrasado", "pago_parcial"] as const;
export const STATUS_COM_QUITACAO = ["pago", "recebido", "pago_parcial"] as const;

const t = lancamentosTable;

/** Valor da linha: max(bruto − desconto + juros, 0). */
export const valorLinhaSql: SQL = sql`greatest(${t.valor} - coalesce(${t.desconto}, 0) + coalesce(${t.juros}, 0), 0)`;

/** Residual que aponta para o título (alias da subconsulta correlacionada). */
const ALIAS_RESIDUAL = "residual_ativo";
const residual = alias(lancamentosTable, ALIAS_RESIDUAL);

/**
 * O título tem residual ativo (gerado na conciliação, não cancelado): o saldo
 * em aberto passou para o residual. Mesma empresa do título (a RLS também filtra).
 */
export const temResidualAtivoSql: SQL = sql`exists (select 1 from ${t} as ${sql.identifier(ALIAS_RESIDUAL)} where ${residual.lancamento_origem_id} = ${t.id} and ${residual.empresa_id} = ${t.empresa_id} and ${residual.status} <> 'cancelado')`;

/**
 * Restante de um pago_parcial: max(líquido − desconto + juros − quitado, 0),
 * ou 0 quando o restante já está num residual ativo.
 */
export const restanteParcialSql: SQL = sql`(case when ${temResidualAtivoSql} then 0 else greatest(${t.valor_liquido} - coalesce(${t.desconto}, 0) + coalesce(${t.juros}, 0) - coalesce(${t.valor_quitado}, 0), 0) end)`;

/** Em aberto no critério da linha (resumo de Lançamentos). */
export const emAbertoLinhaSql: SQL = sql`case
    when ${t.status} in ('pendente', 'atrasado') then ${valorLinhaSql}
    when ${t.status} = 'pago_parcial' then ${restanteParcialSql}
    else 0 end`;

/**
 * Painel (alertas, inadimplência, nível de risco, KPIs do mês): critério
 * LÍQUIDO, o que ainda vai entrar/sair do banco.
 *   - pendente / atrasado: valor_liquido (como sempre foi no Painel);
 *   - pago_parcial: o restante (antes sumia: venc. 04/11, pago 400 de 500 e
 *     os 100 que faltam não apareciam em lugar nenhum); com residual ativo o
 *     título sai e entra o residual (pendente/atrasado) pelo que falta.
 * Use os dois juntos: o WHERE escolhe os títulos, o valor diz quanto falta.
 * Exceção: os KPIs "CR/CP Vencidos" somam `emAbertoLinhaSql` (critério da
 * lista de Lançamentos, com desconto e juros) para bater com o total de
 * atrasados de lá; o WHERE continua sendo este.
 */
export const emAbertoNoPainelWhere: SQL = sql`(${t.status} in ('pendente', 'atrasado') or (${t.status} = 'pago_parcial' and ${restanteParcialSql} > 0))`;

export const emAbertoLiquidoSql: SQL = sql`(case when ${t.status} = 'pago_parcial' then ${restanteParcialSql} else ${t.valor_liquido} end)`;

/** Já quitado (o que passou pelo banco). */
export const quitadoSql: SQL = sql`case
    when ${t.status} in ('pago', 'recebido', 'pago_parcial') then coalesce(${t.valor_quitado}, 0)
    else 0 end`;

type TituloValores = {
    status: string;
    valor: unknown;
    valor_liquido: unknown;
    desconto?: unknown;
    juros?: unknown;
    valor_quitado?: unknown;
    /** Há residual não cancelado apontando para o título (`temResidualAtivoSql`). */
    tem_residual_ativo?: unknown;
};

/** Em aberto do título, em centavos (mesma regra de `emAbertoLinhaSql`). */
export function emAbertoLinhaCents(l: TituloValores): number {
    const ajuste = toCents(l.juros) - toCents(l.desconto);
    if (l.status === "pendente" || l.status === "atrasado") {
        return Math.max(toCents(l.valor) + ajuste, 0);
    }
    if (l.status === "pago_parcial") {
        // O que falta está no residual: contar aqui seria contar duas vezes.
        if (l.tem_residual_ativo === true) return 0;
        return Math.max(toCents(l.valor_liquido) + ajuste - toCents(l.valor_quitado), 0);
    }
    return 0;
}

/** Quitado do título, em centavos (mesma regra de `quitadoSql`). */
export function quitadoCents(l: Pick<TituloValores, "status" | "valor_quitado">): number {
    return (STATUS_COM_QUITACAO as readonly string[]).includes(l.status) ? toCents(l.valor_quitado) : 0;
}
