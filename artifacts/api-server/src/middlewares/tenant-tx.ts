/**
 * Abre a transação da request com SET LOCAL app.empresa_id (ISMF-15).
 * Montar imediatamente após withTenant / v1Auth (quando req.tenant já existe).
 *
 * SET LOCAL só sobrevive enquanto a transação está aberta — por isso a tx
 * envolve o resto da request até `finish`/`close`. Seguro em transaction-mode
 * (Supabase pooler) e em session-mode (Docker/Postgres direto).
 */

import type {NextFunction, Request, Response} from "express";
import {withTenantTx} from "@workspace/db";

export function withTenantTxMiddleware(req: Request, res: Response, next: NextFunction): void {
    const empresaId = req.tenant?.empresaId;
    if (!empresaId) {
        next();
        return;
    }

    void withTenantTx(empresaId, async () => {
        await new Promise<void>((resolve, reject) => {
            const finish = () => {
                res.off("finish", finish);
                res.off("close", finish);
                resolve();
            };
            res.once("finish", finish);
            res.once("close", finish);
            try {
                next();
            } catch (err) {
                res.off("finish", finish);
                res.off("close", finish);
                reject(err);
            }
        });
    }).catch((err: unknown) => {
        if (!res.headersSent) {
            next(err);
            return;
        }
        console.error("[tenant-tx]", err);
    });
}
