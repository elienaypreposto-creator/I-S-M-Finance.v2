import { z } from "zod";

export const planoContaIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createPlanoContaBodySchema = z.object({
  tipo: z.string().trim().min(1),
  categoria: z.string().trim().min(1),
  subcategoria: z.string().trim().min(1).nullable().optional(),
  codigo: z.string().trim().min(1).nullable().optional(),
  ativo: z.boolean().optional(),
});

export const updatePlanoContaBodySchema = createPlanoContaBodySchema.partial();

export type CreatePlanoContaBody = z.infer<typeof createPlanoContaBodySchema>;
export type UpdatePlanoContaBody = z.infer<typeof updatePlanoContaBodySchema>;
