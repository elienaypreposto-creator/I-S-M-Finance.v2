/**
 * Transação da request com SET LOCAL app.empresa_id.
 * Montar após withTenant / v1Auth. SET LOCAL só vale enquanto a tx está aberta,
 * por isso envolve a request inteira (pooler em transaction mode).
 *
 * O `res.end` fica retido até o fim da transação: quem consulta logo depois da
 * resposta (a tela que recarrega a lista, o e2e) precisa enxergar o que acabou de
 * ser gravado. Antes o COMMIT rodava no `finish`, depois de a resposta sair.
 *
 * - Resposta 5xx: ROLLBACK (nada do que a rota gravou fica) e a resposta de erro sai.
 * - COMMIT falhou: a resposta retida vira 500; se já houve `res.write` (streaming),
 *   o socket é destruído para o cliente não tomar a resposta por sucesso.
 * - Cliente desconectou (`close`) antes do fim: a transação termina na hora, sem
 *   prender a conexão do pool.
 */

import type {NextFunction, Request, RequestHandler, Response} from "express";
import {withTenantTx} from "@workspace/db";

type ArgsEnd = Parameters<Response["end"]>;
type ExecutarNaTx = (empresaId: number, work: () => Promise<void>) => Promise<unknown>;

/** Resposta 5xx: desfaz a transação e só depois libera a resposta de erro. */
class RollbackPorErro extends Error {
    constructor() {
        super("rollback: resposta 5xx");
    }
}

export function criarTenantTxMiddleware(executar: ExecutarNaTx): RequestHandler {
    return function withTenantTxMiddleware(req: Request, res: Response, next: NextFunction): void {
        const empresaId = req.tenant?.empresaId;
        if (!empresaId) {
            next();
            return;
        }

        const endOriginal = res.end.bind(res) as (...args: ArgsEnd) => Response;
        let endRetido: ArgsEnd | null = null;
        const restaurar = () => {
            res.end = endOriginal as Response["end"];
        };

        void executar(empresaId, async () => {
            // Cliente desistiu enquanto aguardava conexão: "close" já disparou e
            // não dispara de novo - sem isto a conexão ficaria presa para sempre.
            if (res.writableEnded || res.destroyed) return;
            await new Promise<void>((resolve, reject) => {
                const fechou = () => resolve();
                res.once("close", fechou);
                res.end = ((...args: ArgsEnd) => {
                    res.off("close", fechou);
                    endRetido = args;
                    if (res.statusCode >= 500) reject(new RollbackPorErro());
                    else resolve();
                    return res;
                }) as Response["end"];
                try {
                    next();
                } catch (err) {
                    res.off("close", fechou);
                    restaurar();
                    reject(err);
                }
            });
        })
            .then(() => {
                restaurar();
                if (endRetido) endOriginal(...endRetido);
            })
            .catch((err: unknown) => {
                restaurar();
                if (err instanceof RollbackPorErro) {
                    if (endRetido) endOriginal(...endRetido);
                    return;
                }
                if (endRetido) {
                    // COMMIT falhou depois de a rota responder: não confirmar o que não foi gravado.
                    console.error("[tenant-tx] commit falhou", err);
                    if (!res.headersSent) {
                        res.status(500).json({
                            data: null,
                            meta: null,
                            errors: [{code: "INTERNAL_ERROR", message: "Não foi possível gravar a operação.", details: null}],
                        });
                    } else {
                        res.destroy(err instanceof Error ? err : new Error(String(err)));
                    }
                    return;
                }
                if (!res.headersSent) {
                    next(err);
                    return;
                }
                console.error("[tenant-tx]", err);
                res.destroy(err instanceof Error ? err : new Error(String(err)));
            });
    };
}

export const withTenantTxMiddleware = criarTenantTxMiddleware((empresaId, work) => withTenantTx(empresaId, work));
