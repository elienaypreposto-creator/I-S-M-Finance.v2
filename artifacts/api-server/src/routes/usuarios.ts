/**
 * Rotas de Usuários
 *
 * GET    /usuarios                — Lista paginada
 * POST   /usuarios                — Criação
 * PUT    /usuarios/:id            — Actualização
 * GET    /usuarios/:id/permissoes — Leitura de permissões
 * PUT    /usuarios/:id/permissoes — Substituição de permissões
 *
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { and, count, eq, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { permissoesTable, usuariosTable } from "@workspace/db/schema";
import { errorResponse, successResponse } from "../utils/response";
import { withPermission } from "../middlewares/withPermission";

const BCRYPT_SALT_ROUNDS = 12;

const USUARIO_PUBLIC_COLS = {
  id:            usuariosTable.id,
  nome:          usuariosTable.nome,
  email:         usuariosTable.email,
  telefone:      usuariosTable.telefone,
  celular:       usuariosTable.celular,
  bloqueado:     usuariosTable.bloqueado,
  ultimo_acesso: usuariosTable.ultimo_acesso,
  created_at:    usuariosTable.created_at,
} as const;

const router = Router();

router.get(
  "/usuarios",
  withPermission("admin:usuarios:listar"),
  async (req, res) => {
    try {
      const page   = Math.max(1, parseInt(req.query.page   as string) || 1);
      const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
      const offset = (page - 1) * limit;

      const conditions = [];
      if (typeof req.query.search === "string" && req.query.search.trim()) {
        conditions.push(ilike(usuariosTable.nome, `%${req.query.search.trim()}%`));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalResult] = await db.select({ count: count() }).from(usuariosTable).where(where);
      const items = await db
        .select(USUARIO_PUBLIC_COLS)
        .from(usuariosTable)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(usuariosTable.nome);

      return successResponse(res, items, { total: totalResult.count, page, limit });
    } catch (e: unknown) {
      return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar usuários.", String(e));
    }
  },
);

router.post(
  "/usuarios",
  withPermission("admin:usuarios:criar"),
  async (req, res) => {
    try {
      const nome     = typeof req.body?.nome     === "string" ? req.body.nome.trim()     : null;
      const email    = typeof req.body?.email    === "string" ? req.body.email.trim()    : null;
      const senha    = typeof req.body?.senha    === "string" ? req.body.senha           : null;
      const telefone = typeof req.body?.telefone === "string" ? req.body.telefone.trim() : null;
      const celular  = typeof req.body?.celular  === "string" ? req.body.celular.trim()  : null;

      if (!nome || !email || !senha) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "Campos obrigatórios: nome, email e senha.");
      }
      if (senha.length < 8) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres.");
      }

      const [item] = await db
        .insert(usuariosTable)
        .values({
          nome,
          email,
          senha_hash: await bcrypt.hash(senha, BCRYPT_SALT_ROUNDS),
          telefone:   telefone ?? undefined,
          celular:    celular  ?? undefined,
          bloqueado:  false,
        })
        .returning(USUARIO_PUBLIC_COLS);

      return successResponse(res, item, null, 201);
    } catch (e: unknown) {
      return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar usuário.", String(e));
    }
  },
);

router.put(
  "/usuarios/:id",
  withPermission("admin:usuarios:editar"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
      }

      const nome      = typeof req.body?.nome      === "string"  ? req.body.nome.trim()      : undefined;
      const telefone  = typeof req.body?.telefone  === "string"  ? req.body.telefone.trim()  : undefined;
      const celular   = typeof req.body?.celular   === "string"  ? req.body.celular.trim()   : undefined;
      const bloqueado = typeof req.body?.bloqueado === "boolean" ? req.body.bloqueado         : undefined;
      const senha     = typeof req.body?.senha     === "string"  ? req.body.senha            : undefined;

      type UsuarioUpdate = {
        updated_at:  Date;
        nome?:       string;
        telefone?:   string;
        celular?:    string;
        bloqueado?:  boolean;
        senha_hash?: string;
      };

      const updateData: UsuarioUpdate = { updated_at: new Date() };
      if (nome      !== undefined) updateData.nome      = nome;
      if (telefone  !== undefined) updateData.telefone  = telefone;
      if (celular   !== undefined) updateData.celular   = celular;
      if (bloqueado !== undefined) updateData.bloqueado = bloqueado;

      if (senha !== undefined) {
        if (senha.length < 8) {
          return errorResponse(res, 400, "VALIDATION_ERROR", "A senha deve ter pelo menos 8 caracteres.");
        }
        updateData.senha_hash = await bcrypt.hash(senha, BCRYPT_SALT_ROUNDS);
      }

      const [item] = await db
        .update(usuariosTable)
        .set(updateData)
        .where(eq(usuariosTable.id, id))
        .returning(USUARIO_PUBLIC_COLS);

      if (!item) return errorResponse(res, 404, "NOT_FOUND", "Usuário não encontrado.");
      return successResponse(res, item);
    } catch (e: unknown) {
      return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar usuário.", String(e));
    }
  },
);

router.get(
  "/usuarios/:id/permissoes",
  withPermission("admin:usuarios:listar"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
      }

      const items = await db
        .select({ permissao: permissoesTable.codigo_permissao })
        .from(permissoesTable)
        .where(eq(permissoesTable.usuario_id, id));

      return successResponse(res, items.map((i) => i.permissao));
    } catch (e: unknown) {
      return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar permissões.", String(e));
    }
  },
);

router.put(
  "/usuarios/:id/permissoes",
  withPermission("admin:usuarios:editar"),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");
      }

      const rawPermissoes = req.body?.permissoes;
      if (!Array.isArray(rawPermissoes)) {
        return errorResponse(res, 400, "VALIDATION_ERROR", "permissoes deve ser um array de strings.");
      }

      const permissoes = rawPermissoes.filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );

      await db.delete(permissoesTable).where(eq(permissoesTable.usuario_id, id));

      if (permissoes.length > 0) {
        await db.insert(permissoesTable).values(
          permissoes.map((p) => ({ usuario_id: id, codigo_permissao: p })),
        );
      }

      return successResponse(res, permissoes);
    } catch (e: unknown) {
      return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar permissões.", String(e));
    }
  },
);

export default router;
