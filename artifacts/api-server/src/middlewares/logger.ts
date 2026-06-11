/**
 * auditLogger — Middleware de auditoria para requisições de mutação.
 *
 * Intercepta POST / PUT / PATCH / DELETE e grava um registro em `logs_auditoria`
 * de forma assíncrona (fire-and-forget via res.on("finish")), nunca bloqueando a
 * resposta da API.
 *
 * Campos sensíveis do body são mascarados antes da persistência para evitar que
 * senhas, tokens e OTPs sejam armazenados em texto plano no banco de auditoria.
 */

import type {NextFunction, Request, Response} from "express";
import {db} from "@workspace/db";
import {logsAuditoriaTable} from "@workspace/db/schema";

const SENSITIVE_KEYS = new Set([
    "senha",
    "senha_hash",
    "novaSenha",
    "password",
    "currentPassword",
    "newPassword",
    "otp",
    "token",
    "accessToken",
    "refreshToken",
    "setupToken",
    "resetToken",
    "secret",
]);

function sanitize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(sanitize);
    if (typeof value !== "object") return value;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEYS.has(k) ? "***MASKED***" : sanitize(v);
    }
    return out;
}

function extractIp(req: Request): string | null {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
        return first?.trim() ?? null;
    }
    return req.ip ?? req.socket.remoteAddress ?? null;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
    if (!MUTATION_METHODS.has(req.method)) {
        return next();
    }

    res.on("finish", () => {
        void db
            .insert(logsAuditoriaTable)
            .values({
                usuario_id: req.user?.id ?? null,
                acao: req.method,
                recurso: req.originalUrl,
                ip: extractIp(req),
                detalhes: sanitize(req.body) as Record<string, unknown>,
                status_code: res.statusCode,
            })
            .catch((err: unknown) => {
                console.error("[audit] Falha ao gravar log de auditoria:", err);
            });
    });

    next();
};
