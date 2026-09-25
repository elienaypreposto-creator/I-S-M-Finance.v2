/**
 * Primeiro middleware da cadeia: gera ou reutiliza o id da request,
 * grava em req.id e ecoa X-Request-Id.
 */

import {randomUUID} from "node:crypto";
import type {NextFunction, Request, Response} from "express";

export const REQUEST_ID_HEADER = "X-Request-Id";

/** Rejeita IDs com whitespace ou controlo para evitar injeção em logs. */
export const REQUEST_ID_PATTERN = /^[\w.:-]{8,128}$/;

declare global {
    namespace Express {
        interface Request {
            id: string;
        }
    }
}

/** Persiste o mesmo valor que o header X-Request-Id (não só UUID). */
export function auditRequestId(id: string | undefined): string | null {
    if (!id) return null;
    return REQUEST_ID_PATTERN.test(id) ? id : null;
}

export function resolveRequestId(incoming: string | string[] | undefined): string {
    const raw = Array.isArray(incoming) ? incoming[0] : incoming;
    const trimmed = raw?.trim();
    if (trimmed && REQUEST_ID_PATTERN.test(trimmed)) {
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
