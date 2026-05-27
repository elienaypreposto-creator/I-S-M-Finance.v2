/**
 * withPermission — Middleware de autorização stateless por permissão.
 *
 * Complexidade: O(n) onde n = permissões no token (tipicamente < 30) — zero I/O.
 * As permissões são lidas de req.user.permissions, embutidas no JWE pelo
 * signAccessToken em cada login/refresh. Nenhuma consulta ao banco é feita aqui.
 *
 * Pré-requisito: withAuth deve preceder este middleware na cadeia.
 *
 * Uso:
 *   router.delete("/lancamentos/:id",
 *     withPermission("financeiro:lancamentos:deletar"),
 *     handler
 *   );
 */

import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";

export const withPermission = (codigoPermissao: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Usuário não autenticado."));
    }

    if (!req.user.permissions.includes(codigoPermissao)) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          `Acesso negado: permissão "${codigoPermissao}" necessária.`,
        ),
      );
    }

    next();
  };

export const requirePermission = withPermission;
