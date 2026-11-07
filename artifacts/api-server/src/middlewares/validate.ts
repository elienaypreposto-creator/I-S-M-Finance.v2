import type {NextFunction, Request, Response} from "express";
import {defaultErrorMap, type ZodIssue, type ZodTypeAny} from "zod";
import {errorResponse} from "../utils/response";

export const MENSAGEM_PAYLOAD_INVALIDO = "Payload inválido.";

/** Mensagem escrita no schema (ex.: "Chave PIX: CPF inválido.") e não a padrão do Zod, em inglês. */
function mensagemEscrita(issue: ZodIssue): boolean {
    if (!issue.message?.trim()) return false;
    const padrao = defaultErrorMap(issue, {defaultError: issue.message, data: undefined}).message;
    return issue.message !== padrao && issue.message !== "Invalid input";
}

/**
 * Mensagem do 400 de validação: a primeira mensagem escrita nos schemas, para a tela
 * mostrar o motivo; sem nenhuma, cai no genérico "Payload inválido.". O código
 * (VALIDATION_ERROR) e os details por campo não mudam.
 */
export function mensagemDeValidacao(issues: readonly ZodIssue[]): string {
    return issues.find(mensagemEscrita)?.message ?? MENSAGEM_PAYLOAD_INVALIDO;
}

/**
 * Validates req.body against the given Zod schema using safeParse.
 *
 * On failure:  returns 400 using the standard { code, message, details } envelope,
 *              where details is an array of per-field errors ({ field, message }).
 * On success:  replaces req.body with the parsed (and stripped) data,
 *              providing automatic anti-mass-assignment protection because
 *              Zod's default object mode strips undeclared keys.
 */
export const validateBody = (schema: ZodTypeAny) =>
    (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            errorResponse(
                res,
                400,
                "VALIDATION_ERROR",
                mensagemDeValidacao(result.error.issues),
                result.error.issues.map((issue) => ({
                    field: issue.path.join(".") || "(root)",
                    message: issue.message,
                })),
            );
            return;
        }

        req.body = result.data;
        next();
    };
