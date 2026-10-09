/**
 * Headers de segurança da API (ISMF-2). Sem helmet: lista curta e explícita.
 *
 * HSTS vale porque o acesso público é sempre HTTPS (TLS termina no nginx de borda).
 */

import type {NextFunction, Request, Response} from "express";

export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
    "Strict-Transport-Security": HSTS_VALUE,
});

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
        res.setHeader(name, value);
    }
    next();
}
