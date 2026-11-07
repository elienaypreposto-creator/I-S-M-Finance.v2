/**
 * Regras do cadastro de conta bancária que não dependem da tela: máscara da agência,
 * saldo inicial com sinal e conta duplicada. A API repete a regra de duplicidade em
 * artifacts/api-server/src/domains/financial/contas-bancarias/contas-bancarias.validacoes.ts.
 */
import {apiValorToValorBr, brMoneyDisplayToApiString, formatValorBrInput} from "@/validations/lancamentos.schema";

/** Agência: até 4 dígitos e, opcionalmente, o dígito verificador depois do hífen (1234 ou 1234-5). */
export function mascararAgenciaConta(valor: string): string {
    const n = valor.replace(/\D/g, "").slice(0, 5);
    return n.length === 5 ? `${n.slice(0, 4)}-${n.slice(4)}` : n;
}

export const AGENCIA_MAX_LENGTH = 6;
export const AGENCIA_REGEX = /^\d{1,4}(-\d)?$/;

// ─── Saldo inicial com sinal ──────────────────────────────────────────────────
// Conta corrente pode abrir negativa (cheque especial). O sinal fica à frente do valor
// formatado ("-1.234,56"); qualquer "-" digitado deixa o valor negativo.

export function formatarSaldoComSinal(raw: string): string {
    const negativo = raw.includes("-");
    const corpo = formatValorBrInput(raw);
    if (!negativo) return corpo;
    return corpo ? `-${corpo}` : "-";
}

/** Inverte o sinal do valor exibido (botão ±). */
export function inverterSinalSaldo(display: string): string {
    const v = display.trim();
    if (!v) return "-";
    return v.startsWith("-") ? v.slice(1) : `-${v}`;
}

/** "-1.234,56" → "-1234.56"; vazio → "". Zero nunca sai com sinal. */
export function saldoBrParaApi(display: string): string {
    const v = brMoneyDisplayToApiString(display);
    if (!v) return "";
    return display.trim().startsWith("-") && v !== "0.00" ? `-${v}` : v;
}

/** "-1234.5" (API) → "-1.234,50" (campo). */
export function saldoApiParaBr(valor: string | number | null | undefined): string {
    const s = String(valor ?? "").trim();
    const corpo = apiValorToValorBr(s);
    return s.startsWith("-") && corpo && corpo !== "0,00" ? `-${corpo}` : corpo;
}

export const SALDO_REGEX = /^-?[\d.]*\d,\d{2}$/;

// ─── Conta duplicada ──────────────────────────────────────────────────────────

type DadosConta = {
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

export function mensagemContaDuplicada(nome?: string): string {
    return nome
        ? `Já existe a conta "${nome}" com este banco, agência e número de conta.`
        : "Já existe uma conta com este banco, agência e número de conta.";
}
