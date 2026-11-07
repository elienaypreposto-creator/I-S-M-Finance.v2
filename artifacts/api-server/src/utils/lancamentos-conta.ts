import {sql, type SQL} from "drizzle-orm";
import {lancamentosTable} from "@workspace/db/schema";

/** Lançamento vinculado a uma linha de extrato de uma conciliação desta conta. */
function sqlConciliadoNaConta(contaId: number): SQL {
    return sql`${lancamentosTable.id} IN (
                   SELECT icl.lancamento_id
                   FROM itens_conciliacao_lancamentos icl
                   INNER JOIN itens_conciliacao ic ON ic.id = icl.item_conciliacao_id
                   INNER JOIN conciliacoes c ON c.id = ic.conciliacao_id
                   WHERE c.conta_id = ${contaId}
                   )`;
}

/**
 * Conta do movimento: cada lançamento entra no saldo de UMA conta só.
 * - `lancamentos.conta_id` preenchido: é a conta (a conciliação grava ali a conta
 *   do extrato ao vincular e ao finalizar);
 * - `conta_id` NULL (título antigo, de antes de a conciliação gravar a conta): vale
 *   a conta da conciliação do vínculo mais recente (FEAT-10 / Card 62).
 *
 * Antes era "conta_id = conta OU conciliado nela": um título vinculado a extratos de
 * duas contas (ou com a conta trocada depois de conciliado) entrava com o
 * `valor_quitado` inteiro nas duas, e a soma das contas passava do Fluxo de Caixa.
 */
export function sqlLancamentosDaConta(contaId: number): SQL {
    return sql`(
                   ${lancamentosTable.conta_id} = ${contaId}
                   OR (
                   ${lancamentosTable.conta_id} IS NULL
                   AND (
                   SELECT c.conta_id
                   FROM itens_conciliacao_lancamentos icl
                   INNER JOIN itens_conciliacao ic ON ic.id = icl.item_conciliacao_id
                   INNER JOIN conciliacoes c ON c.id = ic.conciliacao_id
                   WHERE icl.lancamento_id = ${lancamentosTable.id}
                   ORDER BY icl.id DESC
                   LIMIT 1
                   ) = ${contaId}
                   ))`;
}

/**
 * Movimentos que entram no saldo da conta (regra única do saldo: Painel, cadastro
 * de contas, conciliação e extrato da conta em Relatórios):
 * - lançamentos da conta (ver `sqlLancamentosDaConta`);
 * - quitados a partir da `data_inicio` da conta, ou conciliados nela
 *   (antes da data de início, o `saldo_inicial` da conta já cobre o movimento);
 * - status quitado (pago, recebido, pago_parcial), somando o `valor_quitado`.
 * Saldo na data = saldo_inicial (se já vale na data, ver `saldoInicialValeNaData`)
 *               + Σ CR − Σ CP desses movimentos com data_quitacao ≤ data.
 */
export function sqlMovimentosNoSaldoDaConta(contaId: number, dataInicioConta: string): SQL[] {
    return [
        sqlLancamentosDaConta(contaId),
        sql`(
                ${lancamentosTable.data_quitacao} >= ${dataInicioConta}
                OR ${sqlConciliadoNaConta(contaId)})`,
        sql`${lancamentosTable.status}
        IN ('pago', 'recebido', 'pago_parcial')`,
    ];
}

/**
 * O `saldo_inicial` da conta é o saldo na ABERTURA do dia `data_inicio` (o "saldo
 * anterior" do extrato do banco que começa nesse dia). No saldo do sistema ele entra
 * no próprio dia de início: o fechamento de `data_inicio` em diante o leva; o da
 * véspera e de antes, não (saldo desconhecido = só os movimentos, zero em geral).
 *
 * Antes valia "do fechamento da véspera em diante": numa conta que começa no dia 1º,
 * o fim do mês anterior já levava o saldo inicial e o relatório mostrava a abertura
 * no mês anterior. Agora o saldo final de um período (fechamento do último dia) é o
 * saldo inicial do período seguinte e a abertura cai no período que contém a data
 * de início. Sem data (saldo atual), sempre vale.
 */
export function saldoInicialValeNaData(dataRef: string | undefined, dataInicioConta: string): boolean {
    if (!dataRef) return true;
    return dataRef >= String(dataInicioConta).slice(0, 10);
}
