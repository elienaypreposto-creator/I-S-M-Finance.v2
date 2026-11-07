/**
 * CPF/CNPJ: máscara e dígito verificador. Mesma regra da API
 * (artifacts/api-server/src/utils/documento.ts).
 *
 * CNPJ alfanumérico (IN RFB 2.229/2024, emitido desde jul/2026): os 12 primeiros
 * caracteres são [0-9A-Z] e os 2 últimos (DV) seguem numéricos. O DV usa o mesmo
 * módulo 11 e os mesmos pesos, com cada caractere valendo (código ASCII − 48):
 * dígitos 0–9, 'A' = 17 … 'Z' = 42. CNPJ só numérico continua válido. CPF segue numérico.
 */

export type TipoPessoa = "PF" | "PJ";

export function somenteDigitos(valor: string | null | undefined): string {
    return String(valor ?? "").replace(/\D/g, "");
}

/** CNPJ sem máscara, em maiúsculas: só [0-9A-Z] ("12.abc.345/01de-35" → "12ABC34501DE35"). */
export function normalizarCnpj(valor: string | null | undefined): string {
    return String(valor ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Documento sem máscara conforme o tipo: CPF só dígitos, CNPJ alfanumérico em maiúsculas. */
export function normalizarDocumento(valor: string | null | undefined, tipo: TipoPessoa): string {
    return tipo === "PF" ? somenteDigitos(valor) : normalizarCnpj(valor);
}

export function mascararCpf(valor: string): string {
    return somenteDigitos(valor)
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/**
 * Máscara AA.AAA.AAA/AAAA-DD enquanto digita: aceita letras nas 12 primeiras posições
 * (convertidas para maiúsculas) e só dígitos nas 2 do DV.
 */
export function mascararCnpj(valor: string): string {
    let n = "";
    for (const c of normalizarCnpj(valor)) {
        if (n.length >= 14) break;
        if (n.length >= 12 && !/\d/.test(c)) continue;
        n += c;
    }
    const partes = [n.slice(0, 2), n.slice(2, 5), n.slice(5, 8), n.slice(8, 12), n.slice(12, 14)];
    const separadores = [".", ".", "/", "-"];
    let saida = partes[0]!;
    for (let i = 1; i < partes.length; i++) {
        if (!partes[i]) break;
        saida += separadores[i - 1] + partes[i];
    }
    return saida;
}

export function mascararDocumento(valor: string, tipo: TipoPessoa): string {
    return tipo === "PF" ? mascararCpf(valor) : mascararCnpj(valor);
}

/** CPF com 11 dígitos e dígitos verificadores corretos (recusa sequências como 111.111.111-11). */
export function cpfValido(valor: string | null | undefined): boolean {
    const n = somenteDigitos(valor);
    if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
    const dv = (base: string) => {
        let soma = 0;
        for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
    };
    const d1 = dv(n.slice(0, 9));
    const d2 = dv(n.slice(0, 10));
    return d1 === Number(n[9]) && d2 === Number(n[10]);
}

/**
 * CNPJ (numérico ou alfanumérico) com 14 caracteres e DV correto. Aceita máscara e
 * minúsculas; recusa sequências repetidas como 11.111.111/1111-11.
 */
export function cnpjValido(valor: string | null | undefined): boolean {
    const n = normalizarCnpj(valor);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(n) || /^(.)\1{13}$/.test(n)) return false;
    const dv = (base: string) => {
        const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        let soma = 0;
        for (let i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i]!;
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };
    const d1 = dv(n.slice(0, 12));
    const d2 = dv(n.slice(0, 13));
    return d1 === Number(n[12]) && d2 === Number(n[13]);
}

/**
 * Mensagem de erro do documento conforme o tipo de pessoa, ou null se válido.
 * Incompleto e dígito errado têm mensagens diferentes para o usuário saber o que corrigir.
 */
export function erroDocumento(valor: string, tipo: TipoPessoa): string | null {
    if (tipo === "PF") {
        const n = somenteDigitos(valor);
        if (n.length !== 11) return "CPF incompleto: informe os 11 dígitos.";
        return cpfValido(n) ? null : "CPF inválido: confira os dígitos.";
    }
    const n = normalizarCnpj(valor);
    if (n.length !== 14) return "CNPJ incompleto: informe os 14 caracteres.";
    if (!/^\d{2}$/.test(n.slice(12))) return "CNPJ inválido: os 2 últimos caracteres (DV) são números.";
    return cnpjValido(n) ? null : "CNPJ inválido: confira os dígitos.";
}
