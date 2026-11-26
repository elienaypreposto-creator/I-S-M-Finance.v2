/**
 * Emissão de sessão compartilhada pelas rotas de login (senha e GovADM).
 *
 * Extraído de routes/auth.ts sem mudança de comportamento: o access token vai no
 * body (o frontend o mantém só em memória); o refresh token vai em cookie `rt`
 * HttpOnly; Secure; SameSite=Strict; Path=/api/auth.
 */

import type {Request, Response} from "express";
import {db} from "@workspace/db";
import {refreshTokensTable} from "@workspace/db/schema";
import {sessoes, type MetaSessao} from "./sessoes.service";
import {clientIp} from "../lib/client-ip";
import {assertVinculoAtivo} from "./tenant.service";
import {fetchPermissions} from "./permissions.service";
import {signAccessToken, signRefreshToken} from "./token.service";
import {successResponse} from "../utils/response";
import {LEGACY_REFRESH_BODY, setRefreshCookie} from "../utils/refresh-cookie";

export const SESSION_META = {
    tokenType: "Bearer",
    accessTokenExpiresIn: "15m",
    refreshTokenExpiresIn: "7d",
} as const;

/** Preenche req.tenant/req.user para a auditoria HTTP gravar a linha na empresa escolhida. */
export function attachTenantForAudit(
    req: Request,
    usuario: { id: number; email: string; superadmin: boolean },
    empresaId: number,
): void {
    req.tenant = {empresaId};
    req.user = {
        id: usuario.id,
        email: usuario.email,
        permissions: req.user?.permissions ?? [],
        empresaId,
        superadmin: usuario.superadmin,
    };
}

export function metaSessao(req: Request): MetaSessao {
    const ua = req.headers["user-agent"];
    return {
        userAgent: Array.isArray(ua) ? (ua[0] ?? null) : (ua ?? null),
        ip: clientIp(req),
    };
}

export async function emitSession(
    usuario: { id: number; nome: string; email: string; superadmin: boolean },
    empresaId: number,
    meta: MetaSessao,
    sidExistente?: string,
    login?: { acessoAnteriorDb?: Date | null },
) {
    await assertVinculoAtivo(usuario.id, empresaId);
    const permissions = await fetchPermissions(usuario.id, empresaId, usuario.superadmin);
    const refresh = await signRefreshToken({sub: String(usuario.id), email: usuario.email, empresa_id: empresaId});
    const sid = sidExistente
        ?? await sessoes.abrir({
            usuarioId: usuario.id,
            tokenHash: refresh.tokenHash,
            meta,
            login: login != null,
            acessoAnteriorDb: login?.acessoAnteriorDb ?? null,
        });
    if (sidExistente) {
        await sessoes.girar(sidExistente, refresh.tokenHash, meta);
    }
    const accessToken = await signAccessToken({
        sub: String(usuario.id),
        email: usuario.email,
        permissions,
        empresa_id: empresaId,
        superadmin: usuario.superadmin,
        sid,
    });

    await db.insert(refreshTokensTable).values({
        usuario_id: usuario.id,
        token_hash: refresh.tokenHash,
        expires_at: refresh.expiresAt,
        revogado: false,
    });

    return {
        accessToken,
        refreshToken: refresh.token,
        user: {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            empresa_id: empresaId,
            superadmin: usuario.superadmin
        },
        permissoes: permissions,
        empresa_id: empresaId,
    };
}

export type SessaoEmitida = Awaited<ReturnType<typeof emitSession>>;

/**
 * Envia a sessão: refresh token vai no cookie httpOnly; o body leva só o access token
 * (e, durante a transição, o refresh também - AUTH_LEGACY_REFRESH_BODY=true).
 */
export function sendSession(
    res: Response,
    session: SessaoEmitida,
    meta: Record<string, unknown>,
) {
    const {refreshToken, ...publicSession} = session;
    setRefreshCookie(res, refreshToken);
    return successResponse(res, LEGACY_REFRESH_BODY ? session : publicSession, meta);
}
