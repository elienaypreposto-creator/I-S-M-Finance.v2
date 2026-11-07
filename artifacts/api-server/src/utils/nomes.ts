/**
 * Comparação de nomes de cadastro (departamento, filial, plano de contas…).
 *
 * Dois nomes são o mesmo quando só diferem em maiúsculas, acentos ou espaços:
 * "  Saúde " = "saude" = "SAÚDE".
 */

/** Tira espaços das pontas e junta espaços repetidos (forma que vai para o banco). */
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
