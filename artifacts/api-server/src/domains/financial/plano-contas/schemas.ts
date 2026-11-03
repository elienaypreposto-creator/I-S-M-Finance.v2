import {z} from "zod";
import {GRUPOS_DRE} from "../../../utils/dre";

export const planoContaIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const createPlanoContaBodySchema = z.object({
    tipo: z.string().trim().min(1),
    categoria: z.string().trim().min(1),
    subcategoria: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z.string().trim().min(1).nullable().optional(),
    ),
    codigo: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z.string().trim().min(1).nullable().optional(),
    ),
    /** Linha da DRE; vazio/null = segue o tipo. */
    grupo_dre: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z.enum(GRUPOS_DRE, {message: "Linha da DRE inválida."}).nullable().optional(),
    ),
    ativo: z.boolean().optional(),
});

export const updatePlanoContaBodySchema = createPlanoContaBodySchema.partial();

export type CreatePlanoContaBody = z.infer<typeof createPlanoContaBodySchema>;
export type UpdatePlanoContaBody = z.infer<typeof updatePlanoContaBodySchema>;
