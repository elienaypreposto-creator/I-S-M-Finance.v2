import {z} from "zod";

const nullableId = z.coerce.number().int().positive().nullable().optional();

export const lancamentoStatusEnum = z.enum([
    "pendente",
    "pago",
    "recebido",
    "atrasado",
    "cancelado",
]);

// Schemas individuais de cada meio de pagamento
const pagamentoValorField = z.coerce
    .number({invalid_type_error: "Informe um valor numérico."})
    .positive("O valor deve ser maior que zero.");

const dadosPagamentoPixSchema = z.object({
    tipo: z.literal("PIX"),
    valor: pagamentoValorField,
    tipo_chave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
    chave: z.string().trim().min(1, "Informe a chave PIX."),
});

const dadosPagamentoTedSchema = z.object({
    tipo: z.literal("TED"),
    valor: pagamentoValorField,
    banco_codigo: z.string().trim().min(1, "Código do banco é obrigatório."),
    banco_nome: z.string().trim().min(1, "Nome do banco é obrigatório."),
    agencia: z.string().trim().min(1, "Agência é obrigatória."),
    conta: z.string().trim().min(1, "Conta é obrigatória."),
});

const dadosPagamentoBoletoSchema = z.object({
    tipo: z.literal("Boleto"),
    valor: pagamentoValorField,
    codigo_barras: z.string().trim().min(1, "Informe o código de barras."),
});

export const dadosPagamentoItemSchema = z.discriminatedUnion("tipo", [
    dadosPagamentoPixSchema,
    dadosPagamentoTedSchema,
    dadosPagamentoBoletoSchema,
]);

export const dadosPagamentoSchema = z.array(dadosPagamentoItemSchema);

export type DadosPagamentoItem = z.infer<typeof dadosPagamentoItemSchema>;
export type DadosPagamento = z.infer<typeof dadosPagamentoSchema>;

export const listLancamentosQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(20),
    tipo: z.enum(["CP", "CR"]).optional(),
    status: lancamentoStatusEnum.optional(),
    conta_id: z.coerce.number().int().positive().optional(),
    parceiro_id: z.coerce.number().int().positive().optional(),
    data_inicio: z.string().trim().min(1).optional(),
    data_fim: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
});

export const lancamentoIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

// Base schema (compartilhado entre create e update)

const lancamentoBaseSchema = z.object({
    tipo: z.enum(["CP", "CR"]),
    vencimento: z.string().trim().min(1),
    competencia: z.string().trim().min(1).nullable().optional(),
    conta_id: nullableId,
    parceiro_id: nullableId,
    descricao: z.string().trim().min(1).nullable().optional(),
    valor: z.union([z.string(), z.number()]).transform((v) => String(v)),
    status: lancamentoStatusEnum.optional(),
    plano_conta_id: nullableId,
    departamento_id: nullableId,
    centro_custo_id: nullableId,
    parcela_atual: z.coerce.number().int().positive().optional(),
    total_parcelas: z.coerce.number().int().positive().optional(),
    riscos: z.array(z.string()).optional(),
    forma_pagamento: z.enum(["PIX", "TED", "Boleto"]).nullable().optional(),
    dados_pagamento: dadosPagamentoSchema.nullable().optional(),
});

export const createLancamentoBodySchema = lancamentoBaseSchema;

export const updateLancamentoBodySchema = lancamentoBaseSchema.partial();

export type ListLancamentosQuery = z.infer<typeof listLancamentosQuerySchema>;
export type CreateLancamentoBody = z.infer<typeof createLancamentoBodySchema>;
export type UpdateLancamentoBody = z.infer<typeof updateLancamentoBodySchema>;
