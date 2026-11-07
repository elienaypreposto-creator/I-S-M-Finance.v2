import {z} from "zod";
import {cnpjValido, cpfValido, erroDocumento, tipoPorDocumento} from "../../../utils/documento";

const nullableId = z.coerce.number().int().positive().nullable().optional();

/**
 * Fonte única de verdade para dados bancários de parceiros.
 * todo o tráfego de dados bancários usa este discriminatedUnion.
 *
 * PIX - requer tipo_chave e chave.
 * TED - requer banco_codigo, banco_nome, agencia e conta.
 */
const dadoBancarioSchema = z.discriminatedUnion("tipo", [
    z.object({
        tipo: z.literal("PIX"),
        tipo_chave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
        chave: z.string().trim().min(1, "Chave PIX é obrigatória."),
    }),
    z.object({
        tipo: z.literal("TED"),
        banco_codigo: z.string().trim().min(1, "Código do banco é obrigatório."),
        banco_nome: z.string().trim().min(1, "Nome do banco é obrigatório."),
        agencia: z.string().trim().min(1, "Agência é obrigatória."),
        conta: z.string().trim().min(1, "Conta é obrigatória."),
    }),
]);

export const listParceirosQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(20),
    search: z.string().trim().min(1).optional(),
    status: z.enum(["ativo", "inativo"]).optional(),
    /** Um dos tipos do parceiro (coluna jsonb `tipos`), ex.: "Fornecedor". */
    tipo: z.string().trim().min(1).max(60).optional(),
    tipo_pessoa: z.enum(["PF", "PJ"]).optional(),

    // Quando "true", exclui parceiros que já estão vinculados a um usuário.
    excluir_com_usuario: z
        .string()
        .optional()
        .transform((v) => v === "true"),
});

export const parceiroIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

const parceiroBodySchema = z.object({
    tipo_pessoa: z.string().trim().min(1),
    // CNPJ alfanumérico é gravado em maiúsculas (mesma forma que o front envia).
    cpf_cnpj: z.string().trim().toUpperCase().min(1).nullable(),
    nome: z.string().trim().min(1),
    nome_fantasia: z.string().trim().min(1).nullable().optional(),
    email: z.string().trim().nullable().optional(),
    telefone: z.string().trim().nullable().optional(),
    forma_pagamento_preferencial: z.string().trim().nullable().optional(),
    tipos: z.array(z.string()).optional(),
    departamento_id: nullableId,
    centro_custo_id: nullableId,
    ativo: z.boolean().optional(),
    bloqueado: z.boolean().optional(),
    status: z.enum(["ativo", "inativo"]).default("ativo").optional(),
    dados_bancarios: z.array(dadoBancarioSchema).optional(),
});

type ParceiroBodyParcial = Partial<z.infer<typeof parceiroBodySchema>>;

/**
 * CPF/CNPJ do parceiro e chaves PIX do tipo CPF/CNPJ precisam ter dígito verificador válido.
 * Sem tipo_pessoa (edição parcial): com letra é CNPJ alfanumérico; senão 11 dígitos é CPF, 14 é CNPJ.
 */
function validarDocumentos(data: ParceiroBodyParcial, ctx: z.RefinementCtx) {
    const doc = data.cpf_cnpj?.trim();
    if (doc) {
        const tipo = data.tipo_pessoa === "PF" || data.tipo_pessoa === "PJ"
            ? data.tipo_pessoa
            : tipoPorDocumento(doc);
        const erro = erroDocumento(doc, tipo);
        if (erro) ctx.addIssue({code: z.ZodIssueCode.custom, message: erro, path: ["cpf_cnpj"]});
    }
    data.dados_bancarios?.forEach((item, i) => {
        if (item.tipo !== "PIX") return;
        if (item.tipo_chave === "cpf" && !cpfValido(item.chave)) {
            ctx.addIssue({code: z.ZodIssueCode.custom, message: "Chave PIX: CPF inválido.", path: ["dados_bancarios", i, "chave"]});
        } else if (item.tipo_chave === "cnpj" && !cnpjValido(item.chave)) {
            ctx.addIssue({code: z.ZodIssueCode.custom, message: "Chave PIX: CNPJ inválido.", path: ["dados_bancarios", i, "chave"]});
        }
    });
}

export const createParceiroBodySchema = parceiroBodySchema.superRefine(validarDocumentos);

export const updateParceiroBodySchema = parceiroBodySchema.partial().superRefine(validarDocumentos);

export type ListParceirosQuery = z.infer<typeof listParceirosQuerySchema>;
export type CreateParceiroBody = z.infer<typeof createParceiroBodySchema>;
export type UpdateParceiroBody = z.infer<typeof updateParceiroBodySchema>;
export type DadoBancario = z.infer<typeof dadoBancarioSchema>;