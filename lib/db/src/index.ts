import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: {
    rejectUnauthorized: false
  },
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('⚠️ Erro inesperado no pool do Postgres:', err);
});

// Inicialização direta, sem Proxy, mantendo o contexto correto do Drizzle
export const db = drizzle(pool, { schema });

export * from "./schema";