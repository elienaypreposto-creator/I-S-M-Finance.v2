/**
 * withAuth - middleware de autenticação via JWE.
 *
 * Decifra o token localmente e consulta a denylist no Redis (~0,3 ms, sem banco).
 *
 * Revogação imediata: bloqueio de usuário, desativação de vínculo e reuso de
 * refresh gravam `denylist:user:<id>` com o instante da revogação; tokens
 * emitidos até esse instante (iat <= revogadoEm) são recusados. Tokens de um
 * novo login (iat posterior) passam.
 *
 * Fail-open: se o Redis estiver indisponível, a API segue funcionando com o
 * trade-off antigo (token válido até o fim do TTL, máx 15 min) e emite alerta.
 * Ver services/denylist.service.ts.
 */

import type {NextFunction, Request, Response} from "express";
import type {AccessTokenPayload} from "../services/token.service";
import {verifyAccessToken} from "../services/token.service";
import {getUserRevokedAt} from "../services/denylist.service";

export type AuthUser = {
    id: number;
    email: string;
    permissions: string[];
    empresaId: number;
    /** NOVO — Card 2 (Permissões). Ver AccessTokenPayload.superadmin. */
    superadmin: boolean;
};

declare global {
    namespace Express {
        interface Request {
            id: string;
            user?: AuthUser;
            tenant?: { empresaId: number };
            tokenApiId?: number;
            auditAntes?: unknown;
            auditStartedAt?: number;
        }
    }
}

const jsonError = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({data: null, meta: null, errors: [{code, message}]});

const extractBearerToken = (authHeader?: string): string | null => {
    if (!authHeader) return null;
    const parts = authHeader.split(" ");
    return parts[0] === "Bearer" && parts[1] ? parts[1] : null;
};

export const withAuth = async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
        return jsonError(res, 401, "UNAUTHORIZED", "Token de autenticação ausente ou inválido.");
    }

    let payload: AccessTokenPayload;
    try {
        payload = await verifyAccessToken(token);
    } catch {
        return jsonError(res, 401, "UNAUTHORIZED", "Token expirado ou inválido.");
    }

    const id = parseInt(payload.sub, 10);
    if (isNaN(id)) {
        return jsonError(res, 401, "UNAUTHORIZED", "Token malformado: sub inválido.");
    }

    const empresaId = payload.empresa_id;
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
        return jsonError(res, 401, "UNAUTHORIZED", "Sessão sem empresa. Faça login novamente.");
    }

    const revogadoEm = await getUserRevokedAt(id);
    if (revogadoEm !== null) {
        const iat = payload.iat;
        if (typeof iat !== "number" || iat <= revogadoEm) {
            return jsonError(res, 401, "SESSION_REVOKED", "Sessão revogada. Faça login novamente.");
        }
    }

    req.user = {
        id,
        email: payload.email,
        permissions: payload.permissions,
        empresaId,
        superadmin: payload.superadmin,
    };
    return next();
};

export const authMiddleware = withAuth;