/**
 * CORS por allowlist + bloqueio de origem estranha em produção.
 *
 * Origens aceitas:
 * - as de `CORS_ORIGINS` (lista separada por vírgula) e a de `FRONTEND_URL`;
 * - a própria origem da requisição (host do header `Origin` igual ao `Host`):
 *   o front é servido pelo mesmo nginx que faz proxy de /api, então é
 *   same-origin e não pode depender de env para funcionar.
 *
 * Requisição sem `Origin` (curl, server-to-server, API v1, healthcheck, GET de
 * navegação) passa: CORS só se aplica a navegador.
 *
 * Fail-closed: em produção, `Origin` presente e fora da lista -> 403 antes de
 * qualquer rota (inclusive preflight). Sem isso, um POST "simples" vindo de
 * outro site (form/urlencoded) seria executado mesmo sem o navegador conseguir
 * ler a resposta. Fora de produção só omite os headers CORS (o proxy do Vite
 * reescreve o Host, e o dev precisa de liberdade).
 */

import cors from "cors";
import type {NextFunction, Request, RequestHandler, Response} from "express";
import {errorResponse} from "../utils/response";

const toOrigin = (value: string): string | null => {
    try {
        const origin = new URL(value).origin;
        return origin === "null" ? null : origin;
    } catch {
        return null;
    }
};

/** Normaliza `CORS_ORIGINS` + `FRONTEND_URL` para o formato do header Origin. */
export function parseAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
    const raw = [env.CORS_ORIGINS ?? "", env.FRONTEND_URL ?? ""].join(",");
    const origins = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(toOrigin)
        .filter((o): o is string => o !== null);
    return [...new Set(origins)];
}

/** `Origin` aponta para o mesmo host que recebeu a requisição (same-origin). */
export function isSameHost(origin: string, host: string | undefined): boolean {
    if (!host) return false;
    try {
        return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
    } catch {
        return false;
    }
}

export interface CorsPolicyOptions {
    allowedOrigins: string[];
    /** true = 403 para origem fora da lista (produção). */
    enforce: boolean;
}

export function originPermitida(origin: string, host: string | undefined, allowed: string[]): boolean {
    return allowed.includes(origin) || isSameHost(origin, host);
}

export function corsPolicy({allowedOrigins, enforce}: CorsPolicyOptions): RequestHandler[] {
    const guard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
        const origin = req.headers.origin;
        if (!origin || !enforce) return next();
        if (originPermitida(origin, req.headers.host, allowedOrigins)) return next();
        return errorResponse(res, 403, "ORIGIN_NOT_ALLOWED", "Origem não permitida.");
    };

    const corsMw = cors((req, cb) => {
        const origin = req.headers.origin;
        cb(null, {
            origin: !origin || originPermitida(origin, req.headers.host, allowedOrigins),
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-Id"],
            exposedHeaders: ["X-Request-Id"],
        });
    });

    return [guard, corsMw];
}
