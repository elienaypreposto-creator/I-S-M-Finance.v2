/**
 * Retenções na fonte do lançamento (IR, PIS, COFINS, CSLL, INSS, ISS).
 *
 * `valor` é o BRUTO da nota; o tomador (ex.: órgão público) retém os tributos
 * e paga o LÍQUIDO. Toda quitação/saldo em aberto usa o líquido:
 *   valor_liquido = valor − Σ retenções   (coluna gerada no banco)
 */

import {sumCents, toCents} from "./money.js";

export const CAMPOS_RETENCAO = [
    "retencao_ir",
    "retencao_pis",
    "retencao_cofins",
    "retencao_csll",
    "retencao_inss",
    "retencao_iss",
] as const;

export type CampoRetencao = (typeof CAMPOS_RETENCAO)[number];

export type Retencoes = Partial<Record<CampoRetencao, unknown>>;

/** Rótulo curto de cada retenção (mensagens de erro). */
export const ROTULO_RETENCAO: Record<CampoRetencao, string> = {
    retencao_ir: "IR",
    retencao_pis: "PIS",
    retencao_cofins: "COFINS",
    retencao_csll: "CSLL",
    retencao_inss: "INSS",
    retencao_iss: "ISS",
};

export const MSG_RETENCOES_ACIMA_DO_VALOR = "A soma das retenções não pode ser maior que o valor do lançamento.";

/** Σ retenções em centavos (campos ausentes = 0). */
export function somaRetencoesCents(r: Retencoes): number {
    return sumCents(CAMPOS_RETENCAO.map((c) => toCents(r[c])));
}

/**
 * Líquido do título em centavos: usa a coluna gerada quando veio do banco;
 * senão calcula (valor − Σ retenções).
 */
export function valorLiquidoCents(l: Retencoes & {valor: unknown; valor_liquido?: unknown}): number {
    if (l.valor_liquido != null && l.valor_liquido !== "") return toCents(l.valor_liquido);
    return toCents(l.valor) - somaRetencoesCents(l);
}

/** Mensagem de erro de uma retenção isolada (negativa / mais de 2 casas), ou null. */
export function erroValorRetencao(valor: unknown): string | null {
    const texto = typeof valor === "number" ? String(valor) : String(valor ?? "").trim();
    if (texto === "") return null;
    const n = Number(texto);
    if (!Number.isFinite(n)) return "deve ser um número.";
    if (n < 0) return "não pode ser negativa.";
    if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return "deve ter no máximo 2 casas decimais.";
    return null;
}

/** true se o payload muda alguma retenção em relação ao título atual. */
export function retencoesAlteradas(atual: Retencoes, payload: Retencoes): boolean {
    return CAMPOS_RETENCAO.some((c) => payload[c] !== undefined && toCents(payload[c]) !== toCents(atual[c]));
}
