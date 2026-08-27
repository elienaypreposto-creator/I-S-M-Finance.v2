import {z} from "zod";

export const createTransferenciaBodySchema = z
    .object({
        conta_origem_id: z.coerce
            .number()
            .int()
            .positive("conta_origem_id deve ser um inteiro positivo."),
        conta_destino_id: z.coerce
            .number()
            .int()
            .positive("conta_destino_id deve ser um inteiro positivo."),
        valor: z
            .number()
            .positive("O valor deve ser maior que zero."),
        data: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD."),
        descricao: z.string().trim().min(1, "Descrição é obrigatória."),
    })
    .refine((d) => d.conta_origem_id !== d.conta_destino_id, {
        message: "A conta de origem e a conta de destino não podem ser a mesma.",
        path: ["conta_destino_id"],
    });

/**
 * Somente o valor, a data e a descricao podem ser alterados em uma transferência existente.
 * As contas de origem/destino são imutáveis após a criação.
 */
export const updateTransferenciaBodySchema = z
    .object({
        valor: z.number().positive("O valor deve ser maior que zero.").optional(),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD.").optional(),
        descricao: z.string().trim().min(1, "Descrição é obrigatória.").optional(),
    })
    .refine(
        (d) => d.valor !== undefined || d.data !== undefined || d.descricao !== undefined,
        {message: "Pelo menos um campo (valor, data ou descricao) deve ser informado."},
    );

export type CreateTransferenciaBody = z.infer<typeof createTransferenciaBodySchema>;
export type UpdateTransferenciaBody = z.infer<typeof updateTransferenciaBodySchema>;
