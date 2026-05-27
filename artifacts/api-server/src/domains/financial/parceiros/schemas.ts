import { z } from "zod";

const nullableId = z.coerce.number().int().positive().nullable().optional();

const chavePixSchema = z.object({
  tipo: z.string().trim().min(1),
  chave: z.string().trim().min(1),
});

const dadoBancarioSchema = z.object({
  banco: z.string().trim().min(1),
  agencia: z.string().trim().min(1),
  digito_agencia: z.string().trim().min(1).optional(),
  conta: z.string().trim().min(1),
  digito_conta: z.string().trim().min(1).optional(),
});

export const listParceirosQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  search: z.string().trim().min(1).optional(),
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
  chaves_pix: z.array(chavePixSchema).optional(),
  dados_bancarios: z.array(dadoBancarioSchema).optional(),
});

export const updateParceiroBodySchema = createParceiroBodySchema.partial();

export type ListParceirosQuery = z.infer<typeof listParceirosQuerySchema>;
export type CreateParceiroBody = z.infer<typeof createParceiroBodySchema>;
export type UpdateParceiroBody = z.infer<typeof updateParceiroBodySchema>;

