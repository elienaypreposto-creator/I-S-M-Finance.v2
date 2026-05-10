import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { permissoesTable, usuariosTable } from "@workspace/db/schema";
import { authMiddleware } from "../middlewares/auth";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body ?? {};

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
      })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, String(email)))
      .limit(1);

    if (!usuario || usuario.bloqueado) {
      return errorResponse(res, 401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
    }

    const senhaHash = crypto.createHash("sha256").update(String(senha)).digest("hex");
    if (senhaHash !== usuario.senha_hash) {
      return errorResponse(res, 401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return errorResponse(res, 500, "CONFIG_ERROR", "JWT_SECRET não configurado.");
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      jwtSecret,
      { expiresIn: "24h" },
    );

    return successResponse(
      res,
      {
        token,
        user: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
        },
      },
      {
        tokenType: "Bearer",
        expiresIn: "24h",
      },
    );
  } catch (error: any) {
      console.error("🔥 Erro detalhado no banco de dados (Login):", error);

      return errorResponse(res, 500, "INTERNAL_ERROR", "Erro no login.", String(error));
  }
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return errorResponse(res, 401, "UNAUTHORIZED", "Usuário não autenticado.");
    }

    const [usuario] = await db
      .select({
        id: usuariosTable.id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
        telefone: usuariosTable.telefone,
        celular: usuariosTable.celular,
        bloqueado: usuariosTable.bloqueado,
        ultimo_acesso: usuariosTable.ultimo_acesso,
        created_at: usuariosTable.created_at,
      })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, req.user.id))
      .limit(1);

    if (!usuario) {
      return errorResponse(res, 404, "NOT_FOUND", "Usuário não encontrado.");
    }

    const permissoes = await db
      .select({ codigo_permissao: permissoesTable.codigo_permissao })
      .from(permissoesTable)
      .where(eq(permissoesTable.usuario_id, req.user.id));

    return successResponse(res, {
        user: usuario,
        permissoes: permissoes.map((p) => p.codigo_permissao),
    });
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao obter usuário autenticado.", String(e));
  }
});

export default router;

