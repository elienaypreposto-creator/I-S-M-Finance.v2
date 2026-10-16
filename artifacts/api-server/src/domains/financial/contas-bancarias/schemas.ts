import { z } from "zod";

const saldoMonetarioSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

export const contaBancariaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** Tipos aceitos em contas novas. Mantenha igual a `TIPOS_CONTA` do front (validations/cadastros.schema.ts). */
export const TIPOS_CONTA_BANCARIA = [
  "Conta Corrente",
  "Conta Poupança",
  "Conta Movimento",
  "Conta Aplicação",
] as const;

export const createContaBancariaBodySchema = z.object({
  tipo: z.enum(TIPOS_CONTA_BANCARIA, {
    errorMap: () => ({ message: `Tipo de conta inválido. Use: ${TIPOS_CONTA_BANCARIA.join(", ")}.` }),
  }),
  banco: z.string().nullable().optional(),
  agencia: z.string().nullable().optional(),
  digito_agencia: z.string().nullable().optional(),
  conta: z.string().nullable().optional(),
  digito_conta: z.string().nullable().optional(),
  nome: z.string().trim().min(1),
  titular: z.string().nullable().optional(),
  /** Legado: o campo de texto da conta foi renomeado de `empresa` para `titular`. */
  empresa: z.string().nullable().optional(),
  saldo_inicial: saldoMonetarioSchema.optional(),
  data_inicio: z.string().trim().min(1),
  status: z.string().trim().min(1).optional(),
  cor: z.string().trim().min(1).optional(),
});

/**
 * Na edição o `tipo` chega como texto: contas antigas podem ter um valor fora do enum
 * (o formulário reenvia o tipo atual). O serviço só aceita um tipo fora da lista se for
 * igual ao já gravado; trocar para um tipo inventado é recusado.
 */
export const updateContaBancariaBodySchema = createContaBancariaBodySchema
  .partial()
  .extend({ tipo: z.string().trim().min(1).optional() });

export type CreateContaBancariaBody = z.infer<typeof createContaBancariaBodySchema>;
export type UpdateContaBancariaBody = z.infer<typeof updateContaBancariaBodySchema>;