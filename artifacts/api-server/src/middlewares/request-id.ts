/**
 * requestId - primeiro middleware da cadeia (Card 95).
 *
 * Gera (ou reutiliza) um identificador por request, grava em `req.id` e
 * devolve no header `X-Request-Id` para o cliente/suporte correlacionar
 * com o log do servidor. Deve correr ANTES de qualquer outro middleware.
 */

import {randomUUID} from "node:crypto";
import type {NextFunction, Request, Response} from "express";

export const REQUEST_ID_HEADER = "X-Request-Id";

/** Rejeita IDs com whitespace / controlo - evita injeção em logs. */
const INCOMING_REQUEST_ID = /^[\w.:-]{8,128}$/;

declare global {
    namespace Express {
        interface Request {
            id: string;
        }
    }
}

export function resolveRequestId(incoming: string | string[] | undefined): string {
    const raw = Array.isArray(incoming) ? incoming[0] : incoming;
    const trimmed = raw?.trim();
    if (trimmed && INCOMING_REQUEST_ID.test(trimmed)) {
        return trimmed;
    }
    return randomUUID();
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
    const id = resolveRequestId(req.headers["x-request-id"]);
    req.id = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
}
