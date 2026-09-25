/**
 * Transação da request com SET LOCAL app.empresa_id.
 * Montar após withTenant / v1Auth. SET LOCAL só vale enquanto a tx está aberta,
 * por isso envolve a request até finish/close (pooler em transaction mode).
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
