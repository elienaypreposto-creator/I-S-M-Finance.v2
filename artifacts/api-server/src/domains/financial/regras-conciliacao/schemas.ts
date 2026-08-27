import {z} from "zod";

const nullableId = z.coerce.number().int().positive().nullable().optional();

export const regraConciliacaoIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const listRegrasConciliacaoQuerySchema = z.object({
    conta_id: z.coerce.number().int().positive().optional(),
    natureza: z.enum(["entrada", "saida"]).optional(),
    ativo: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === true || v === "true")),
});

const regraConciliacaoBaseSchema = z
    .object({
        conta_id: nullableId,
        texto_gatilho: z.string().trim().min(1, "Informe o texto que dispara a regra."),
        tipo_match: z.enum(["contem", "inicia", "regex", "exato"]).default("contem"),
        natureza: z.enum(["entrada", "saida"]),
        plano_conta_id: nullableId,
        parceiro_id: nullableId,
        departamento_id: nullableId,
        centro_custo_id: nullableId,
        forma_pagamento: z.enum(["PIX", "TED", "Boleto"]).nullable().optional(),
        criar_lancamento_automatico: z.boolean().default(true),
        prioridade: z.coerce.number().int().min(0).default(0),
        ativo: z.boolean().default(true),
    })
    .superRefine((data, ctx) => {
        if (data.tipo_match === "regex") {
            try {
                new RegExp(data.texto_gatilho);
            } catch {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Expressão regular inválida.",
                    path: ["texto_gatilho"],
                });
            }
        }
    });

export const createRegraConciliacaoBodySchema = regraConciliacaoBaseSchema;
export const updateRegraConciliacaoBodySchema = regraConciliacaoBaseSchema;

export type ListRegrasConciliacaoQuery = z.infer<typeof listRegrasConciliacaoQuerySchema>;
export type CreateRegraConciliacaoBody = z.infer<typeof createRegraConciliacaoBodySchema>;
export type UpdateRegraConciliacaoBody = z.infer<typeof updateRegraConciliacaoBodySchema>;