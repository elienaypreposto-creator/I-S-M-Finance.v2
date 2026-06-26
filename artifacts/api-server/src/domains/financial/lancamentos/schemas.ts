import { z } from "zod";

const nullableId = z.coerce.number().int().positive().nullable().optional();

// ── Dados de Pagamento — discriminated union (Card 27) ────────────────────────

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
  linha_digitavel: z.string().trim().min(1, "Informe a linha digitável."),
  codigo_barras: z.string().trim().nullable().optional(),
});

export const dadosPagamentoSchema = z.discriminatedUnion("tipo", [
  dadosPagamentoPixSchema,
  dadosPagamentoTedSchema,
  dadosPagamentoBoletoSchema,
]);

export type DadosPagamento = z.infer<typeof dadosPagamentoSchema>;

// ── Query / Params ────────────────────────────────────────────────────────────

export const listLancamentosQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  tipo: z.enum(["CP", "CR"]).optional(),
  status: z.string().trim().min(1).optional(),
  conta_id: z.coerce.number().int().positive().optional(),
  parceiro_id: z.coerce.number().int().positive().optional(),
  data_inicio: z.string().trim().min(1).optional(),
  data_fim: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export const lancamentoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ── Create / Update ───────────────────────────────────────────────────────────

// Schema base isolado como z.object() puro para que .partial() continue disponível.
const lancamentoBaseSchema = z.object({
  tipo: z.enum(["CP", "CR"]),
  vencimento: z.string().trim().min(1),
  competencia: z.string().trim().min(1).nullable().optional(),
  conta_id: nullableId,
  parceiro_id: nullableId,
  descricao: z.string().trim().min(1).nullable().optional(),
  valor: z.union([z.string(), z.number()]).transform((v) => String(v)),
  status: z.string().trim().min(1).optional(),
  plano_conta_id: nullableId,
  departamento_id: nullableId,
  centro_custo_id: nullableId,
  parcela_atual: z.coerce.number().int().positive().optional(),
  total_parcelas: z.coerce.number().int().positive().optional(),
  riscos: z.array(z.string()).optional(),
  forma_pagamento: z.enum(["PIX", "TED", "Boleto"]).nullable().optional(),
  dados_pagamento: dadosPagamentoSchema.nullable().optional(),
});

// Validação cruzada para criação (campos obrigatórios presentes).
export const createLancamentoBodySchema = lancamentoBaseSchema.superRefine((data, ctx) => {
  if (data.tipo === "CP" && data.forma_pagamento && !data.dados_pagamento) {
    ctx.addIssue({
      code: "custom",
      message: "Informe os dados de pagamento para a forma selecionada.",
      path: ["dados_pagamento"],
    });
  }
  if (data.dados_pagamento && data.forma_pagamento && data.dados_pagamento.tipo !== data.forma_pagamento) {
    ctx.addIssue({
      code: "custom",
      message: "O tipo dos dados de pagamento não corresponde à forma declarada.",
      path: ["dados_pagamento"],
    });
  }
});

// Validação cruzada para atualização parcial (todos os campos podem ser undefined).
export const updateLancamentoBodySchema = lancamentoBaseSchema.partial().superRefine((data, ctx) => {
  // Só valida o par forma/dados quando ambos estão presentes no payload parcial.
  if (data.tipo === "CP" && data.forma_pagamento && !data.dados_pagamento) {
    ctx.addIssue({
      code: "custom",
      message: "Informe os dados de pagamento para a forma selecionada.",
      path: ["dados_pagamento"],
    });
  }
  if (data.dados_pagamento && data.forma_pagamento && data.dados_pagamento.tipo !== data.forma_pagamento) {
    ctx.addIssue({
      code: "custom",
      message: "O tipo dos dados de pagamento não corresponde à forma declarada.",
      path: ["dados_pagamento"],
    });
  }
});

export type ListLancamentosQuery = z.infer<typeof listLancamentosQuerySchema>;
export type CreateLancamentoBody = z.infer<typeof createLancamentoBodySchema>;
export type UpdateLancamentoBody = z.infer<typeof updateLancamentoBodySchema>;
