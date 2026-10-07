/** Espelho das regras do backend (utils/password-policy.ts). A checagem de vazamento (HIBP) é só no backend. */

export const SENHA_MIN = 12;
export const SENHA_MAX_BYTES = 72;

export interface SenhaContexto {
    email?: string | null;
    nome?: string | null;
}

export interface RegraSenha {
    id: "len" | "max" | "email" | "nome";
    label: string;
    erro: string;
    ok: boolean;
}

export type NivelSenha = "vazia" | "fraca" | "boa" | "forte";

const normalizar = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const bytes = (v: string) => new TextEncoder().encode(v).length;

export function avaliarSenha(senha: string, ctx: SenhaContexto = {}) {
    const alvo = normalizar(senha);
    const tamanho = [...senha].length;

    const email = ctx.email ? normalizar(ctx.email.trim()) : "";
    const local = email.split("@")[0] ?? "";
    const contemEmail = !!email && (alvo.includes(email) || (local.length >= 4 && alvo.includes(local)));

    const nome = ctx.nome ? normalizar(ctx.nome.trim()) : "";
    const partes = nome.split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 4);
    const completo = nome.replace(/[^\p{L}\p{N}]+/gu, "");
    const contemNome = (completo.length >= 4 && alvo.includes(completo)) || partes.some((p) => alvo.includes(p));

    const regras: RegraSenha[] = [
        {
            id: "len",
            label: `Pelo menos ${SENHA_MIN} caracteres`,
            erro: `A senha é curta demais: use pelo menos ${SENHA_MIN} caracteres.`,
            ok: tamanho >= SENHA_MIN,
        },
        {
            id: "max",
            label: `No máximo ${SENHA_MAX_BYTES} bytes`,
            erro: `A senha é longa demais: o máximo é ${SENHA_MAX_BYTES} bytes (acentos e emojis ocupam mais de 1).`,
            ok: bytes(senha) <= SENHA_MAX_BYTES,
        },
    ];
    if (email) {
        regras.push({id: "email", label: "Não contém o seu e-mail", erro: "A senha não pode conter o seu e-mail.", ok: !contemEmail});
    }
    if (nome) {
        regras.push({id: "nome", label: "Não contém o seu nome", erro: "A senha não pode conter o seu nome.", ok: !contemNome});
    }

    const valida = regras.every((r) => r.ok);
    const nivel: NivelSenha = !senha ? "vazia" : !valida ? "fraca" : tamanho >= 16 ? "forte" : "boa";

    return {regras, valida, nivel, erro: regras.find((r) => !r.ok)?.erro ?? null};
}