/**
 * Auth Routes
 *
 * POST /auth/login             — Autentica; retorna Access Token JWE + Refresh Token JWS
 * POST /auth/refresh           — Renova tokens com rotação e Token Family Revocation
 * POST /auth/logout            — Revoga o Refresh Token
 * GET  /auth/me                — Perfil do utilizador autenticado
 * POST /auth/migrate-passwords — [admin] Diagnóstico de hashes SHA-256 legados
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { permissoesTable, refreshTokensTable, usuariosTable } from "@workspace/db/schema";
import { withAuth } from "../middlewares/auth";
import { withPermission } from "../middlewares/withPermission";
import { errorResponse, successResponse } from "../utils/response";
import {
  hashToken,
  sha256Hash,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../services/token.service";

const BCRYPT_SALT_ROUNDS = 12;
const router = Router();

const fetchPermissions = async (usuarioId: number): Promise<string[]> => {
  const rows = await db
    .select({ codigo_permissao: permissoesTable.codigo_permissao })
    .from(permissoesTable)
    .where(eq(permissoesTable.usuario_id, usuarioId));
  return rows.map((r) => r.codigo_permissao);
};

const revokeAllTokensForUser = (usuarioId: number) =>
  db
    .update(refreshTokensTable)
    .set({ revogado: true })
    .where(eq(refreshTokensTable.usuario_id, usuarioId));

router.post("/auth/login", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : null;
    const senha = typeof req.body?.senha === "string" ? req.body.senha : null;

    if (!email || !senha) {
      return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: email e senha.");
    }

    const [usuario] = await db
      .select({
        id:         usuariosTable.id,
        nome:       usuariosTable.nome,
        email:      usuariosTable.email,
        senha_hash: usuariosTable.senha_hash,
        bloqueado:  usuariosTable.bloqueado,
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
      senhaValida   = true;
      precisaMigrar = true;
    }

    if (!senhaValida) {
      return errorResponse(res, 401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
    }

    // Migração SHA-256 → bcrypt no primeiro login após a implantação
    if (precisaMigrar) {
      await db
        .update(usuariosTable)
        .set({ senha_hash: await bcrypt.hash(senha, BCRYPT_SALT_ROUNDS), updated_at: new Date() })
        .where(eq(usuariosTable.id, usuario.id));
    }

    await db
      .update(usuariosTable)
      .set({ ultimo_acesso: new Date() })
      .where(eq(usuariosTable.id, usuario.id));

    // Permissões consultadas no banco para embutir no JWE
    const permissions = await fetchPermissions(usuario.id);

    const [accessToken, { token: refreshToken, tokenHash, expiresAt }] = await Promise.all([
      signAccessToken({ sub: String(usuario.id), email: usuario.email, permissions }),
      signRefreshToken({ sub: String(usuario.id), email: usuario.email }),
    ]);

    await db.insert(refreshTokensTable).values({
      usuario_id: usuario.id,
      token_hash:  tokenHash,
      expires_at:  expiresAt,
      revogado:    false,
    });

    return successResponse(
      res,
      { accessToken, refreshToken, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } },
      {
        tokenType:             "Bearer",
        accessTokenExpiresIn:  "15m",
        refreshTokenExpiresIn: "7d",
        ...(precisaMigrar ? { passwordMigrated: true } : {}),
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
        id:         refreshTokensTable.id,
        usuario_id: refreshTokensTable.usuario_id,
        revogado:   refreshTokensTable.revogado,
        expires_at: refreshTokensTable.expires_at,
      })
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.token_hash, tokenHash))
      .limit(1);

    if (!registro) {
      return errorResponse(res, 401, "INVALID_TOKEN", "Refresh token inválido.");
    }

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
      .select({ id: usuariosTable.id, email: usuariosTable.email, bloqueado: usuariosTable.bloqueado })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, usuarioId))
      .limit(1);

    if (!usuario || usuario.bloqueado) {
      await revokeAllTokensForUser(usuarioId);
      return errorResponse(res, 401, "UNAUTHORIZED", "Usuário inválido ou bloqueado.");
    }

    await db
      .update(refreshTokensTable)
      .set({ revogado: true })
      .where(eq(refreshTokensTable.id, registro.id));

    // Re-consulta permissões para propagar alterações feitas após o último login
    const permissions = await fetchPermissions(usuario.id);

    const [newAccessToken, { token: newRefreshToken, tokenHash: newHash, expiresAt }] =
      await Promise.all([
        signAccessToken({ sub: String(usuario.id), email: usuario.email, permissions }),
        signRefreshToken({ sub: String(usuario.id), email: usuario.email }),
      ]);

    await db.insert(refreshTokensTable).values({
      usuario_id: usuario.id,
      token_hash:  newHash,
      expires_at:  expiresAt,
      revogado:    false,
    });

    return successResponse(
      res,
      { accessToken: newAccessToken, refreshToken: newRefreshToken },
      { tokenType: "Bearer", accessTokenExpiresIn: "15m", refreshTokenExpiresIn: "7d" },
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
        .set({ revogado: true })
        .where(eq(refreshTokensTable.token_hash, hashToken(rawToken)));
    }
    return successResponse(res, null, { message: "Logout realizado com sucesso." });
  } catch (error: unknown) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no logout.", String(error));
  }
});

router.get("/auth/me", withAuth, async (req, res) => {
  try {
    const [usuario] = await db
      .select({
        id:            usuariosTable.id,
        nome:          usuariosTable.nome,
        email:         usuariosTable.email,
        telefone:      usuariosTable.telefone,
        celular:       usuariosTable.celular,
        bloqueado:     usuariosTable.bloqueado,
        ultimo_acesso: usuariosTable.ultimo_acesso,
        created_at:    usuariosTable.created_at,
      })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, req.user!.id))
      .limit(1);

    if (!usuario) {
      return errorResponse(res, 404, "NOT_FOUND", "Usuário não encontrado.");
    }

    return successResponse(res, { user: usuario, permissoes: req.user!.permissions });
  } catch (error: unknown) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao obter utilizador autenticado.", String(error));
  }
});

router.post(
  "/auth/migrate-passwords",
  withAuth,
  withPermission("admin:migrate-passwords"),
  async (req, res) => {
    try {
      const legacyPattern = /^[0-9a-f]{64}$/;

      const usuarios = await db
        .select({ id: usuariosTable.id, email: usuariosTable.email, senha_hash: usuariosTable.senha_hash })
        .from(usuariosTable);

      const legacy = usuarios
        .filter((u) => legacyPattern.test(u.senha_hash))
        .map((u) => ({ id: u.id, email: u.email }));

      return successResponse(
        res,
        { pending_migration: legacy, count: legacy.length },
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
