/**
 * request-context.ts — NOVO (Onda 2, Card 3/RLS).
 *
 * Guarda, por requisição, uma instância Drizzle ligada a UM client dedicado
 * do pool, dentro de uma transação com `SET LOCAL app.current_empresa_id`
 * já aplicado. Usa AsyncLocalStorage para que TODO código que já importa
 * `db` de "@workspace/db" (todos os `*.service.ts` existentes, sem exceção)
 * passe a usar automaticamente essa conexão — ver a Proxy em `client.ts`.
 *
 * Isso evita reescrever a assinatura de toda função de service para receber
 * um `db` por parâmetro. O middleware que preenche este contexto é
 * `empresa-context.ts`, montado logo depois de `withAuth`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import * as schema from "./schema";

export type EmpresaContext = {
  db: NodePgDatabase<typeof schema>;
  client: PoolClient;
  empresaId: number;
};

export const empresaContextStorage = new AsyncLocalStorage<EmpresaContext>();

/** Devolve o db escopado da requisição atual, ou undefined fora de uma requisição (scripts, testes, migrations). */
export function getScopedDb(): NodePgDatabase<typeof schema> | undefined {
  return empresaContextStorage.getStore()?.db;
}

/** Devolve a empresa da requisição atual, se houver. Útil em código que precisa do id sem passar por req.user. */
export function getCurrentEmpresaId(): number | undefined {
  return empresaContextStorage.getStore()?.empresaId;
}