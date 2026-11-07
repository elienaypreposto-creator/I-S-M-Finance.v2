import {hojeIsoLocal} from "../../../utils/date-civil";

/**
 * Regras de cadastro da conta bancária que não são de saldo: conta duplicada e data
 * de início no futuro. O front repete a regra de duplicidade em
 * artifacts/ism-financeiro/src/lib/conta-bancaria.ts.
 */

export type DadosConta = {
    id?: number;
    nome?: string;
    banco?: string | null;
    agencia?: string | null;
    conta?: string | null;
};

const semZerosAEsquerda = (s: string) => s.replace(/^0+(?=\d)/, "");

/**
 * Chave de comparação banco + agência + conta. Ignora caixa, espaços, pontuação,
 * zeros à esquerda e o dígito da agência (1234 e 1234-5 são a mesma agência).
 * Sem banco, agência ou conta (ex.: Conta Movimento) não há chave.
 */
export function chaveContaBancaria(c: DadosConta): string | null {
    const banco = (c.banco ?? "").trim().toLocaleLowerCase("pt-BR");
    const agencia = semZerosAEsquerda((c.agencia ?? "").split("-")[0]!.replace(/\D/g, ""));
    const conta = semZerosAEsquerda((c.conta ?? "").replace(/\D/g, ""));
    if (!banco || !agencia || !conta) return null;
    return `${banco}|${agencia}|${conta}`;
}

/** Primeira conta com o mesmo banco + agência + conta, ignorando a própria (edição). */
export function encontrarContaDuplicada<T extends DadosConta>(
    candidata: DadosConta,
    existentes: readonly T[],
    ignorarId?: number,
): T | undefined {
    const chave = chaveContaBancaria(candidata);
    if (!chave) return undefined;
    return existentes.find((c) => c.id !== ignorarId && chaveContaBancaria(c) === chave);
}

/** Data de início (YYYY-MM-DD) depois de hoje no fuso de operação. */
export function dataInicioNoFuturo(dataInicio: string | null | undefined, hoje: string = hojeIsoLocal()): boolean {
    return !!dataInicio && dataInicio > hoje;
}
