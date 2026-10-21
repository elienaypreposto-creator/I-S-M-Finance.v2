import {z} from "zod";

const nullableId = z.coerce.number().int().positive().nullable().optional();

export const lancamentoStatusEnum = z.enum([
    "pendente",
    "pago",
    "recebido",
    "atrasado",
    "cancelado",
    "pago_parcial",
]);

export const tipoDocumentoLancamentoEnum = z.enum([
    "nota_fiscal",
    "boleto",
    "fatura",
    "recibo",
    "contrato",
    "guia_imposto",
    "folha",
    "outros",
]);

function textoOpcional(max: number) {
    return z
        .union([z.string().trim().max(max), z.null()])
        .optional()
        .transform((v) => {
            if (v === undefined) return undefined;
            if (v === null || v === "") return null;
            return v;
        });
}

const dadosPagamentoPixSchema = z.object({
    tipo: z.literal("PIX"),
    tipo_chave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
    chave: z.string().trim().min(1, "Informe a chave PIX."),
});

const dadosPagamentoTedSchema = z.object({
    tipo: z.literal("TED"),
    banco_codigo: z.string().trim().min(1, "Código do banco é obrigatório."),
    banco_nome: z.string().trim().min(1, "Nome do banco é obrigatório."),
    agencia: z.string().trim().min(1, "Agência é obrigatória."),
    conta: z.string().trim().min(1, "Conta é obrigatória."),
});

const dadosPagamentoBoletoSchema = z.object({
    tipo: z.literal("Boleto"),
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

/** `status=pendente,atrasado` → ["pendente", "atrasado"]; cada valor validado no enum. */
const statusCsvSchema = z
    .string()
    .trim()
    .min(1)
    .transform((s) => Array.from(new Set(s.split(",").map((v) => v.trim()).filter(Boolean))))
    .pipe(z.array(lancamentoStatusEnum).min(1));

const idFiltro = z.coerce.number().int().positive().optional();
const valorFiltro = z.coerce.number().finite().min(0).optional();

/** Filtros comuns à listagem paginada e ao export. */
const filtrosLancamentosSchema = z.object({
    tipo: z.enum(["CP", "CR"]).optional(),
    status: statusCsvSchema.optional(),
    conta_id: idFiltro,
    parceiro_id: idFiltro,
    plano_conta_id: idFiltro,
    departamento_id: idFiltro,
    centro_custo_id: idFiltro,
    valor_min: valorFiltro,
    valor_max: valorFiltro,
    data_inicio: z.string().trim().min(1).optional(),
    data_fim: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).max(120).optional(),
});

function faixaDeValorValida(q: { valor_min?: number; valor_max?: number }, ctx: z.RefinementCtx) {
    if (q.valor_min !== undefined && q.valor_max !== undefined && q.valor_min > q.valor_max) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["valor_max"],
            message: "valor_min não pode ser maior que valor_max.",
        });
    }
}

export const listLancamentosQuerySchema = filtrosLancamentosSchema
    .extend({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(200).default(20),
    })
    .superRefine(faixaDeValorValida);

/** Teto do export: o arquivo traz no máximo isso e avisa quando o filtro tem mais. */
export const LIMITE_EXPORT_LANCAMENTOS = 10_000;

export const exportLancamentosQuerySchema = filtrosLancamentosSchema.superRefine(faixaDeValorValida);

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
    tipo_documento: z
        .union([tipoDocumentoLancamentoEnum, z.null(), z.literal("")])
        .optional()
        .transform((v) => {
            if (v === undefined) return undefined;
            if (v === null || v === "") return null;
            return v;
        }),
    numero_documento: textoOpcional(60),
    observacao: textoOpcional(1000),
    valor: z.union([z.string(), z.number()]).transform((v) => String(v)),
    // Ajustam o valor líquido do título (editáveis no fluxo de edição da aba
    // Lançamentos) sem alterar o valor de face (`valor`) acima. Sem essas
    // duas linhas, o Zod descarta silenciosamente `desconto`/`juros` do
    // body antes de chegar no service - o valor enviado pelo front nunca
    // era persistido e a coluna sempre ficava no default "0" do banco.
    desconto: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
    juros: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
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
export type FiltrosLancamentos = z.infer<typeof exportLancamentosQuerySchema>;
export type CreateLancamentoBody = z.infer<typeof createLancamentoBodySchema>;
export type UpdateLancamentoBody = z.infer<typeof updateLancamentoBodySchema>;