/**
 * Headers de segurança da API (ISMF-2 / ISMF-5). Sem helmet: lista curta e explícita.
 *
 * A API só devolve JSON/arquivos, então a CSP é fechada (`default-src 'none'`).
 * O front tem a própria CSP no nginx do ISM (nginx.conf). HSTS vale porque o
 * acesso público é sempre HTTPS (TLS termina no nginx de borda).
 */

import type {NextFunction, Request, Response} from "express";

export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
    "Strict-Transport-Security": HSTS_VALUE,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
});

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
        res.setHeader(name, value);
    }
    res.removeHeader("X-Powered-By");
    next();
}
