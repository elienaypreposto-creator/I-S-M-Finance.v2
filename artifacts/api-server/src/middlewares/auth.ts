/**
 * withAuth — middleware de autenticação stateless via JWE.
 *
 * O(1) — apenas operação criptográfica local, zero I/O de banco por request.
 *
 * Trade-off aceito: um utilizador bloqueado após a emissão de um Access Token
 * pode continuar a usá-lo até ao fim do TTL (máx 15 min). Para revogação
 * imediata, a única solução é reduzir o TTL ou adicionar uma consulta ao banco
 * aqui (com custo de I/O em cada request).
 */

import type { NextFunction, Request, Response } from "express";
import type { AccessTokenPayload } from "../services/token.service";
import { verifyAccessToken } from "../services/token.service";

export type AuthUser = {
  id: number;
  email: string;
  permissions: string[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const jsonError = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ data: null, meta: null, errors: [{ code, message }] });

const extractBearerToken = (authHeader?: string): string | null => {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  return parts[0] === "Bearer" && parts[1] ? parts[1] : null;
};

export const withAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return jsonError(res, 401, "UNAUTHORIZED", "Token de autenticação ausente ou inválido.");
  }

  let payload: AccessTokenPayload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    return jsonError(res, 401, "UNAUTHORIZED", "Token expirado ou inválido.");
  }

  const id = parseInt(payload.sub, 10);
  if (isNaN(id)) {
    return jsonError(res, 401, "UNAUTHORIZED", "Token malformado: sub inválido.");
  }

  req.user = { id, email: payload.email, permissions: payload.permissions };
  return next();
};

export const authMiddleware = withAuth;
