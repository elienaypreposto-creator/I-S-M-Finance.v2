import { z } from "zod";

export const filialIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createFilialBodySchema = z.object({
  nome: z.string().trim().min(1),
});

export const updateFilialBodySchema = createFilialBodySchema;

export type CreateFilialBody = z.infer<typeof createFilialBodySchema>;
export type UpdateFilialBody = z.infer<typeof updateFilialBodySchema>;
