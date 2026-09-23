/**
 * Auth Routes
 *
 * POST /auth/login              - Autentica; 1 empresa → tokens; N → selectionToken
 * POST /auth/select-empresa     - Emite sessão após escolha (selectionToken + empresa_id)
 * POST /auth/switch-empresa     - Troca empresa da sessão (revoga refresh, emite par novo)
 * POST /auth/refresh            - Renova tokens; recusa se o vínculo estiver inativo
 * POST /auth/logout             - Revoga o Refresh Token
 * GET  /auth/me                 - Perfil do utilizador autenticado
 * POST /auth/verify-otp         - Valida o OTP de boas-vindas; retorna setupToken
 * POST /auth/setup-password     - Define a senha permanente com setupToken
 * POST /auth/forgot-password    - Solicita recuperação de senha por e-mail
 * POST /auth/reset-password     - Redefine a senha com o resetToken
 * POST /auth/migrate-passwords  - [admin] Diagnóstico de hashes SHA-256 legados
 */

import {Router, type Request} from "express";
import bcrypt from "bcryptjs";
import {eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {permissoesTable, refreshTokensTable, usuariosTable} from "@workspace/db/schema";
import {sendPasswordResetEmail} from "../services/email.service";
import {revokeAllTokensForUser} from "../services/session.service";
import {assertVinculoAtivo, listEmpresasAtivasDoUsuario} from "../services/tenant.service";
import {invalidateTenantCache} from "../middlewares/tenant";
import {withAuth} from "../middlewares/auth";
import {withPermission} from "../middlewares/withPermission";
import {authLimiter, loginEmailLimiter, loginLimiter} from "../middlewares/rate-limit";
import {AppError} from "../utils/app-error";
import {errorResponse, successResponse} from "../utils/response";
import {
    generateOtp,
    hashToken,
    sha256Hash,
    signAccessToken,
    signPurposeToken,
    signRefreshToken,
    verifyPurposeToken,
    verifyRefreshToken,
} from "../services/token.service";

const BCRYPT_SALT_ROUNDS = 12;
const router = Router();

const fetchPermissions = async (usuarioId: number): Promise<string[]> => {
    const rows = await db
        .select({codigo_permissao: permissoesTable.codigo_permissao})
        .from(permissoesTable)
        .where(eq(permissoesTable.usuario_id, usuarioId));
    return rows.map((r) => r.codigo_permissao);
};

function attachTenantForAudit(
    req: Request,
    usuario: {id: number; email: string},
    empresaId: number,
): void {
    req.tenant = {empresaId};
    req.user = {
        id: usuario.id,
        email: usuario.email,
        permissions: req.user?.permissions ?? [],
        empresaId,
    };
}

async function emitSession(usuario: { id: number; nome: string; email: string }, empresaId: number) {
    await assertVinculoAtivo(usuario.id, empresaId);
    const permissions = await fetchPermissions(usuario.id);
    const [accessToken, {token: refreshToken, tokenHash, expiresAt}] = await Promise.all([
        signAccessToken({
            sub: String(usuario.id),
            email: usuario.email,
            permissions,
            empresa_id: empresaId,
        }),
        signRefreshToken({sub: String(usuario.id), email: usuario.email, empresa_id: empresaId}),
    ]);

    await db.insert(refreshTokensTable).values({
        usuario_id: usuario.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        revogado: false,
    });

    return {
        accessToken,
        refreshToken,
        user: {id: usuario.id, nome: usuario.nome, email: usuario.email, empresa_id: empresaId},
        permissoes: permissions,
        empresa_id: empresaId,
    };
}

router.post("/auth/login", loginLimiter, loginEmailLimiter, async (req, res) => {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
        const senha = typeof req.body?.senha === "string" ? req.body.senha : null;

        if (!email || !senha) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: email e senha.");
        }

        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                senha_hash: usuariosTable.senha_hash,
                bloqueado: usuariosTable.bloqueado,
                ultimo_acesso: usuariosTable.ultimo_acesso,
                senha_unica_utilizada: usuariosTable.senha_unica_utilizada,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.email, email))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            return errorResponse(res, 401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
        }

        let senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        let precisaMigrar = false;

        if (!senhaValida && sha256Hash(senha) === usuario.senha_hash) {
            senhaValida = true;
            precisaMigrar = true;
        }

        if (!senhaValida) {
            return errorResponse(res, 401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
        }

        // Migração SHA-256 -> bcrypt no primeiro login após a implantação
        if (precisaMigrar) {
            await db
                .update(usuariosTable)
                .set({senha_hash: await bcrypt.hash(senha, BCRYPT_SALT_ROUNDS), updated_at: new Date()})
                .where(eq(usuariosTable.id, usuario.id));
        }

        // Detecção de primeiro acesso
        // Critério: nunca fez login antes (ultimo_acesso === null) E não passou pelo fluxo OTP/definir-senha (senha_unica_utilizada === false).
        const ehPrimeiroAcesso =
            !usuario.ultimo_acesso && !usuario.senha_unica_utilizada;

        await db
            .update(usuariosTable)
            .set({ultimo_acesso: new Date()})
            .where(eq(usuariosTable.id, usuario.id));

        if (ehPrimeiroAcesso) {
            const setupToken = await signPurposeToken({
                sub: String(usuario.id),
                email: usuario.email,
                purpose: "password_setup",
            });

            return successResponse(
                res,
                {primeiroAcesso: true, setupToken, email: usuario.email},
                {message: "Primeiro acesso detectado. Por favor, defina uma nova senha."},
            );
        }

        const empresas = await listEmpresasAtivasDoUsuario(usuario.id);
        if (empresas.length === 0) {
            return errorResponse(res, 403, "SEM_EMPRESA", "Utilizador sem vínculo ativo com nenhuma empresa.");
        }

        if (empresas.length > 1) {
            const selectionToken = await signPurposeToken({
                sub: String(usuario.id),
                email: usuario.email,
                purpose: "empresa_select",
            });
            return successResponse(
                res,
                {
                    requiresEmpresaSelection: true,
                    selectionToken,
                    empresas,
                    user: {id: usuario.id, nome: usuario.nome, email: usuario.email},
                },
                {
                    message: "Selecione a empresa para emitir a sessão.",
                    ...(precisaMigrar ? {passwordMigrated: true} : {}),
                },
            );
        }

        const session = await emitSession(
            {id: usuario.id, nome: usuario.nome, email: usuario.email},
            empresas[0].id,
        );
        attachTenantForAudit(req, usuario, empresas[0].id);

        return successResponse(res, session, {
            tokenType: "Bearer",
            accessTokenExpiresIn: "15m",
            refreshTokenExpiresIn: "7d",
            ...(precisaMigrar ? {passwordMigrated: true} : {}),
        });
    } catch (error: unknown) {
        console.error("Erro no login:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no login.", error);
    }
});

router.post("/auth/refresh", async (req, res) => {
    try {
        const rawToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;
        if (!rawToken) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "refreshToken é obrigatório.");
        }

        let rtPayload: { sub: string; email: string; empresa_id: number };
        try {
            rtPayload = await verifyRefreshToken(rawToken);
        } catch {
            return errorResponse(res, 401, "INVALID_TOKEN", "Refresh token inválido ou expirado.");
        }

        const tokenHash = hashToken(rawToken);
        const usuarioId = parseInt(rtPayload.sub, 10);

        const [registro] = await db
            .select({
                id: refreshTokensTable.id,
                usuario_id: refreshTokensTable.usuario_id,
                revogado: refreshTokensTable.revogado,
                expires_at: refreshTokensTable.expires_at,
            })
            .from(refreshTokensTable)
            .where(eq(refreshTokensTable.token_hash, tokenHash))
            .limit(1);

        if (!registro) {
            return errorResponse(res, 401, "INVALID_TOKEN", "Refresh token inválido.");
        }

        // Reutilização de token revogado invalida toda a família para forçar novo login.
        if (registro.revogado) {
            await revokeAllTokensForUser(registro.usuario_id);
            console.warn(
                `[SECURITY] Token reuse detectado - usuario_id=${registro.usuario_id}. Família revogada.`,
            );
            return errorResponse(
                res,
                401,
                "TOKEN_REUSE_DETECTED",
                "Sessão invalidada por motivo de segurança. Faça login novamente.",
            );
        }

        // Dupla verificação de expiração: defensivo em relação a tokens não limpos do banco
        if (registro.expires_at < new Date()) {
            return errorResponse(res, 401, "INVALID_TOKEN", "Refresh token expirado.");
        }

        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                bloqueado: usuariosTable.bloqueado,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, usuarioId))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            await revokeAllTokensForUser(usuarioId);
            return errorResponse(res, 401, "UNAUTHORIZED", "Utilizador inválido ou bloqueado.");
        }

        try {
            await assertVinculoAtivo(usuario.id, rtPayload.empresa_id);
        } catch {
            await revokeAllTokensForUser(usuarioId);
            return errorResponse(res, 401, "UNAUTHORIZED", "Vínculo com a empresa inativo. Faça login novamente.");
        }

        await db
            .update(refreshTokensTable)
            .set({revogado: true})
            .where(eq(refreshTokensTable.id, registro.id));

        // Re-consulta permissões para propagar alterações feitas após o último login
        const permissions = await fetchPermissions(usuario.id);

        const [newAccessToken, {token: newRefreshToken, tokenHash: newHash, expiresAt}] =
            await Promise.all([
                signAccessToken({
                    sub: String(usuario.id),
                    email: usuario.email,
                    permissions,
                    empresa_id: rtPayload.empresa_id,
                }),
                signRefreshToken({
                    sub: String(usuario.id),
                    email: usuario.email,
                    empresa_id: rtPayload.empresa_id,
                }),
            ]);

        await db.insert(refreshTokensTable).values({
            usuario_id: usuario.id,
            token_hash: newHash,
            expires_at: expiresAt,
            revogado: false,
        });

        return successResponse(
            res,
            {accessToken: newAccessToken, refreshToken: newRefreshToken},
            {tokenType: "Bearer", accessTokenExpiresIn: "15m", refreshTokenExpiresIn: "7d"},
        );
    } catch (error: unknown) {
        console.error("Erro no refresh:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao renovar token.", error);
    }
});

router.post("/auth/select-empresa", loginLimiter, async (req, res) => {
    try {
        const selectionToken = typeof req.body?.selectionToken === "string" ? req.body.selectionToken : null;
        const empresaIdRaw = req.body?.empresa_id;
        const empresaId = typeof empresaIdRaw === "number" ? empresaIdRaw : Number(empresaIdRaw);

        if (!selectionToken || !Number.isInteger(empresaId) || empresaId <= 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: selectionToken e empresa_id.");
        }

        let tokenPayload: { sub: string; email: string };
        try {
            tokenPayload = await verifyPurposeToken(selectionToken, "empresa_select");
        } catch {
            return errorResponse(res, 401, "INVALID_TOKEN", "selectionToken inválido ou expirado.");
        }

        const usuarioId = parseInt(tokenPayload.sub, 10);
        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                bloqueado: usuariosTable.bloqueado,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, usuarioId))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            return errorResponse(res, 401, "UNAUTHORIZED", "Utilizador inválido ou bloqueado.");
        }

        const session = await emitSession(usuario, empresaId);
        attachTenantForAudit(req, usuario, empresaId);
        return successResponse(res, session, {
            tokenType: "Bearer",
            accessTokenExpiresIn: "15m",
            refreshTokenExpiresIn: "7d",
        });
    } catch (error: unknown) {
        if (error instanceof AppError) {
            return errorResponse(res, error.statusCode, error.code, error.message);
        }
        console.error("Erro em select-empresa:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao selecionar empresa.", error);
    }
});

router.post("/auth/switch-empresa", withAuth, async (req, res) => {
    try {
        const empresaIdRaw = req.body?.empresa_id;
        const empresaId = typeof empresaIdRaw === "number" ? empresaIdRaw : Number(empresaIdRaw);
        const rawRefresh = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;

        if (!Number.isInteger(empresaId) || empresaId <= 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campo obrigatório: empresa_id.");
        }

        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                bloqueado: usuariosTable.bloqueado,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, req.user!.id))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            return errorResponse(res, 401, "UNAUTHORIZED", "Utilizador inválido ou bloqueado.");
        }

        if (rawRefresh) {
            await db
                .update(refreshTokensTable)
                .set({revogado: true})
                .where(eq(refreshTokensTable.token_hash, hashToken(rawRefresh)));
        } else {
            await revokeAllTokensForUser(usuario.id);
        }

        invalidateTenantCache(usuario.id);
        const session = await emitSession(usuario, empresaId);
        attachTenantForAudit(req, usuario, empresaId);
        return successResponse(res, session, {
            tokenType: "Bearer",
            accessTokenExpiresIn: "15m",
            refreshTokenExpiresIn: "7d",
        });
    } catch (error: unknown) {
        if (error instanceof AppError) {
            return errorResponse(res, error.statusCode, error.code, error.message);
        }
        console.error("Erro em switch-empresa:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao trocar de empresa.", error);
    }
});

router.post("/auth/logout", async (req, res) => {
    try {
        const rawToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;
        if (rawToken) {
            await db
                .update(refreshTokensTable)
                .set({revogado: true})
                .where(eq(refreshTokensTable.token_hash, hashToken(rawToken)));
        }
        return successResponse(res, null, {message: "Logout realizado com sucesso."});
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no logout.", error);
    }
});

router.get("/auth/me", withAuth, async (req, res) => {
    try {
        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                cargo: usuariosTable.cargo,
                perfil_base: usuariosTable.perfil_base,
                telefone: usuariosTable.telefone,
                celular: usuariosTable.celular,
                bloqueado: usuariosTable.bloqueado,
                ultimo_acesso: usuariosTable.ultimo_acesso,
                created_at: usuariosTable.created_at,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, req.user!.id))
            .limit(1);

        if (!usuario) {
            return errorResponse(res, 404, "NOT_FOUND", "Utilizador não encontrado.");
        }

        const empresas = await listEmpresasAtivasDoUsuario(usuario.id);
        return successResponse(res, {
            user: {...usuario, empresa_id: req.user!.empresaId},
            permissoes: req.user!.permissions,
            empresas,
        });
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao obter utilizador autenticado.", error);
    }
});

router.post("/auth/verify-otp", authLimiter, async (req, res) => {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
        const otp = typeof req.body?.otp === "string" ? req.body.otp.trim().toUpperCase() : null;

        if (!email || !otp) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: email e otp.");
        }

        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                email: usuariosTable.email,
                senha_unica_hash: usuariosTable.senha_unica_hash,
                senha_unica_utilizada: usuariosTable.senha_unica_utilizada,
                bloqueado: usuariosTable.bloqueado,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.email, email))
            .limit(1);

        // Resposta genérica para não revelar se o e-mail existe
        if (!usuario || !usuario.senha_unica_hash) {
            return errorResponse(res, 400, "INVALID_OTP", "OTP inválido ou já utilizado.");
        }

        if (usuario.bloqueado) {
            return errorResponse(res, 403, "FORBIDDEN", "Conta bloqueada. Contacte o administrador.");
        }

        // Bloqueia reutilização de OTP já consumido
        if (usuario.senha_unica_utilizada) {
            return errorResponse(res, 400, "INVALID_OTP", "OTP inválido ou já utilizado.");
        }

        const otpValido = await bcrypt.compare(otp, usuario.senha_unica_hash);
        if (!otpValido) {
            return errorResponse(res, 400, "INVALID_OTP", "OTP inválido ou já utilizado.");
        }

        // Marca o OTP como utilizado - não pode ser reutilizado
        await db
            .update(usuariosTable)
            .set({senha_unica_utilizada: true})
            .where(eq(usuariosTable.id, usuario.id));

        const setupToken = await signPurposeToken({
            sub: String(usuario.id),
            email: usuario.email,
            purpose: "password_setup",
        });

        return successResponse(
            res,
            {setupToken},
            {expiresIn: "1h", message: "OTP válido. Use o setupToken para definir a sua senha."},
        );
    } catch (error: unknown) {
        console.error("Erro em verify-otp:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao verificar OTP.", error);
    }
});

router.post("/auth/setup-password", async (req, res) => {
    try {
        const setupToken = typeof req.body?.setupToken === "string" ? req.body.setupToken : null;
        const novaSenha = typeof req.body?.novaSenha === "string" ? req.body.novaSenha : null;
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;

        if (!setupToken || !novaSenha || !email) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: email, setupToken e novaSenha.");
        }

        if (novaSenha.length < 8) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres.");
        }
        if (!/[A-Z]/.test(novaSenha)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve conter ao menos 1 letra maiúscula.");
        }
        if (!/[0-9]/.test(novaSenha)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve conter ao menos 1 número.");
        }

        let tokenPayload: { sub: string; email: string };
        try {
            tokenPayload = await verifyPurposeToken(setupToken, "password_setup");
        } catch {
            return errorResponse(res, 401, "INVALID_TOKEN", "setupToken inválido ou expirado.");
        }

        if (tokenPayload.email !== email) {
            return errorResponse(res, 403, "FORBIDDEN", "Tentativa de manipulação de e-mail detectada.");
        }

        const usuarioId = parseInt(tokenPayload.sub, 10);

        await db
            .update(usuariosTable)
            .set({
                senha_hash: await bcrypt.hash(novaSenha, BCRYPT_SALT_ROUNDS),
                senha_unica_hash: null,
                updated_at: new Date(),
            })
            .where(eq(usuariosTable.id, usuarioId));

        return successResponse(res, null, {message: "Senha definida com sucesso. Faça login."});
    } catch (error: unknown) {
        console.error("Erro em setup-password:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao definir senha.", error);
    }
});

/**
 * Endpoint unificado de primeiro acesso - combina verify-otp + setup-password num único passo.
 * O link do e-mail de boas-vindas aponta para /definir-senha com email e token na query string; o utilizador só precisa de escolher a senha.
 */
router.post("/auth/definir-senha", authLimiter, async (req, res) => {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
        const token = typeof req.body?.token === "string" ? req.body.token.trim().toUpperCase() : null;
        const novaSenha = typeof req.body?.novaSenha === "string" ? req.body.novaSenha : null;

        if (!email || !token || !novaSenha) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: email, token e novaSenha.");
        }

        if (novaSenha.length < 8) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres.");
        }
        if (!/[A-Z]/.test(novaSenha)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve conter ao menos 1 letra maiúscula.");
        }
        if (!/[0-9]/.test(novaSenha)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve conter ao menos 1 número.");
        }

        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                email: usuariosTable.email,
                senha_unica_hash: usuariosTable.senha_unica_hash,
                senha_unica_utilizada: usuariosTable.senha_unica_utilizada,
                bloqueado: usuariosTable.bloqueado,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.email, email))
            .limit(1);

        if (!usuario || !usuario.senha_unica_hash || usuario.senha_unica_utilizada) {
            return errorResponse(res, 400, "INVALID_TOKEN", "Token de ativação inválido ou já utilizado.");
        }

        if (usuario.bloqueado) {
            return errorResponse(res, 403, "FORBIDDEN", "Conta bloqueada. Contacte o administrador.");
        }

        const tokenValido = await bcrypt.compare(token, usuario.senha_unica_hash);
        if (!tokenValido) {
            return errorResponse(res, 400, "INVALID_TOKEN", "Token de ativação inválido ou já utilizado.");
        }

        await db
            .update(usuariosTable)
            .set({
                senha_hash: await bcrypt.hash(novaSenha, BCRYPT_SALT_ROUNDS),
                senha_unica_hash: null,
                senha_unica_utilizada: true,
                updated_at: new Date(),
            })
            .where(eq(usuariosTable.id, usuario.id));

        return successResponse(res, null, {message: "Senha definida com sucesso. Faça login para continuar."});
    } catch (error: unknown) {
        console.error("Erro em definir-senha:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao definir senha.", error);
    }
});

router.post("/auth/forgot-password", authLimiter, async (req, res) => {
    // Resposta sempre genérica - não revela existência de e-mail nem erros internos
    const GENERIC_OK = {message: "Se este e-mail estiver cadastrado, receberá instruções em breve."};

    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
        if (!email) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campo obrigatório: email.");
        }

        const frontendUrl = process.env.FRONTEND_URL;
        if (!frontendUrl) {
            console.error("[CONFIG] FRONTEND_URL não definido - operação de reset de senha bloqueada.");
            return errorResponse(res, 500, "CONFIGURATION_ERROR", "Serviço temporariamente indisponível.");
        }

        const [usuario] = await db
            .select({id: usuariosTable.id, email: usuariosTable.email, bloqueado: usuariosTable.bloqueado})
            .from(usuariosTable)
            .where(eq(usuariosTable.email, email))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            return successResponse(res, null, GENERIC_OK);
        }

        const resetToken = await signPurposeToken({
            sub: String(usuario.id),
            email: usuario.email,
            purpose: "password_reset",
        });

        await sendPasswordResetEmail(usuario.email, resetToken, frontendUrl);

        return successResponse(res, null, GENERIC_OK);
    } catch (error: unknown) {
        console.error(`[${req.id}]`, error);
        return successResponse(res, null, GENERIC_OK);
    }
});

router.post("/auth/reset-password", authLimiter, async (req, res) => {
    try {
        const resetToken = typeof req.body?.resetToken === "string" ? req.body.resetToken : null;
        const novaSenha = typeof req.body?.novaSenha === "string" ? req.body.novaSenha : null;

        if (!resetToken || !novaSenha) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: resetToken e novaSenha.");
        }

        if (novaSenha.length < 8) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres.");
        }
        if (!/[A-Z]/.test(novaSenha)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve conter ao menos 1 letra maiúscula.");
        }
        if (!/[0-9]/.test(novaSenha)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve conter ao menos 1 número.");
        }

        let tokenPayload: { sub: string; email: string };
        try {
            tokenPayload = await verifyPurposeToken(resetToken, "password_reset");
        } catch {
            return errorResponse(res, 401, "INVALID_TOKEN", "Token de recuperação inválido ou expirado.");
        }

        const usuarioId = parseInt(tokenPayload.sub, 10);

        // Invalida todas as sessões activas - mudança de senha implica revogação obrigatória
        await revokeAllTokensForUser(usuarioId);

        await db
            .update(usuariosTable)
            .set({senha_hash: await bcrypt.hash(novaSenha, BCRYPT_SALT_ROUNDS), updated_at: new Date()})
            .where(eq(usuariosTable.id, usuarioId));

        return successResponse(res, null, {message: "Senha redefinida com sucesso. Faça login."});
    } catch (error: unknown) {
        console.error("Erro em reset-password:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao redefinir senha.", error);
    }
});

router.post(
    "/auth/migrate-passwords",
    withAuth,
    withPermission("admin:migrate-passwords"),
    async (_req, res) => {
        try {
            const legacyPattern = /^[0-9a-f]{64}$/;

            const usuarios = await db
                .select({id: usuariosTable.id, email: usuariosTable.email, senha_hash: usuariosTable.senha_hash})
                .from(usuariosTable);

            const legacy = usuarios
                .filter((u) => legacyPattern.test(u.senha_hash))
                .map((u) => ({id: u.id, email: u.email}));

            return successResponse(
                res,
                {pending_migration: legacy, count: legacy.length},
                {
                    message:
                        legacy.length === 0
                            ? "Todas as senhas já estão em bcrypt."
                            : "Estes utilizadores têm hash SHA-256 legado. A migração ocorre automaticamente no próximo login.",
                },
            );
        } catch (error: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro na verificação de migração.", error);
        }
    },
);

export default router;