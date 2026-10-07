/**
 * Auth Routes
 *
 * POST /auth/login              - Autentica; 1 empresa → sessão; N → selectionToken
 * POST /auth/select-empresa     - Emite sessão após escolha (selectionToken + empresa_id)
 * POST /auth/switch-empresa     - Troca empresa da sessão (revoga refresh, emite par novo)
 * POST /auth/refresh            - Renova tokens (refresh lido do cookie httpOnly); recusa se o vínculo estiver inativo
 * POST /auth/logout             - Revoga o Refresh Token e limpa o cookie
 * GET  /auth/me                 - Perfil do utilizador autenticado
 * POST /auth/verify-otp         - Valida o OTP de boas-vindas; retorna setupToken
 * POST /auth/setup-password     - Define a senha permanente com setupToken
 * POST /auth/forgot-password    - Solicita recuperação de senha por e-mail
 * POST /auth/reset-password     - Redefine a senha com o resetToken
 * POST /auth/migrate-passwords  - [admin] Diagnóstico de hashes SHA-256 legados
 *
 * Sessão: o access token vai no body (o frontend o mantém só em memória); o refresh
 * token vai em cookie `rt` HttpOnly; Secure; SameSite=Strict; Path=/api/auth.
 */

import {Router, type Request, type Response} from "express";
import bcrypt from "bcryptjs";
import {and, eq, sql} from "drizzle-orm";
import {db} from "@workspace/db";
import {permissoesTable, refreshTokensTable, usuarioEmpresasTable, usuariosTable} from "@workspace/db/schema";
import {sendPasswordResetEmail} from "../services/email.service";
import {revokeAllTokensForUser} from "../services/session.service";
import {denylistUser} from "../services/denylist.service";
import {assertVinculoAtivo, listEmpresasAtivasDoUsuario} from "../services/tenant.service";
import {invalidateTenantCache} from "../middlewares/tenant";
import {withAuth} from "../middlewares/auth";
import {withPermission} from "../middlewares/withPermission";
import {authLimiter, loginEmailLimiter, loginLimiter} from "../middlewares/rate-limit";
import {AppError} from "../utils/app-error";
import {SENHA_RESET_REQUIRED, validatePasswordPolicy} from "../utils/password-policy";
import {errorResponse, successResponse} from "../utils/response";
import {
    clearRefreshCookie,
    csrfGuard,
    LEGACY_REFRESH_BODY,
    readRefreshToken,
    setRefreshCookie,
} from "../utils/refresh-cookie";
import {ADMIN_USUARIOS_AUTOMATICAS, PERMISSOES_ADMIN} from "../constants/permissoes";
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

// CSRF: o csrfGuard (X-Requested-With) é aplicado apenas nas rotas que consomem o cookie
// do refresh token: /auth/refresh, /auth/switch-empresa e /auth/logout (ver refresh-cookie.ts).

/**
 * Permissões da empresa ativa. Superadmin global recebe o catálogo completo
 * (não depende de linhas em `usuario_permissoes` por tenant) para o frontend
 * não esconder menus ao trocar de empresa. Admin de empresa soma
 * `ADMIN_USUARIOS_AUTOMATICAS` sem gravar wildcard.
 */
const fetchPermissions = async (
    usuarioId: number,
    empresaId: number,
    superadmin = false,
): Promise<string[]> => {
    if (superadmin) {
        return [...PERMISSOES_ADMIN];
    }

    const [rows, vinculo] = await Promise.all([
        db
            .select({codigo_permissao: permissoesTable.codigo_permissao})
            .from(permissoesTable)
            .where(and(eq(permissoesTable.usuario_id, usuarioId), eq(permissoesTable.empresa_id, empresaId))),
        db
            .select({papel: usuarioEmpresasTable.papel})
            .from(usuarioEmpresasTable)
            .where(and(eq(usuarioEmpresasTable.usuario_id, usuarioId), eq(usuarioEmpresasTable.empresa_id, empresaId)))
            .limit(1),
    ]);

    const permissoes = rows.map((r) => r.codigo_permissao);
    if (vinculo[0]?.papel === "admin") {
        for (const codigo of ADMIN_USUARIOS_AUTOMATICAS) {
            if (!permissoes.includes(codigo)) permissoes.push(codigo);
        }
    }
    return permissoes;
};

function attachTenantForAudit(
    req: Request,
    usuario: {id: number; email: string; superadmin: boolean},
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

async function emitSession(
    usuario: {id: number; nome: string; email: string; superadmin: boolean},
    empresaId: number,
) {
    await assertVinculoAtivo(usuario.id, empresaId);
    const permissions = await fetchPermissions(usuario.id, empresaId, usuario.superadmin);
    const [accessToken, {token: refreshToken, tokenHash, expiresAt}] = await Promise.all([
        signAccessToken({
            sub: String(usuario.id),
            email: usuario.email,
            permissions,
            empresa_id: empresaId,
            superadmin: usuario.superadmin,
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
        user: {id: usuario.id, nome: usuario.nome, email: usuario.email, empresa_id: empresaId, superadmin: usuario.superadmin},
        permissoes: permissions,
        empresa_id: empresaId,
    };
}

/**
 * Envia a sessão: refresh token vai no cookie httpOnly; o body leva só o access token
 * (e, durante a transição, o refresh também — AUTH_LEGACY_REFRESH_BODY=true).
 */
function sendSession(
    res: Response,
    session: Awaited<ReturnType<typeof emitSession>>,
    meta: Record<string, unknown>,
) {
    const {refreshToken, ...publicSession} = session;
    setRefreshCookie(res, refreshToken);
    return successResponse(res, LEGACY_REFRESH_BODY ? session : publicSession, meta);
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
                superadmin: usuariosTable.superadmin,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.email, email))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            return errorResponse(res, 401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
        }

        // CORREÇÃO: usuário ainda não definiu senha permanente (fluxo de primeiro
        // acesso via OTP não concluído) — sem isso, o bcrypt.compare abaixo lança
        // exceção ao receber `senha_hash` nulo e derruba a rota com 500.
        if (!usuario.senha_hash) {
            return errorResponse(
                res,
                403,
                "SETUP_PENDING",
                "Este utilizador ainda não definiu uma senha. Complete o processo de primeiro acesso.",
            );
        }

        // Hash SHA-256 legado invalidado pela migração 0023: não há senha para comparar.
        if (usuario.senha_hash === SENHA_RESET_REQUIRED) {
            return errorResponse(
                res,
                403,
                "PASSWORD_RESET_REQUIRED",
                "Por segurança, sua senha foi invalidada e precisa ser redefinida. Enviamos um e-mail com o link (verifique também o spam); se não o encontrar, use \"Esqueci minha senha\".",
            );
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
            {id: usuario.id, nome: usuario.nome, email: usuario.email, superadmin: usuario.superadmin},
            empresas[0].id,
        );
        attachTenantForAudit(req, usuario, empresas[0].id);

        return sendSession(res, session, {
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

router.post("/auth/refresh", csrfGuard, async (req, res) => {
    // Qualquer 401 desta rota também limpa o cookie, para o navegador não reenviar um token morto.
    const reject = (code: string, message: string) => {
        clearRefreshCookie(res);
        return errorResponse(res, 401, code, message);
    };

    try {
        const rawToken = readRefreshToken(req); // cookie (ou body, durante a transição)
        if (!rawToken) {
            return errorResponse(res, 401, "INVALID_TOKEN", "Refresh token ausente.");
        }

        let rtPayload: { sub: string; email: string; empresa_id: number };
        try {
            rtPayload = await verifyRefreshToken(rawToken);
        } catch {
            return reject("INVALID_TOKEN", "Refresh token inválido ou expirado.");
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
            return reject("INVALID_TOKEN", "Refresh token inválido.");
        }

        // Reutilização de token revogado invalida toda a família para forçar novo login.
        if (registro.revogado) {
            await revokeAllTokensForUser(registro.usuario_id);
            await denylistUser(registro.usuario_id);
            console.warn(
                `[SECURITY] Token reuse detectado - usuario_id=${registro.usuario_id}. Família revogada.`,
            );
            return reject(
                "TOKEN_REUSE_DETECTED",
                "Sessão invalidada por motivo de segurança. Faça login novamente.",
            );
        }

        // Dupla verificação de expiração: defensivo em relação a tokens não limpos do banco
        if (registro.expires_at < new Date()) {
            return reject("INVALID_TOKEN", "Refresh token expirado.");
        }

        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                bloqueado: usuariosTable.bloqueado,
                superadmin: usuariosTable.superadmin,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, usuarioId))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            await revokeAllTokensForUser(usuarioId);
            await denylistUser(usuarioId);
            return reject("UNAUTHORIZED", "Utilizador inválido ou bloqueado.");
        }

        try {
            await assertVinculoAtivo(usuario.id, rtPayload.empresa_id);
        } catch {
            await revokeAllTokensForUser(usuarioId);
            await denylistUser(usuarioId);
            return reject("UNAUTHORIZED", "Vínculo com a empresa inativo. Faça login novamente.");
        }

        // Rotação atômica: só uma requisição consegue revogar este token. Sem isso, duas
        // requisições simultâneas com o mesmo cookie passariam pela checagem `revogado`
        // e emitiriam dois pares de tokens.
        const [revogado] = await db
            .update(refreshTokensTable)
            .set({revogado: true})
            .where(and(eq(refreshTokensTable.id, registro.id), eq(refreshTokensTable.revogado, false)))
            .returning({id: refreshTokensTable.id});

        if (!revogado) {
            // Perdeu a corrida: outra requisição já rotacionou este token.
            // Sem clearRefreshCookie: o cookie novo da requisição vencedora não pode ser apagado.
            return errorResponse(res, 401, "TOKEN_ROTATED", "Sessão renovada em outra requisição.");
        }

        // Re-consulta permissões para propagar alterações feitas após o último login
        const permissions = await fetchPermissions(usuario.id, rtPayload.empresa_id, usuario.superadmin);

        const [newAccessToken, {token: newRefreshToken, tokenHash: newHash, expiresAt}] =
            await Promise.all([
                signAccessToken({
                    sub: String(usuario.id),
                    email: usuario.email,
                    permissions,
                    empresa_id: rtPayload.empresa_id,
                    superadmin: usuario.superadmin,
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

        setRefreshCookie(res, newRefreshToken);

        return successResponse(
            res,
            LEGACY_REFRESH_BODY
                ? {accessToken: newAccessToken, refreshToken: newRefreshToken}
                : {accessToken: newAccessToken},
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
                superadmin: usuariosTable.superadmin,
            })
            .from(usuariosTable)
            .where(eq(usuariosTable.id, usuarioId))
            .limit(1);

        if (!usuario || usuario.bloqueado) {
            return errorResponse(res, 401, "UNAUTHORIZED", "Utilizador inválido ou bloqueado.");
        }

        const session = await emitSession(usuario, empresaId);
        attachTenantForAudit(req, usuario, empresaId);
        return sendSession(res, session, {
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

router.post("/auth/switch-empresa", csrfGuard, withAuth, async (req, res) => {
    try {
        const empresaIdRaw = req.body?.empresa_id;
        const empresaId = typeof empresaIdRaw === "number" ? empresaIdRaw : Number(empresaIdRaw);
        const rawRefresh = readRefreshToken(req); // cookie (ou body, durante a transição)

        if (!Number.isInteger(empresaId) || empresaId <= 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campo obrigatório: empresa_id.");
        }

        const [usuario] = await db
            .select({
                id: usuariosTable.id,
                nome: usuariosTable.nome,
                email: usuariosTable.email,
                bloqueado: usuariosTable.bloqueado,
                superadmin: usuariosTable.superadmin,
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
                .where(
                    and(
                        eq(refreshTokensTable.token_hash, hashToken(rawRefresh)),
                        eq(refreshTokensTable.usuario_id, usuario.id),
                    ),
                );
        } else {
            await revokeAllTokensForUser(usuario.id);
        }

        invalidateTenantCache(usuario.id);
        const session = await emitSession(usuario, empresaId);
        attachTenantForAudit(req, usuario, empresaId);
        return sendSession(res, session, {
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

router.post("/auth/logout", csrfGuard, async (req, res) => {
    try {
        const rawToken = readRefreshToken(req); // cookie (ou body, durante a transição)
        if (rawToken) {
            await db
                .update(refreshTokensTable)
                .set({revogado: true})
                .where(eq(refreshTokensTable.token_hash, hashToken(rawToken)));
        }
        clearRefreshCookie(res);
        return successResponse(res, null, {message: "Logout realizado com sucesso."});
    } catch (error: unknown) {
        // Mesmo com falha no banco, o cookie é limpo no navegador
        clearRefreshCookie(res);
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
        const permissoes = await fetchPermissions(
            usuario.id,
            req.user!.empresaId,
            req.user!.superadmin,
        );
        return successResponse(res, {
            user: {...usuario, empresa_id: req.user!.empresaId, superadmin: req.user!.superadmin},
            permissoes,
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

router.post("/auth/setup-password", authLimiter, async (req, res) => {
    try {
        const setupToken = typeof req.body?.setupToken === "string" ? req.body.setupToken : null;
        const novaSenha = typeof req.body?.novaSenha === "string" ? req.body.novaSenha : null;
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : null;

        if (!setupToken || !novaSenha || !email) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: email, setupToken e novaSenha.");
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

        const [usuario] = await db
            .select({nome: usuariosTable.nome, email: usuariosTable.email})
            .from(usuariosTable)
            .where(eq(usuariosTable.id, usuarioId))
            .limit(1);

        if (!usuario) {
            return errorResponse(res, 401, "INVALID_TOKEN", "setupToken inválido ou expirado.");
        }

        // Política de senha (tamanho, e-mail/nome, vazadas na HIBP) - só depois do token válido,
        // para a rota não virar um oráculo público de senhas vazadas.
        const violacao = await validatePasswordPolicy(novaSenha, usuario);
        if (violacao) {
            return errorResponse(res, 400, "WEAK_PASSWORD", violacao.message);
        }

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

        let tokenPayload: { sub: string; email: string };
        try {
            tokenPayload = await verifyPurposeToken(resetToken, "password_reset");
        } catch {
            return errorResponse(res, 401, "INVALID_TOKEN", "Token de recuperação inválido ou expirado.");
        }

        const usuarioId = parseInt(tokenPayload.sub, 10);

        const [usuario] = await db
            .select({nome: usuariosTable.nome, email: usuariosTable.email})
            .from(usuariosTable)
            .where(eq(usuariosTable.id, usuarioId))
            .limit(1);

        if (!usuario) {
            return errorResponse(res, 401, "INVALID_TOKEN", "Token de recuperação inválido ou expirado.");
        }

        const violacao = await validatePasswordPolicy(novaSenha, usuario);
        if (violacao) {
            return errorResponse(res, 400, "WEAK_PASSWORD", violacao.message);
        }

        // Invalida todas as sessões activas - mudança de senha implica revogação obrigatória
        await revokeAllTokensForUser(usuarioId);
        clearRefreshCookie(res);

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
            const h = usuariosTable.senha_hash;

            const [r] = await db
                .select({
                    nao_bcrypt: sql<number>`count(*) filter (where ${h} not like '$2%')`.mapWith(Number),
                    sha256_legado: sql<number>`count(*) filter (where ${h} ~ '^[0-9a-f]{64}$')`.mapWith(Number),
                    reset_pendente: sql<number>`count(*) filter (where ${h} = 'RESET_REQUIRED')`.mapWith(Number),
                    reset_nao_avisado: sql<number>`
                        count(*)
                        filter (
                            where ${h} = 'RESET_REQUIRED'
                            and ${usuariosTable.senha_reset_notificado_em} is null
                        )
                    `.mapWith(Number),
                })
                .from(usuariosTable);

            return successResponse(res, r, {
                message:
                    r.nao_bcrypt === 0
                        ? "Todas as senhas estão em bcrypt."
                        : "Ainda há senhas fora de bcrypt. reset_pendente = aguardando o utilizador redefinir.",
            });
        } catch (error: unknown) {
            return errorResponse(
                res,
                500,
                "INTERNAL_ERROR",
                "Erro na verificação de migração.",
                error,
            );
        }
    },
);

export default router;