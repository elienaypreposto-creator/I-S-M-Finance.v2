/**
 * Projeção de saldo dos próximos dias (Painel): parte pura, sem banco.
 *
 * Ponto de partida = saldo geral (soma do saldo atual das contas ativas, a mesma regra
 * do card "Saldo geral" e do cadastro de contas). Daí em diante soma o que está em
 * aberto para receber e subtrai o que está em aberto para pagar, pelo vencimento.
 *
 * Cada ponto é o saldo na ABERTURA do dia (antes do que vence nele) e traz o que vence
 * no dia: o primeiro ponto (hoje) é exatamente o saldo geral, e o ponto seguinte já
 * leva o que venceu no anterior. Um ponto extra, no dia seguinte ao último, fecha a
 * janela com tudo o que vence nela.
 */
import {somarDiasIso} from "./date-civil";
import {fromCents, toCents} from "./money";

export type PrevistoNoDia = {
    /** Vencimento (YYYY-MM-DD). */
    data: unknown;
    receber: unknown;
    pagar: unknown;
};

export type PontoProjecao = {
    data: string;
    /** Saldo na abertura do dia (antes do que vence nele). */
    saldo: number;
    /** A receber em aberto com vencimento no dia. */
    receber: number;
    /** A pagar em aberto com vencimento no dia. */
    pagar: number;
};

export function projetarSaldoDiario(
    saldoGeralCents: number,
    previstos: readonly PrevistoNoDia[],
    hoje: string,
    dias: number,
): {pontos: PontoProjecao[]; saldoFinalCents: number} {
    const porDia = new Map<string, {receberCents: number; pagarCents: number}>();
    for (const p of previstos) {
        const data = String(p.data).slice(0, 10);
        const atual = porDia.get(data) ?? {receberCents: 0, pagarCents: 0};
        atual.receberCents += toCents(p.receber);
        atual.pagarCents += toCents(p.pagar);
        porDia.set(data, atual);
    }

    const pontos: PontoProjecao[] = [];
    let saldoCents = saldoGeralCents;
    for (let i = 0; i < dias; i++) {
        const data = somarDiasIso(hoje, i);
        const mov = porDia.get(data) ?? {receberCents: 0, pagarCents: 0};
        pontos.push({data, saldo: fromCents(saldoCents), receber: fromCents(mov.receberCents), pagar: fromCents(mov.pagarCents)});
        saldoCents += mov.receberCents - mov.pagarCents;
    }
    pontos.push({data: somarDiasIso(hoje, dias), saldo: fromCents(saldoCents), receber: 0, pagar: 0});
    return {pontos, saldoFinalCents: saldoCents};
}
