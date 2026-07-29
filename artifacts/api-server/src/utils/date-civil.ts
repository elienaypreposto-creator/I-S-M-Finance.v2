/**
 * Datas civis no fuso operacional (America/Sao_Paulo).
 * Evita `Date#getFullYear/getMonth/getDate` (fuso do processo) e
 * `toISOString().slice(0,10)` (UTC) — ambos deslocam o dia após ~21h BRT.
 */

export const TZ_OPERACAO = "America/Sao_Paulo";

/** Dia civil YYYY-MM-DD em America/Sao_Paulo. */
export function hojeIsoLocal(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ_OPERACAO,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}
