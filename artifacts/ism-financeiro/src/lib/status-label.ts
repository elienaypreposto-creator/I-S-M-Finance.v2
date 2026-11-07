/**
 * Rótulo legível de um status vindo da API ("pago_parcial" → "Pago parcial",
 * "PAGO" → "Pago"). Usado pelo StatusBadge e onde o status aparece como texto.
 * Com o tipo do título, quitação parcial de conta a receber (CR) vira
 * "Recebido parcial" - a API usa o mesmo "pago_parcial" para CP e CR.
 */
export function rotuloStatus(status: string | null | undefined, tipo?: string | null): string {
    const s = (status ?? "").trim().toLowerCase();
    if (!s) return "-";
    if (s === "pago_parcial" && (tipo ?? "").trim().toUpperCase() === "CR") return "Recebido parcial";
    const texto = s.replace(/_/g, " ");
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}
