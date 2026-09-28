/**
 * withSuperadmin — NOVO (Onda 2, Card 4).
 *
 * Para rotas de OPERAÇÃO DO ISM, não de administração de uma empresa
 * específica: criar empresa, listar todas as empresas, vincular um usuário
 * a uma empresa. Nenhuma permissão em `usuario_permissoes` libera essas
 * rotas — só `req.user.superadmin === true` (setado exclusivamente por
 * `syncAdminPermissionsOnBoot`, nunca pela API).
 *
 * Pré-requisito: withAuth deve preceder este middleware na cadeia.
 */

import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";

export function withSuperadmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new AppError(401, "UNAUTHORIZED", "Usuário não autenticado."));
  }
  if (!req.user.superadmin) {
    return next(new AppError(403, "FORBIDDEN", "Esta operação exige acesso de superadmin."));
  }
  next();
}