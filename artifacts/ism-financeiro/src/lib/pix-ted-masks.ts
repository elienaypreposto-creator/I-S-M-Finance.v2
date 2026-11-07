/**
 * Utilitários de máscara para campos PIX e TED (banco/agência/conta).
 */

import {mascararCnpj} from "./documento";

export type TipoChavePix = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

const ROTULO_TIPO_CHAVE: Record<TipoChavePix, string> = {
    cpf: "CPF",
    cnpj: "CNPJ",
    email: "E-mail",
    telefone: "Telefone",
    aleatoria: "Chave aleatória",
};

/** Chave PIX de documento do titular: CPF para pessoa física, CNPJ para jurídica. */
export function tipoChaveDocumento(tipoPessoa: "PF" | "PJ"): TipoChavePix {
    return tipoPessoa === "PF" ? "cpf" : "cnpj";
}

/**
 * Tipos de chave PIX oferecidos conforme o tipo de pessoa do parceiro: PF não tem chave
 * CNPJ e PJ não tem chave CPF. Um tipo já gravado fora da regra continua na lista para
 * a edição não apagar o dado sem o usuário ver.
 */
export function opcoesTipoChavePix(
    tipoPessoa: "PF" | "PJ",
    atual?: string,
): { value: TipoChavePix; label: string }[] {
    const doc = tipoChaveDocumento(tipoPessoa);
    const tipos: TipoChavePix[] = [doc, "email", "telefone", "aleatoria"];
    if ((atual === "cpf" || atual === "cnpj") && atual !== doc) tipos.splice(1, 0, atual);
    return tipos.map((value) => ({value, label: ROTULO_TIPO_CHAVE[value]}));
}

// Aplica a máscara correspondente ao tipo de chave PIX em tempo real no input
export function maskChavePix(value: string, tipo: string): string {
    switch (tipo) {
        case "cpf": {
            const n = value.replace(/\D/g, "").slice(0, 11);
            return n
                .replace(/(\d{3})(\d)/, "$1.$2")
                .replace(/(\d{3})(\d)/, "$1.$2")
                .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        }
        case "cnpj":
            // Numérico ou alfanumérico (IN RFB 2.229/2024): mesma máscara do cadastro.
            return mascararCnpj(value);
        case "telefone": {
            const n = value.replace(/\D/g, "").slice(0, 11);
            return n
                .replace(/(\d{2})(\d)/, "($1) $2")
                .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
        }
        case "email":
            return value.toLowerCase().slice(0, 255);
        case "aleatoria":
        default:
            return value.slice(0, 36);
    }
}

/** Comprimento máximo do input (incluindo caracteres de máscara). */
export function pixKeyMaxLength(tipo: string): number {
    switch (tipo) {
        case "cpf":
            return 14;
        case "cnpj":
            return 18;
        case "telefone":
            return 15;
        case "email":
            return 255;
        case "aleatoria":
            return 36;
        default:
            return 255;
    }
}

/** Texto de placeholder dinâmico baseado no tipo de chave. */
export function pixKeyPlaceholder(tipo: string): string {
    switch (tipo) {
        case "cpf":
            return "000.000.000-00";
        case "cnpj":
            return "00.000.000/0000-00";
        case "telefone":
            return "(00) 00000-0000";
        case "email":
            return "email@exemplo.com.br";
        case "aleatoria":
            return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
        default:
            return "Informe a chave PIX";
    }
}


/** Código do banco: somente 3 dígitos. */
export function mascararCodigoBanco(valor: string): string {
    return valor.replace(/\D/g, "").slice(0, 3);
}

/** Agência: até 5 dígitos com hífen antes do dígito verificador (ex: 1234-5). */
export function mascararAgencia(valor: string): string {
    const n = valor.replace(/\D/g, "").slice(0, 5);
    if (n.length <= 1) return n;
    return `${n.slice(0, -1)}-${n.slice(-1)}`;
}

/** Conta: até 13 dígitos com hífen antes do dígito verificador (ex: 000012345-6). */
export function mascararConta(valor: string): string {
    const n = valor.replace(/\D/g, "").slice(0, 13);
    if (n.length <= 1) return n;
    return `${n.slice(0, -1)}-${n.slice(-1)}`;
}
