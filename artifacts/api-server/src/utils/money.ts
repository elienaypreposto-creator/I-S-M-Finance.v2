/**
 * Aritmética monetária em centavos inteiros (DEF-06).
 * Decimal só na borda HTTP / persistência em colunas numeric/decimal.
 */

/** Converte valor monetário (number | string decimal) para centavos inteiros. */
export function toCents(value: unknown): number {
    if (value == null || value === "") return 0;
    const raw =
        typeof value === "number"
            ? value
            : Number(String(value).trim().replace(",", "."));
    if (!Number.isFinite(raw)) return 0;
    return Math.round(raw * 100);
}

/** Converte centavos inteiros para número decimal (borda HTTP). */
export function fromCents(cents: number): number {
    return cents / 100;
}

/** Soma uma lista de valores já em centavos. */
export function sumCents(values: Iterable<number>): number {
    let total = 0;
    for (const v of values) total += v;
    return total;
}

/**
 * Formata centavos como string decimal com 2 casas (persistência DB).
 * Ex.: 1162 -> "11.62"; -200000 -> "-2000.00"
 */
export function centsToDecimalString(cents: number): string {
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(Math.trunc(cents));
    const whole = Math.floor(abs / 100);
    const frac = abs % 100;
    return `${sign}${whole}.${String(frac).padStart(2, "0")}`;
}

/**
 * Diferença da conciliação em centavos (sintomas DEF-01 / tabela-verdade §3.3):
 *   Δ = Σ(extrato) − Σ(lançamentos)
 * >0 EXCEDENTE -> juros/multa; <0 FALTA -> residual; =0 EXATO.
 * Wiring no endpoint vincular = DEF-01.
 */
export function diferencaConciliacaoCents(
    somaExtratoCents: number,
    somaLancamentosCents: number,
): number {
    return somaExtratoCents - somaLancamentosCents;
}
