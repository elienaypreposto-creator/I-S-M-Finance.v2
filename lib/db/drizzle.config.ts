import {defineConfig} from "drizzle-kit";

/**
 * `drizzle-kit push` é permitido APENAS em desenvolvimento local.
 * Produção/TST/HML usam `pnpm --filter @workspace/db run db:migrate`.
 * Toda alteração em `src/schema/` deve vir com o `.sql` gerado no mesmo PR.
 */
const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!url) {
    throw new Error("DATABASE_MIGRATE_URL / DATABASE_URL is missing, ensure the database is provisioned");
}

export default defineConfig({
    schema: "./src/schema/index.ts",
    out: "./migrations",
    dialect: "postgresql",
    dbCredentials: {
        url,
    },
});