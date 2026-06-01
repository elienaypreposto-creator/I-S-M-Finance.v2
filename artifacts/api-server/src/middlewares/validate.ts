import type {NextFunction, Request, Response} from "express";
import type {ZodTypeAny} from "zod";
import {errorResponse} from "../utils/response";

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
                "Payload inválido.",
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
