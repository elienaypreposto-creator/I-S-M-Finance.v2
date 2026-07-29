import {sql} from "drizzle-orm";
import {lancamentosTable} from "@workspace/db/schema";

/**
 * Lançamentos que afetam o caixa de uma conta bancária:
 * - `lancamentos.conta_id` = conta, OU
 * - vinculados a uma conciliação dessa conta (conta_id pode estar NULL no título).
 *
 * Necessário porque o cadastro do título nem sempre preenche conta_id; o vínculo
 * pela conciliação é a fonte de verdade do movimento bancário (FEAT-10 / Card 62).
 */
export function sqlLancamentosDaConta(contaId: number) {
    return sql`(
                   ${lancamentosTable.conta_id} = ${contaId}
                   OR ${lancamentosTable.id} IN (
                   SELECT icl.lancamento_id
                   FROM itens_conciliacao_lancamentos icl
                   INNER JOIN itens_conciliacao ic ON ic.id = icl.item_conciliacao_id
                   INNER JOIN conciliacoes c ON c.id = ic.conciliacao_id
                   WHERE c.conta_id = ${contaId}
                   ))`;
}
