import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { tokensApiTable } from "@workspace/db/schema";
import { errorResponse } from "../utils/response";

const getBearerToken = (authHeader?: string) => {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
};

export const v1AuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return errorResponse(res, 401, "UNAUTHORIZED", "Token Bearer da API v1 ausente ou inválido.");
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const hoje = new Date().toISOString().split("T")[0];

    const [tokenValido] = await db
      .select({
        id: tokensApiTable.id,
        ativo: tokensApiTable.ativo,
      })
      .from(tokensApiTable)
      .where(
        and(
          eq(tokensApiTable.token_hash, tokenHash),
          eq(tokensApiTable.ativo, true),
          or(isNull(tokensApiTable.data_expiracao), gte(tokensApiTable.data_expiracao, hoje)),
        ),
      )
      .limit(1);

    if (!tokenValido) {
      return errorResponse(res, 401, "UNAUTHORIZED", "Token da API v1 inválido, inativo ou expirado.");
    }

    return next();
  } catch (e) {
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao validar token da API v1.", String(e));
  }
};

