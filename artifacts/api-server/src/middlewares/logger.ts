/**
 * Middleware de auditoria HTTP.
 *
 * Intercepta POST / PUT / PATCH / DELETE (e todo /api/v1) e grava de forma assíncrona
 * no evento res.on("finish"), nunca bloqueando a resposta.
 *
 * logs_auditoria exige empresa_id NOT NULL. Rotas pre-tenant (login, refresh,
 * 401, OTP) não inserem nessa tabela e, quando aplicável, vão para
 * logs_sistema (global).
 *
 * select-empresa / switch-empresa bem-sucedidos usam o empresa_id escolhido.
 * INSERT de auditoria ocorre dentro de withTenantTx (SET LOCAL).
 *
 * Campos sensíveis do body são mascarados antes da persistência para evitar
 * que senhas, tokens e OTPs sejam armazenados em texto plano no banco.
 */

import type {NextFunction, Request, Response} from "express";
import crypto from "crypto";
import {db, withTenantTx, type TenantDb} from "@workspace/db";
import {logsAuditoriaTable, logsSistemaTable} from "@workspace/db/schema";
import {isAuthGlobalPath, resolveAuditEmpresaId} from "../lib/audit-scope";
import {isApiV1Path, shouldAuditRequest} from "../lib/audit-routes";
import {identidadeAuditoria} from "../lib/api-token-identity";
import {auditRequestId} from "./request-id";
import {clientIp} from "../lib/client-ip";

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

    if (Array.isArray(value)) {
        return value.map(sanitize);
    }

    if (typeof value !== "object") {
        return value;
    }

    const out: Record<string, unknown> = {};

    for (const [key, currentValue] of Object.entries(
        value as Record<string, unknown>,
    )) {
        out[key] = SENSITIVE_KEYS.has(key)
            ? "***MASKED***"
            : sanitize(currentValue);
    }

    return out;
}

/** IP real do cliente (resolvido por `trust proxy`); não lê `X-Forwarded-For` à mão. */
export function extractIp(req: Request): string | null {
    return clientIp(req);
}

function buildDetalhes(req: Request): Record<string, unknown> {
    const body = sanitize(req.body);

    const base =
        body &&
        typeof body === "object" &&
        !Array.isArray(body)
            ? {...(body as Record<string, unknown>)}
            : body !== undefined
              ? {body}
              : {};

    if (req.auditAntes !== undefined) {
        return {
            ...base,
            antes: sanitize(req.auditAntes),
        };
    }

    return base;
}

function writeSistema(req: Request, res: Response, servico = "auth"): void {
    void db
        .insert(logsSistemaTable)
        .values({
            servico,
            mensagem: `${req.method} ${req.originalUrl} → ${res.statusCode}`,
            detalhes: {
                ip: extractIp(req),
                status_code: res.statusCode,
                body: sanitize(req.body),
            },
        })
        .catch((err: unknown) => {
            console.error(
                "[audit] Falha ao gravar log de sistema:",
                err,
            );
        });
}

function writeAuditoria(
    req: Request,
    res: Response,
    empresaId: number,
    startedAt: number,
): void {
    const requestId = auditRequestId(req.id);

    const uaRaw = req.headers["user-agent"];
    const userAgent = Array.isArray(uaRaw)
        ? uaRaw[0]
        : uaRaw;

    void withTenantTx(
        empresaId,
        async (tx: TenantDb) => {
            await tx.insert(logsAuditoriaTable).values({
                empresa_id: empresaId,
                // Chamada por token v1: usuario_id null + token_api_id (nunca o id do token como usuário).
                ...identidadeAuditoria(req),
                acao: req.method,
                recurso: req.originalUrl,
                ip: extractIp(req),
                detalhes: buildDetalhes(req),
                status_code: res.statusCode,
                request_id: requestId,
                user_agent: userAgent ?? null,
                duracao_ms: Math.max(
                    0,
                    Date.now() - startedAt,
                ),
            });
        },
        {isolated: true},
    ).catch((err: unknown) => {
        console.error(
            "[audit] Falha ao gravar log de auditoria:",
            err,
        );
    });
}

export const auditLogger = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const startedAt = Date.now();

    req.auditStartedAt = startedAt;

    if (
        !shouldAuditRequest(
            req.method,
            req.originalUrl ?? req.path ?? "",
        )
    ) {
        return next();
    }

    res.on("finish", () => {
        const empresaId = resolveAuditEmpresaId(
            req,
            res.statusCode,
        );

        if (empresaId) {
            writeAuditoria(
                req,
                res,
                empresaId,
                startedAt,
            );
            return;
        }

        if (
            isAuthGlobalPath(
                req.originalUrl ?? req.path ?? "",
            )
        ) {
            writeSistema(req, res);
            return;
        }

        // v1 recusada antes de resolver o token (401/formato): sem empresa, vai para logs_sistema.
        if (isApiV1Path(req.originalUrl ?? req.path ?? "")) {
            writeSistema(req, res, "api-v1");
            return;
        }

        console.warn(
            `[audit] sem contexto de empresa - log não gravado (${req.method} ${req.originalUrl})`,
        );
    });

    next();
};