/**
 * Conta do título antes do vínculo da conciliação.
 *
 * O vínculo salvo (persistirVinculo) grava no título a conta do extrato
 * (`conta_id`). Ao desfazer o vínculo ou excluir o extrato, o título voltava
 * para pendente/atrasado mas ficava na conta da conciliação. A conta anterior
 * fica guardada no histórico do vínculo (`historico_conciliacao.detalhes`,
 * chave `contas_anteriores`, sem migration) e volta quando o título fica sem
 * nenhuma quitação.
 *
 * Só se guarda a conta de quem ainda não tinha quitação (a conta "original" do
 * título em aberto) e só quando o vínculo de fato troca a conta. Num segundo
 * pagamento parcial o título já está na conta do primeiro: nada a guardar.
 */

/** Chave em `historico_conciliacao.detalhes` com {lancamento_id: conta_id anterior}. */
export const CHAVE_CONTAS_ANTERIORES = "contas_anteriores";

/** Ações do histórico gravadas pelo vínculo salvo (persistirVinculo). */
export const ACOES_VINCULO = ["vincular", "criar_residuo_parcial"] as const;

type TituloAntes = {id: number; conta_id: number | null; quitadoCents: number};

/**
 * Contas a guardar no histórico do vínculo: títulos sem quitação cuja conta
 * muda para a conta da conciliação. Chave = id do título (string, JSON).
 */
export function contasAnterioresDoVinculo(
    titulos: TituloAntes[],
    contaConciliacao: number | null,
): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const t of titulos) {
        if (t.quitadoCents !== 0) continue;
        if ((t.conta_id ?? null) === (contaConciliacao ?? null)) continue;
        out[String(t.id)] = t.conta_id ?? null;
    }
    return out;
}

type HistoricoVinculo = {
    id: number;
    item_conciliacao_id: number | null;
    acao: string;
    detalhes: string | null;
};

function lerContasAnteriores(detalhes: string | null): Record<string, unknown> | null {
    if (!detalhes) return null;
    try {
        const json = JSON.parse(detalhes) as Record<string, unknown> | null;
        const mapa = json?.[CHAVE_CONTAS_ANTERIORES];
        return mapa && typeof mapa === "object" && !Array.isArray(mapa) ? (mapa as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/**
 * Conta a restaurar no título a partir do histórico dos itens que AINDA têm
 * vínculo com ele (incluindo o que está sendo desfeito). Por item vale só o
 * último registro de vínculo (desfazer + vincular de novo gera outro); entre
 * os itens, o registro mais antigo é o do primeiro pagamento, que guardou a
 * conta original. `encontrada: false` = nada guardado, não mexer na conta.
 */
export function contaAnteriorParaRestaurar(
    historicos: HistoricoVinculo[],
    lancamentoId: number,
): {encontrada: true; conta_id: number | null} | {encontrada: false} {
    const ultimoPorItem = new Map<number, HistoricoVinculo>();
    for (const h of historicos) {
        if (h.item_conciliacao_id == null) continue;
        if (!(ACOES_VINCULO as readonly string[]).includes(h.acao)) continue;
        const atual = ultimoPorItem.get(h.item_conciliacao_id);
        if (!atual || h.id > atual.id) ultimoPorItem.set(h.item_conciliacao_id, h);
    }

    const chave = String(lancamentoId);
    let escolhido: {id: number; conta_id: number | null} | null = null;
    for (const h of ultimoPorItem.values()) {
        const mapa = lerContasAnteriores(h.detalhes);
        if (!mapa || !Object.prototype.hasOwnProperty.call(mapa, chave)) continue;
        const valor = mapa[chave];
        const contaId = typeof valor === "number" && Number.isInteger(valor) && valor > 0 ? valor : null;
        if (valor !== null && contaId === null) continue; // valor inválido: ignora
        if (!escolhido || h.id < escolhido.id) escolhido = {id: h.id, conta_id: contaId};
    }
    return escolhido ? {encontrada: true, conta_id: escolhido.conta_id} : {encontrada: false};
}
