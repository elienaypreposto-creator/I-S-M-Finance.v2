import {z} from "zod";

const nullableId = z.coerce.number().int().positive().nullable().optional();

// Esquema de chave PIX legado
const chavePixSchema = z.object({
    tipo: z.string().trim().min(1),
    chave: z.string().trim().min(1),
});

/**
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
});

export const parceiroIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const createParceiroBodySchema = z.object({
    tipo_pessoa: z.string().trim().min(1),
    cpf_cnpj: z.string().trim().min(1).nullable().optional(),
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
    // Lifecycle status - "ativo" (default) ou "inativo" (deleção lógica)
    status: z.enum(["ativo", "inativo"]).default("ativo").optional(),
    chaves_pix: z.array(chavePixSchema).optional(),
    dados_bancarios: z.array(dadoBancarioSchema).optional(),
});

// Todos os campos são opcionais para atualizações PATCH
export const updateParceiroBodySchema = createParceiroBodySchema.partial();

export type ListParceirosQuery = z.infer<typeof listParceirosQuerySchema>;
export type CreateParceiroBody = z.infer<typeof createParceiroBodySchema>;
export type UpdateParceiroBody = z.infer<typeof updateParceiroBodySchema>;
export type DadoBancario = z.infer<typeof dadoBancarioSchema>;
