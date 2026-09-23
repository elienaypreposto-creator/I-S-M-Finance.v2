/**
 * auditLogger - Middleware de auditoria para requisições de mutação.
 *
 * Intercepta POST / PUT / PATCH / DELETE e grava de forma assíncrona
 * (res.on("finish")), nunca bloqueando a resposta.
 *
 * logs_auditoria exige empresa_id NOT NULL. Rotas pre-tenant (login, refresh,
 * 401, OTP) NÃO inserem nessa tabela  vão para logs_sistema (global).
 * select-empresa / switch-empresa bem-sucedidos usam o empresa_id escolhido.
 */

import type {NextFunction, Request, Response} from "express";
import {db} from "@workspace/db";
import {logsAuditoriaTable, logsSistemaTable} from "@workspace/db/schema";
import {isAuthGlobalPath, resolveAuditEmpresaId} from "../lib/audit-scope";

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
    "selectionToken",
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

export function extractIp(req: Request): string | null {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
        return first?.trim() ?? null;
    }
    return req.ip ?? req.socket.remoteAddress ?? null;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function writeSistema(req: Request, res: Response): void {
    void db
        .insert(logsSistemaTable)
        .values({
            servico: "auth",
            mensagem: `${req.method} ${req.originalUrl} → ${res.statusCode}`,
            detalhes: {
                ip: extractIp(req),
                status_code: res.statusCode,
                body: sanitize(req.body),
            },
        })
        .catch((err: unknown) => {
            console.error("[audit] Falha ao gravar log de sistema:", err);
        });
}

function writeAuditoria(req: Request, res: Response, empresaId: number): void {
    void db
        .insert(logsAuditoriaTable)
        .values({
            empresa_id: empresaId,
            usuario_id: req.user?.id && req.user.id > 0 ? req.user.id : null,
            acao: req.method,
            recurso: req.originalUrl,
            ip: extractIp(req),
            detalhes: sanitize(req.body) as Record<string, unknown>,
            status_code: res.statusCode,
        })
        .catch((err: unknown) => {
            console.error("[audit] Falha ao gravar log de auditoria:", err);
        });
}

export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
    if (!MUTATION_METHODS.has(req.method)) {
        return next();
    }

    res.on("finish", () => {
        const empresaId = resolveAuditEmpresaId(req, res.statusCode);
        if (empresaId) {
            writeAuditoria(req, res, empresaId);
            return;
        }

        if (isAuthGlobalPath(req.originalUrl ?? req.path ?? "")) {
            writeSistema(req, res);
        }
    });

    next();
};
