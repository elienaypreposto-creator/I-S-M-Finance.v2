import type { NextFunction, Request, Response } from "express";
import { errorResponse } from "../utils/response";
import type { EscopoV1 } from "@workspace/db/schema";

/**
 * Exige que o token da API v1 (populado por v1AuthMiddleware em
 * req.apiToken) tenha o escopo informado. Deve ser usado DEPOIS de
 * v1AuthMiddleware na cadeia de middlewares da rota.
 */
export const withScope = (escopoNecessario: EscopoV1 | string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const escopos = req.apiToken?.escopos ?? [];
    if (!escopos.includes(escopoNecessario)) {
      return errorResponse(
        res,
        403,
        "FORBIDDEN",
        `Token da API v1 não possui o escopo '${escopoNecessario}'.`,
      );
    }
    return next();
  };
};