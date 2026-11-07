/**
 * Rótulo curto de valor em reais para eixo de gráfico, em pt-BR:
 * 1.500.000 → "R$ 1,5 mi"; 150.000 → "R$ 150 mil"; 950 → "R$ 950".
 * Espaços não separáveis: o Recharts quebra o rótulo do eixo em linhas nos
 * espaços comuns ("R$ 25" / "mil").
 * Sem imports de React/alias para poder ser testado com `node --test`.
 */
const NB = "\u00a0";
const UMA_CASA = new Intl.NumberFormat("pt-BR", {maximumFractionDigits: 1});
const INTEIRO = new Intl.NumberFormat("pt-BR", {maximumFractionDigits: 0});

export function formatarEixoMoeda(valor: number): string {
    if (!Number.isFinite(valor)) return "";
    const sinal = valor < 0 ? "-" : "";
    const abs = Math.abs(valor);
    if (abs >= 1_000_000) return `${sinal}R$${NB}${UMA_CASA.format(abs / 1_000_000)}${NB}mi`;
    if (abs >= 1_000) return `${sinal}R$${NB}${INTEIRO.format(abs / 1_000)}${NB}mil`;
    return `${sinal}R$${NB}${INTEIRO.format(abs)}`;
}
