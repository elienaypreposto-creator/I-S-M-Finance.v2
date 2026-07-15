/**
 * Auth Routes
 *
 * POST /auth/login              — Autentica; retorna Access Token JWE + Refresh Token JWS
 * POST /auth/refresh            — Renova tokens com rotação e Token Family Revocation
 * POST /auth/logout             — Revoga o Refresh Token
 * GET  /auth/me                 — Perfil do utilizador autenticado
 * POST /auth/verify-otp         — Valida o OTP de boas-vindas; retorna setupToken
 * POST /auth/setup-password     — Define a senha permanente com setupToken
 * POST /auth/forgot-password    — Solicita recuperação de senha por e-mail
 * POST /auth/reset-password     — Redefine a senha com o resetToken
 * POST /auth/migrate-passwords  — [admin] Diagnóstico de hashes SHA-256 legados
 */

import {Router} from "express";
import bcrypt from "bcryptjs";
import {eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {permissoesTable, refreshTokensTable, usuariosTable} from "@workspace/db/schema";
import {sendPasswordResetEmail} from "../services/email.service";
import {revokeAllTokensForUser} from "../services/session.service";
import {withAuth} from "../middlewares/auth";
import {withPermission} from "../middlewares/withPermission";
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

router.post("/auth/login", async (req, res) => {
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

        // Permissões consultadas no banco para embutir no JWE
        const permissions = await fetchPermissions(usuario.id);

        const [accessToken, {token: refreshToken, tokenHash, expiresAt}] = await Promise.all([
            signAccessToken({sub: String(usuario.id), email: usuario.email, permissions}),
            signRefreshToken({sub: String(usuario.id), email: usuario.email}),
        ]);

        await db.insert(refreshTokensTable).values({
            usuario_id: usuario.id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            revogado: false,
        });

        return successResponse(
            res,
            {accessToken, refreshToken, user: {id: usuario.id, nome: usuario.nome, email: usuario.email}},
            {
                tokenType: "Bearer",
                accessTokenExpiresIn: "15m",
                refreshTokenExpiresIn: "7d",
                ...(precisaMigrar ? {passwordMigrated: true} : {}),
            },
        );
    } catch (error: unknown) {
        console.error("Erro no login:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no login.", String(error));
    }
});

router.post("/auth/refresh", async (req, res) => {
    try {
        const rawToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;
        if (!rawToken) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "refreshToken é obrigatório.");
        }

        let rtPayload: { sub: string; email: string };
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
                `[SECURITY] Token reuse detectado — usuario_id=${registro.usuario_id}. Família revogada.`,
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
            .select({id: usuariosTable.id, email: usuariosTable.email, bloqueado: usuariosTable.bloqueado})
            .from(usuariosTable)
            .where(eq(usuariosTable.id, usuarioId))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            await revokeAllTokensForUser(usuarioId);
            return errorResponse(res, 401, "UNAUTHORIZED", "Utilizador inválido ou bloqueado.");
        }

        await db
            .update(refreshTokensTable)
            .set({revogado: true})
            .where(eq(refreshTokensTable.id, registro.id));

        // Re-consulta permissões para propagar alterações feitas após o último login
        const permissions = await fetchPermissions(usuario.id);

        const [newAccessToken, {token: newRefreshToken, tokenHash: newHash, expiresAt}] =
            await Promise.all([
                signAccessToken({sub: String(usuario.id), email: usuario.email, permissions}),
                signRefreshToken({sub: String(usuario.id), email: usuario.email}),
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao renovar token.", String(error));
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no logout.", String(error));
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

        return successResponse(res, {user: usuario, permissoes: req.user!.permissions});
    } catch (error: unknown) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao obter utilizador autenticado.", String(error));
    }
});

router.post("/auth/verify-otp", async (req, res) => {
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao verificar OTP.", String(error));
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao definir senha.", String(error));
    }
});

/**
 * Endpoint unificado de primeiro acesso - combina verify-otp + setup-password num único passo.
 * O link do e-mail de boas-vindas aponta para /definir-senha com email e token na query string; o utilizador só precisa de escolher a senha.
 */
router.post("/auth/definir-senha", async (req, res) => {
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
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao definir senha.", String(error));
    }
});

router.post("/auth/forgot-password", async (req, res) => {
    // Resposta sempre genérica - não revela existência de e-mail nem erros internos
    const GENERIC_OK = {message: "Se este e-mail estiver cadastrado, receberá instruções em breve."};

    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;
        if (!email) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campo obrigatório: email.");
        }

        const frontendUrl = process.env.FRONTEND_URL;
        if (!frontendUrl) {
            console.error("[CONFIG] FRONTEND_URL não definido — operação de reset de senha bloqueada.");
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
        console.error("Erro em forgot-password:", error);
        return successResponse(res, null, GENERIC_OK);
    }
});

router.post("/auth/reset-password", async (req, res) => {
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

        // Invalida todas as sessões activas — mudança de senha implica revogação obrigatória
        await revokeAllTokensForUser(usuarioId);

        await db
            .update(usuariosTable)
            .set({senha_hash: await bcrypt.hash(novaSenha, BCRYPT_SALT_ROUNDS), updated_at: new Date()})
            .where(eq(usuariosTable.id, usuarioId));

        return successResponse(res, null, {message: "Senha redefinida com sucesso. Faça login."});
    } catch (error: unknown) {
        console.error("Erro em reset-password:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao redefinir senha.", String(error));
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
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro na verificação de migração.", String(error));
        }
    },
);

export default router;
