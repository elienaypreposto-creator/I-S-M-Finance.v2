/**
 * Retenções na fonte do lançamento (IR, PIS, COFINS, CSLL, INSS, ISS).
 *
 * `valor` é o BRUTO da nota; o tomador (ex.: órgão público) retém os tributos
 * e paga o LÍQUIDO. Na conciliação, o que tem que bater com o extrato é o
 * líquido: valor_liquido = valor − Σ retenções.
 */

export const CAMPOS_RETENCAO = [
    "retencao_ir",
    "retencao_pis",
    "retencao_cofins",
    "retencao_csll",
    "retencao_inss",
    "retencao_iss",
] as const;

export type CampoRetencao = (typeof CAMPOS_RETENCAO)[number];

export const ROTULO_RETENCAO: Record<CampoRetencao, string> = {
    retencao_ir: "IR",
    retencao_pis: "PIS",
    retencao_cofins: "COFINS",
    retencao_csll: "CSLL",
    retencao_inss: "INSS",
    retencao_iss: "ISS",
};

export const MSG_RETENCOES_ACIMA_DO_VALOR = "A soma das retenções não pode ser maior que o valor do lançamento.";

function paraCentavos(v: unknown): number {
    if (v == null || v === "") return 0;
    const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Σ retenções em centavos (campos ausentes = 0). */
export function somaRetencoesCents(r: Partial<Record<CampoRetencao, unknown>>): number {
    return CAMPOS_RETENCAO.reduce((acc, c) => acc + paraCentavos(r[c]), 0);
}

/**
 * Líquido do título em reais: usa `valor_liquido` da API quando veio;
 * senão o próprio `valor` (título sem retenção / resposta antiga).
 */
export function valorLiquidoTitulo(l: {valor: unknown; valor_liquido?: unknown}): number {
    if (l.valor_liquido != null && l.valor_liquido !== "") return paraCentavos(l.valor_liquido) / 100;
    return paraCentavos(l.valor) / 100;
}
