import {normalizarNome} from "./nomes";

export type TipoPlano = "receita" | "custo" | "despesa";
export type GrupoDre = "receita" | "deducao" | "custo" | "despesa" | "fora";

/**
 * Linhas da DRE que fazem sentido para cada tipo de conta (mesma regra da API,
 * api-server/.../plano-contas/plano-contas-regras.ts).
 * Receita é entrada: Receita bruta ou fora da DRE. Custo e despesa são saídas:
 * dedução, custo, despesa ou fora. Sem linha, a conta segue o tipo.
 */
export const GRUPOS_DRE_POR_TIPO: Record<TipoPlano, readonly GrupoDre[]> = {
    receita: ["receita", "fora"],
    custo: ["deducao", "custo", "despesa", "fora"],
    despesa: ["deducao", "custo", "despesa", "fora"],
};

export function grupoDreCompativel(tipo: string | null | undefined, grupoDre: string | null | undefined): boolean {
    if (!grupoDre) return true;
    const permitidos = GRUPOS_DRE_POR_TIPO[(tipo ?? "").toLowerCase() as TipoPlano];
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

/**
 * Grafia já usada para a categoria no mesmo tipo (ex.: "saude" digitado vira
 * "Saúde" se já existe), para a conta nova cair no grupo existente.
 */
export function categoriaExistente(
    contas: readonly ChavePlano[],
    tipo: string,
    categoria: string,
): string | undefined {
    const chave = normalizarNome(categoria);
    return contas.find((c) => c.tipo.toLowerCase() === tipo.toLowerCase() && normalizarNome(c.categoria) === chave)
        ?.categoria;
}
