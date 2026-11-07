import type {GrupoDre} from "../../../utils/dre";
import {normalizarNome} from "../../../utils/nomes";

/**
 * Linhas da DRE que fazem sentido para cada tipo de conta.
 *
 * Receita é entrada: só entra em "Receita bruta" ou fica fora da DRE.
 * Custo e despesa são saídas: podem ir para dedução, custo, despesa ou fora
 * (ex.: imposto sobre faturamento lançado como despesa vai para Dedução).
 * Sem linha (null) a conta segue o tipo, então sempre é coerente.
 */
export const GRUPOS_DRE_POR_TIPO: Record<string, readonly GrupoDre[]> = {
    receita: ["receita", "fora"],
    custo: ["deducao", "custo", "despesa", "fora"],
    despesa: ["deducao", "custo", "despesa", "fora"],
};

export function grupoDreCompativel(tipo: string | null | undefined, grupoDre: string | null | undefined): boolean {
    if (!grupoDre) return true;
    const permitidos = GRUPOS_DRE_POR_TIPO[(tipo ?? "").toLowerCase()];
    if (!permitidos) return true;
    return (permitidos as readonly string[]).includes(grupoDre);
}

type ChavePlano = {
    id?: number;
    tipo: string;
    categoria: string;
    subcategoria?: string | null;
};

/**
 * Conta igual já cadastrada: mesmo tipo, categoria e subcategoria, sem diferença
 * de caixa, acento ou espaços. O próprio registro (edição) não conta.
 */
export function acharPlanoDuplicado<T extends ChavePlano & { id: number }>(
    contas: readonly T[],
    alvo: ChavePlano,
): T | undefined {
    const tipo = alvo.tipo.toLowerCase();
    const categoria = normalizarNome(alvo.categoria);
    const subcategoria = normalizarNome(alvo.subcategoria);
    return contas.find(
        (c) =>
            c.id !== alvo.id &&
            c.tipo.toLowerCase() === tipo &&
            normalizarNome(c.categoria) === categoria &&
            normalizarNome(c.subcategoria) === subcategoria,
    );
}

/** Grafia já cadastrada para a categoria no mesmo tipo (ex.: "saude" → "Saúde"). */
export function categoriaExistente(
    contas: readonly ChavePlano[],
    tipo: string,
    categoria: string,
): string | undefined {
    const chave = normalizarNome(categoria);
    return contas.find((c) => c.tipo.toLowerCase() === tipo.toLowerCase() && normalizarNome(c.categoria) === chave)
        ?.categoria;
}
