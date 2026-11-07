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

/** GET /centros-custos: `departamento_id` opcional restringe aos centros do departamento. */
export const listCentrosCustosQuerySchema = z.object({
  departamento_id: z.coerce.number().int().positive().optional(),
});

export type ListCentrosCustosQuery = z.infer<typeof listCentrosCustosQuerySchema>;

export const centroCustoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** POST /centros-custos: todo centro de custo pertence a um departamento. */
export const createCentroCustoBodySchema = z.object({
  nome: z.string().trim().min(1),
  departamento_id: z.coerce.number().int().positive(),
});

/** PUT /centros-custos/:id: só o nome muda (o departamento fica). */
export const updateCentroCustoBodySchema = z.object({
  nome: z.string().trim().min(1),
});

export type CreateCentroCustoBody = z.infer<typeof createCentroCustoBodySchema>;
export type UpdateCentroCustoBody = z.infer<typeof updateCentroCustoBodySchema>;
