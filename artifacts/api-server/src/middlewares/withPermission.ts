/**
 * withPermission — Middleware de autorização stateless por permissão.
 *
 * Complexidade: O(n) onde n = permissões no token (tipicamente < 30) — zero I/O.
 * As permissões são lidas de req.user.permissions, embutidas no JWE pelo
 * signAccessToken em cada login/refresh. Nenhuma consulta ao banco é feita aqui.
 *
 * Pré-requisito: withAuth deve preceder este middleware na cadeia.
 *
 * ALTERADO — Card 2 (Permissões): a permissão curinga `"*"` deixou de
 * existir. `req.user.superadmin` (boolean, embutido no token — ver
 * token.service.ts) é o ÚNICO bypass total. Uma string `"*"` que apareça
 * em `permissions[]` (não deveria mais acontecer — ver migration
 * 0017_permissoes_empresa_superadmin.sql) é tratada como uma permissão
 * comum, sem significado especial.
 *
 * Uso:
 *   router.delete("/lancamentos/:id",
 *     withPermission("financeiro:lancamentos:deletar"),
 *     handler
 *   );
 */

import type {NextFunction, Request, Response} from "express";
import {AppError} from "../utils/app-error";

export const withPermission = (codigoPermissao: string) =>
    (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(new AppError(401, "UNAUTHORIZED", "Usuário não autenticado."));
        }

        if (req.user.superadmin) return next();

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

/**
 * Helper para checks inline (ex.: alterar_valor no PUT de lançamentos).
 * ALTERADO — Card 2: não trata mais `"*"` como wildcard. Quem precisa do
 * bypass de superadmin fora de um middleware (isto é uma função pura, sem
 * acesso a req.user completo) deve checar `req.user.superadmin`
 * separadamente antes de chamar isto — ver o call site em
 * domains/financial/lancamentos/router.ts.
 */
export function hasPermission(permissions: string[] | undefined, codigoPermissao: string): boolean {
    if (!permissions?.length) return false;
    return permissions.includes(codigoPermissao);
}