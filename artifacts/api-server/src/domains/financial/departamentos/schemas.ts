import { z } from "zod";

export const departamentoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createDepartamentoBodySchema = z.object({
  nome: z.string().trim().min(1),
});

/** PUT substitui o cadastro; único campo persistido é `nome`. */
export const updateDepartamentoBodySchema = createDepartamentoBodySchema;

export type CreateDepartamentoBody = z.infer<typeof createDepartamentoBodySchema>;
export type UpdateDepartamentoBody = z.infer<typeof updateDepartamentoBodySchema>;
