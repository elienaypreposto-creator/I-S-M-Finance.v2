/**
 * artifacts/api-server/src/utils/refresh-cookie.ts
 *
 * Gerencia o refresh token em cookie httpOnly e o guard de CSRF das rotas de auth.
 */

import type {Request, RequestHandler, Response} from "express";
import {errorResponse} from "./response";

export const REFRESH_COOKIE = "rt";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// TRANSIÇÃO: com "true", o refresh também volta no body da resposta e é aceito no body
// da requisição. Ligar no deploy da migração e remover (junto com o fallback de
// readRefreshToken) na versão seguinte.
export const LEGACY_REFRESH_BODY = process.env.AUTH_LEGACY_REFRESH_BODY === "true";

// Secure por padrão fora de desenvolvimento; COOKIE_SECURE=true|false sobrescreve
// (ex.: COOKIE_SECURE=false para testar via http://IP-da-rede no celular)
const COOKIE_SECURE = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV !== "development";

const baseOptions = () => ({
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "strict" as const,
    path: "/api/auth",
});

export const setRefreshCookie = (res: Response, token: string) =>
    res.cookie(REFRESH_COOKIE, token, {...baseOptions(), maxAge: SEVEN_DAYS_MS});

// clearCookie precisa do mesmo path/flags do Set-Cookie original
export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, baseOptions());

export function readRefreshToken(req: Request): string | null {
    const fromCookie = req.cookies?.[REFRESH_COOKIE];
    if (typeof fromCookie === "string" && fromCookie) return fromCookie;

    // TRANSIÇÃO: remover na versão seguinte
    if (LEGACY_REFRESH_BODY && typeof req.body?.refreshToken === "string") {
        return req.body.refreshToken;
    }
    return null;
}

/**
 * CSRF: formulários cross-site não conseguem setar header custom, e fetch
 * cross-origin com header custom exige preflight (bloqueado pela allowlist de CORS).
 * Só exige o header quando o cookie está presente, pois é ele que autentica a requisição.
 */
export const csrfGuard: RequestHandler = (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.cookies?.[REFRESH_COOKIE]) return next();

    if (req.get("x-requested-with") !== "XMLHttpRequest") {
        return errorResponse(res, 403, "CSRF_REJECTED", "Requisição rejeitada.");
    }
    next();
};