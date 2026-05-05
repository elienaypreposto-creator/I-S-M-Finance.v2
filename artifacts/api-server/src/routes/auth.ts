import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { permissoesTable, usuariosTable } from "@workspace/db/schema";
import { authMiddleware } from "../middlewares/auth";

const router = Router();

const jsonError = (status: number, code: string, message: string) => ({
  status,
  body: {
    data: null,
    meta: null,
    errors: [{ code, message }],
  },
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body ?? {};

    if (!email || !senha) {
      const err = jsonError(400, "VALIDATION_ERROR", "Campos obrigatórios: email e senha.");
      return res.status(err.status).json(err.body);
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
      const err = jsonError(401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
      return res.status(err.status).json(err.body);
    }

    const senhaHash = crypto.createHash("sha256").update(String(senha)).digest("hex");
    if (senhaHash !== usuario.senha_hash) {
      const err = jsonError(401, "INVALID_CREDENTIALS", "Email ou senha inválidos.");
      return res.status(err.status).json(err.body);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      const err = jsonError(500, "CONFIG_ERROR", "JWT_SECRET não configurado.");
      return res.status(err.status).json(err.body);
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      jwtSecret,
      { expiresIn: "24h" },
    );

    return res.json({
      data: {
        token,
        user: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
        },
      },
      meta: {
        tokenType: "Bearer",
        expiresIn: "24h",
      },
      errors: null,
    });
  } catch (e) {
    return res.status(500).json({
      data: null,
      meta: null,
      errors: [{ code: "INTERNAL_ERROR", message: String(e) }],
    });
  }
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        data: null,
        meta: null,
        errors: [{ code: "UNAUTHORIZED", message: "Usuário não autenticado." }],
      });
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
      return res.status(404).json({
        data: null,
        meta: null,
        errors: [{ code: "NOT_FOUND", message: "Usuário não encontrado." }],
      });
    }

    const permissoes = await db
      .select({ codigo_permissao: permissoesTable.codigo_permissao })
      .from(permissoesTable)
      .where(eq(permissoesTable.usuario_id, req.user.id));

    return res.json({
      data: {
        user: usuario,
        permissoes: permissoes.map((p) => p.codigo_permissao),
      },
      meta: null,
      errors: null,
    });
  } catch (e) {
    return res.status(500).json({
      data: null,
      meta: null,
      errors: [{ code: "INTERNAL_ERROR", message: String(e) }],
    });
  }
});

export default router;

