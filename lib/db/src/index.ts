/**
 * SSL + Supabase Pooler (PgBouncer): ao usar `connectionString`, o driver `pg`
 * pode extrair `sslmode=require` da URL e criar um TLSSocket que valida o
 * certificado — ignorando `ssl: { rejectUnauthorized: false }` do Pool.
 *
 * Definir esta variável ANTES de criar o pool garante que o Node.js aceite o
 * certificado da CA intermediária do Supabase sem rejeitar a conexão.
 *
 * Não desabilita criptografia — apenas a validação do certificado CA.
 * Remover quando o cert Supabase for adicionado ao bundle: `ssl: { ca: ... }`.
 */
(process.env as Record<string, string>).NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurado.");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Pool Postgres — erro inesperado:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";