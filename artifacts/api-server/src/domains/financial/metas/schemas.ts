import { z } from "zod";

/** Ano civil usado em fechamento mensal e relatórios (intervalo explícito evita lixo na base). */
const anoCivilSchema = z.coerce.number().int().min(2000).max(2100);

/** Mês de competência: 1 = janeiro … 12 = dezembro. */
const mesCompetenciaSchema = z.coerce.number().int().min(1).max(12);

const valorProjetadoSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

export const listMetasQuerySchema = z.object({
  ano: anoCivilSchema,
});

export const upsertMetaBodySchema = z.object({
  plano_conta_id: z.coerce.number().int().positive(),
  ano: anoCivilSchema,
  mes: mesCompetenciaSchema,
  valor_projetado: valorProjetadoSchema,
});

export type ListMetasQuery = z.infer<typeof listMetasQuerySchema>;
export type UpsertMetaBody = z.infer<typeof upsertMetaBodySchema>;
