/**
 * Perfil e senha da própria conta.
 * O usuário só altera nome, telefone e cargo. E-mail, superadmin, status
 * e permissões ficam de fora: o schema é strict e o update não espalha o body.
 */

import bcrypt from "bcryptjs";
import {z} from "zod";
import {validatePasswordPolicy, type PasswordPolicyContext} from "../utils/password-policy";

const textoOpcional = (max: number) =>
    z
        .string()
        .trim()
        .max(max)
        .nullable()
        .optional()
        .transform((v) => (v == null || v === "" ? null : v));

export const patchMeSchema = z
    .object({
        nome: z.string().trim().min(2, "Informe o nome.").max(120),
        telefone: textoOpcional(30),
        cargo: textoOpcional(80),
    })
    .strict();

export type PatchMe = z.infer<typeof patchMeSchema>;

export const trocaSenhaSchema = z
    .object({
        senha_atual: z.string().min(1),
        senha_nova: z.string().min(1),
    })
    .strict();

/** Mesma frase para senha atual errada e para conta bloqueada: não revela qual foi. */
export const MSG_SENHA_RECUSADA = "Não foi possível alterar a senha.";

export type RecusaSenha =
    | { ok: false; status: 400; code: "VALIDATION_ERROR"; message: string }
    | { ok: false; status: 400; code: "WEAK_PASSWORD"; message: string };

export type AceiteSenha = { ok: true };

export async function avaliarTrocaSenha(args: {
    senhaAtual: string;
    senhaNova: string;
    senhaHash: string;
    bloqueado: boolean;
    ctx: PasswordPolicyContext;
    comparar?: (senha: string, hash: string) => Promise<boolean>;
    validar?: typeof validatePasswordPolicy;
}): Promise<RecusaSenha | AceiteSenha> {
    if (args.bloqueado) {
        return {ok: false, status: 400, code: "VALIDATION_ERROR", message: MSG_SENHA_RECUSADA};
    }
    const comparar = args.comparar ?? bcrypt.compare;
    const confere = await comparar(args.senhaAtual, args.senhaHash).catch(() => false);
    if (!confere) {
        return {ok: false, status: 400, code: "VALIDATION_ERROR", message: MSG_SENHA_RECUSADA};
    }
    const validar = args.validar ?? validatePasswordPolicy;
    const violacao = await validar(args.senhaNova, args.ctx);
    if (violacao) {
        return {ok: false, status: 400, code: "WEAK_PASSWORD", message: violacao.message};
    }
    return {ok: true};
}
