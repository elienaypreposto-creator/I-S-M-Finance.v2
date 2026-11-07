/**
 * Comparação de nomes de cadastro (departamento, filial, plano de contas…).
 * Mesma regra da API (api-server/src/utils/nomes.ts): dois nomes são o mesmo
 * quando só diferem em maiúsculas, acentos ou espaços.
 */

/** Tira espaços das pontas e junta espaços repetidos. */
export function limparNome(valor: string | null | undefined): string {
    return (valor ?? "").trim().replace(/\s+/g, " ");
}

/** Chave de comparação: sem acento, sem caixa, sem espaço sobrando. */
export function normalizarNome(valor: string | null | undefined): string {
    return limparNome(valor)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

/** Primeiro item com o mesmo nome (normalizado), ignorando o próprio registro. */
export function acharNomeDuplicado<T extends { id: number; nome: string }>(
    itens: readonly T[],
    nome: string,
    idIgnorar?: number,
): T | undefined {
    const chave = normalizarNome(nome);
    return itens.find((item) => item.id !== idIgnorar && normalizarNome(item.nome) === chave);
}

const collatorNomes = new Intl.Collator("pt-BR", {sensitivity: "base", numeric: true});

/** Ordena por nome em ordem alfabética (pt-BR, sem diferenciar caixa/acento). */
export function ordenarPorNome<T extends { nome: string }>(itens: readonly T[]): T[] {
    return [...itens].sort((a, b) => collatorNomes.compare(limparNome(a.nome), limparNome(b.nome)));
}
