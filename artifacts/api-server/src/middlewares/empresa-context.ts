/**
 * empresaContext — NOVO (Onda 2, Cards 2+3).
 *
 * Roda logo depois de `withAuth` na pilha (ver routes/index.ts). Abre um
 * client dedicado do pool, inicia uma transação, faz
 * `SET LOCAL app.current_empresa_id = <empresa do token>` e guarda uma
 * instância Drizzle ligada a esse client no AsyncLocalStorage — o Proxy em
 * `@workspace/db` (client.ts) usa essa instância automaticamente para toda
 * query feita durante a requisição, sem precisar mudar nenhum service.
 *
 * Commit ao final se a resposta for 2xx/3xx, rollback caso contrário —
 * ver `res.on("finish")`. O client SEMPRE é liberado de volta ao pool.
 *
 * IMPORTANTE: `SET LOCAL` só vale dentro da transação/conexão em que foi
 * definido — por isso este middleware precisa ser a ÚNICA fonte de conexão
 * para toda a requisição (nenhum service pode abrir sua própria conexão
 * separada e esperar que a RLS já esteja contextualizada nela).
 */

import type { NextFunction, Request, Response } from "express";
import { pool, empresaContextStorage } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { errorResponse } from "../utils/response";

export async function empresaContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const empresaId = req.user?.empresaId;
  if (empresaId === undefined) {
    // Não deveria acontecer — withAuth já teria barrado antes. Defensivo.
    return errorResponse(res, 401, "UNAUTHORIZED", "Contexto de empresa ausente.") as unknown as void;
  }

  const client = await pool.connect();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    client.release();
  };

  try {
    await client.query("BEGIN");
    // Parametrizado por segurança, mesmo empresaId sendo um número validado pelo JWT.
    await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [String(empresaId)]);

    const scopedDb = drizzle(client, { schema });

    res.on("finish", () => {
      const commitOuRollback = res.statusCode >= 200 && res.statusCode < 400 ? "COMMIT" : "ROLLBACK";
      client
        .query(commitOuRollback)
        .catch((err) => console.error("[empresaContext] erro ao finalizar transação:", err))
        .finally(release);
    });
    // Requisições abortadas pelo cliente (sem "finish") ainda precisam liberar o client.
    res.on("close", () => {
      if (!res.writableEnded) {
        client.query("ROLLBACK").catch(() => {}).finally(release);
      }
    });

    empresaContextStorage.run({ db: scopedDb, client, empresaId }, () => next());
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    release();
    next(err);
  }
}