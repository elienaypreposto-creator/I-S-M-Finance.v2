import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

// We don't throw immediately to avoid crashing the whole serverless function
// during cold start, which allows non-DB routes (like healthz) to work.
if (!databaseUrl) {
  console.warn("DATABASE_URL is not set. Database queries will fail.");
}

export const pool = new Pool({ 
  connectionString: databaseUrl || "postgres://dummy:dummy@localhost:5432/dummy" 
});

export const db = drizzle(pool, { schema });

export * from "./schema";
