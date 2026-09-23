import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit push` é permitido APENAS em desenvolvimento local.
 * Produção/TST/HML usam `pnpm --filter @workspace/db run db:migrate`.
 * Toda alteração em `src/schema/` deve vir com o `.sql` gerado no mesmo PR.
 */
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});