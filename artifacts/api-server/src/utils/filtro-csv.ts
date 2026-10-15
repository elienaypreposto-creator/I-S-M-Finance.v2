/**
 * Parâmetro de filtro com vários valores em CSV (`status=pendente,parcial`).
 * Devolve a lista sem repetição ou `null` se algum valor não for permitido.
 * Ausente/vazio → `undefined` (sem filtro).
 */
export function parseCsvPermitido<T extends string>(
    valor: unknown,
    permitidos: readonly T[],
): T[] | undefined | null {
    if (valor === undefined || valor === null) return undefined;
    if (typeof valor !== "string") return null;
    const itens = Array.from(new Set(valor.split(",").map((v) => v.trim()).filter(Boolean)));
    if (itens.length === 0) return undefined;
    if (!itens.every((v) => (permitidos as readonly string[]).includes(v))) return null;
    return itens as T[];
}
