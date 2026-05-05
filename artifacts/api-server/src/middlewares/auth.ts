import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { permissoesTable, usuariosTable } from "@workspace/db/schema";

type JwtPayload = {
  id: number;
  email: string;
  iat?: number;
  exp?: number;
};

type AuthUser = {
  id: number;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const jsonError = (res: Response, status: number, code: string, message: string) => {
  return res.status(status).json({
    data: null,
    meta: null,
    errors: [{ code, message }],
  });
};

const getBearerToken = (authHeader?: string) => {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return jsonError(res, 401, "UNAUTHORIZED", "Token de autenticação ausente ou inválido.");
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return jsonError(res, 500, "CONFIG_ERROR", "JWT_SECRET não configurado.");
    }

    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    if (!payload?.id || !payload?.email) {
      return jsonError(res, 401, "UNAUTHORIZED", "Token inválido.");
    }

    const [usuario] = await db
      .select({ id: usuariosTable.id, email: usuariosTable.email, bloqueado: usuariosTable.bloqueado })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, payload.id))
      .limit(1);

    if (!usuario || usuario.bloqueado) {
      return jsonError(res, 401, "UNAUTHORIZED", "Usuário inválido ou bloqueado.");
    }

    req.user = { id: payload.id, email: payload.email };
    return next();
  } catch {
    return jsonError(res, 401, "UNAUTHORIZED", "Token expirado ou inválido.");
  }
};

export const requirePermission = (codigoPermissao: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return jsonError(res, 401, "UNAUTHORIZED", "Usuário não autenticado.");
      }

      const [permissao] = await db
        .select({ id: permissoesTable.id })
        .from(permissoesTable)
        .where(
          and(
            eq(permissoesTable.usuario_id, req.user.id),
            eq(permissoesTable.codigo_permissao, codigoPermissao),
          ),
        )
        .limit(1);

      if (!permissao) {
        return jsonError(res, 403, "FORBIDDEN", `Permissão necessária: ${codigoPermissao}.`);
      }

      return next();
    } catch {
      return jsonError(res, 500, "INTERNAL_ERROR", "Erro ao validar permissão do usuário.");
    }
  };
};

