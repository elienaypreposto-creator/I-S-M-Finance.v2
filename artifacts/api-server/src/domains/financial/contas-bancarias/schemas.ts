import { z } from "zod";

const saldoMonetarioSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

export const contaBancariaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createContaBancariaBodySchema = z.object({
  tipo: z.string().trim().min(1),
  banco: z.string().nullable().optional(),
  agencia: z.string().nullable().optional(),
  digito_agencia: z.string().nullable().optional(),
  conta: z.string().nullable().optional(),
  digito_conta: z.string().nullable().optional(),
  nome: z.string().trim().min(1),
  empresa: z.string().nullable().optional(),
  saldo_inicial: saldoMonetarioSchema.optional(),
  data_inicio: z.string().trim().min(1),
  status: z.string().trim().min(1).optional(),
  cor: z.string().trim().min(1).optional(),
});

export const updateContaBancariaBodySchema = createContaBancariaBodySchema.partial();

export type CreateContaBancariaBody = z.infer<typeof createContaBancariaBodySchema>;
export type UpdateContaBancariaBody = z.infer<typeof updateContaBancariaBodySchema>;
