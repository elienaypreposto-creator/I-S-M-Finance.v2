/**
 * withTenant - lê empresa_id do token, revalida o vínculo e seta req.tenant.
 *
 * Montar imediatamente após withAuth. Cache em memória com TTL curto (60s)
 * para não bater no banco em toda request; o trade-off é o mesmo espírito
 * dos 15 min do Access Token (vínculo desativado propaga no máximo em 60s
 * + refresh recusa de imediato).
 */

import type {NextFunction, Request, Response} from "express";
import {assertVinculoAtivo} from "../services/tenant.service";

const VINCULO_CACHE_TTL_MS = 60_000;
const vinculoCache = new Map<string, { ok: boolean; expiresAt: number }>();

function cacheKey(usuarioId: number, empresaId: number): string {
    return `${usuarioId}:${empresaId}`;
}

const jsonError = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({data: null, meta: null, errors: [{code, message}]});

export const withTenant = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return jsonError(res, 401, "UNAUTHORIZED", "Token de autenticação ausente ou inválido.");
    }

    const empresaId = req.user.empresaId;
    if (!empresaId || !Number.isInteger(empresaId) || empresaId <= 0) {
        return jsonError(res, 401, "UNAUTHORIZED", "Sessão sem empresa. Faça login novamente.");
    }

    const key = cacheKey(req.user.id, empresaId);
    const cached = vinculoCache.get(key);
    const now = Date.now();

    if (!cached || cached.expiresAt <= now) {
        try {
            await assertVinculoAtivo(req.user.id, empresaId);
            vinculoCache.set(key, {ok: true, expiresAt: now + VINCULO_CACHE_TTL_MS});
        } catch {
            vinculoCache.delete(key);
            return jsonError(res, 401, "UNAUTHORIZED", "Vínculo com a empresa inativo. Faça login novamente.");
        }
    }

    req.tenant = {empresaId};
    return next();
};

export function invalidateTenantCache(usuarioId: number, empresaId?: number): void {
    if (empresaId !== undefined) {
        vinculoCache.delete(cacheKey(usuarioId, empresaId));
        return;
    }
    for (const key of vinculoCache.keys()) {
        if (key.startsWith(`${usuarioId}:`)) vinculoCache.delete(key);
    }
}
