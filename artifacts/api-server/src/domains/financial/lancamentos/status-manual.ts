/**
 * Status do lançamento editado pela tela de Lançamentos (POST/PUT /lancamentos).
 *
 * Quitação (pago, recebido, pago_parcial) não é escolhida à mão: vem da
 * conciliação bancária (ou da transferência entre contas), que grava junto
 * `conta_id`, `data_quitacao` e `valor_quitado` - os campos que o saldo da
 * conta, o Painel, o Fluxo de Caixa e o Contábil/Fiscal usam. Marcar "pago" no
 * formulário deixava um título "liquidado" que nunca entrava em nenhum deles.
 *
 * - Na criação, status de quitação pedido é ignorado (nasce aberto pelo vencimento).
 * - Na edição, status de quitação pedido é ignorado (o formulário reenvia o atual).
 * - Reabrir/cancelar um título quitado pela conciliação ou por transferência é
 *   recusado (409): desfaz-se na origem, que reverte o saldo junto.
 * - Título marcado como quitado sem vínculo nem transferência (legado do
 *   caminho antigo) pode ser reaberto: a quitação órfã é limpa.
 */
import {statusAbertoPorVencimento} from "../../../utils/conciliacao-vincular";

export const STATUS_QUITACAO = ["pago", "recebido", "pago_parcial"] as const;

export type StatusQuitacao = (typeof STATUS_QUITACAO)[number];
export type StatusManual = "pendente" | "atrasado" | "cancelado";

export function ehStatusQuitacao(status: string | null | undefined): status is StatusQuitacao {
    return (STATUS_QUITACAO as readonly string[]).includes(status ?? "");
}

export const MSG_REABRIR_CONCILIADO =
    "Este lançamento foi quitado pela conciliação bancária. Para reabri-lo ou cancelá-lo, desfaça o vínculo na tela de Conciliação.";

export const MSG_REABRIR_TRANSFERENCIA =
    "Este lançamento faz parte de uma transferência entre contas. Para desfazê-lo, edite ou exclua a transferência.";

/** Status gravado na criação: só cancelado é aceito; o resto nasce aberto pelo vencimento. */
export function statusNaCriacao(
    statusPedido: string | null | undefined,
    vencimento: string,
    hojeIso: string,
): StatusManual {
    if (statusPedido === "cancelado") return "cancelado";
    return statusAbertoPorVencimento(vencimento, hojeIso);
}

export type DecisaoStatusNaEdicao =
    | {ok: false; mensagem: string}
    | {
          ok: true;
          /** Status a gravar; undefined = não mexe no status. */
          status: StatusManual | undefined;
          /** true = limpar data_quitacao/valor_quitado (quitação órfã do caminho antigo). */
          limparQuitacao: boolean;
      };

export function decidirStatusNaEdicao(args: {
    statusPedido: string | null | undefined;
    statusAtual: string;
    quitadoAtualCents: number;
    temVinculoConciliacao: boolean;
    ehTransferencia: boolean;
}): DecisaoStatusNaEdicao {
    const {statusPedido, statusAtual, quitadoAtualCents, temVinculoConciliacao, ehTransferencia} = args;

    // Sem status, ou status de quitação (derivado, nunca manual): não mexe.
    if (statusPedido == null || ehStatusQuitacao(statusPedido)) {
        return {ok: true, status: undefined, limparQuitacao: false};
    }
    const pedido = statusPedido as StatusManual;
    if (pedido === statusAtual) {
        return {ok: true, status: undefined, limparQuitacao: false};
    }

    const temQuitacao = ehStatusQuitacao(statusAtual) || quitadoAtualCents > 0;
    if (temQuitacao && temVinculoConciliacao) return {ok: false, mensagem: MSG_REABRIR_CONCILIADO};
    if (temQuitacao && ehTransferencia) return {ok: false, mensagem: MSG_REABRIR_TRANSFERENCIA};

    return {ok: true, status: pedido, limparQuitacao: temQuitacao};
}
