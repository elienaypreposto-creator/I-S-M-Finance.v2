/**
 *
 * Substitui `drizzle-kit push` no boot do container. Em bancos já existentes
 * (schema criado por push), carimba 0000–0008 em `__drizzle_migrations` sem
 * reexecutar o SQL histórico. Em banco vazio, aplica o histórico completo.
 *
 * Uso: pnpm --filter @workspace/db run db:migrate
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Mesmo workaround do client.ts: o driver `pg` honra sslmode=require da URL e
 * valida o certificado, ignorando `ssl: { rejectUnauthorized: false }`.
 * Precisa estar definido ANTES de conectar.
 */
(process.env as Record<string, string>).NODE_TLS_REJECT_UNAUTHORIZED = "0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "migrations");
const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
const BASELINE_THROUGH_IDX = 8;

/** Local: lê .env se existir. Deploy: DATABASE_URL já vem do compose - não sobrescreve. */
function loadOptionalEnvFiles(): void {
    const candidates = [
        path.resolve(__dirname, "../../.env"),
        path.resolve(process.cwd(), ".env"),
    ];
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        process.loadEnvFile(file);
        return;
    }
}

type Journal = {
    entries: Array<{idx: number; tag: string; when: number}>;
};

function requireDatabaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error("DATABASE_URL não configurado. Defina a variável antes de db:migrate.");
    }
    return url;
}

function hashMigrationSql(sql: string): string {
    return crypto.createHash("sha256").update(sql).digest("hex");
}

async function tableExists(client: pg.Client, schema: string, table: string): Promise<boolean> {
    const {rows} = await client.query<{exists: boolean}>(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2
        ) AS exists`,
        [schema, table],
    );
    return Boolean(rows[0]?.exists);
}

async function stampBaselineIfNeeded(client: pg.Client): Promise<string[]> {
    const hasUsuarios = await tableExists(client, "public", "usuarios");
    const hasEmpresas = await tableExists(client, "public", "empresas");
    if (!hasUsuarios || hasEmpresas) {
        return [];
    }

    await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        )
    `);

    const {rows: existing} = await client.query<{hash: string}>(
        `SELECT hash FROM drizzle.__drizzle_migrations`,
    );
    if (existing.length > 0) {
        return [];
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
    const stamped: string[] = [];

    for (const entry of journal.entries) {
        if (entry.idx > BASELINE_THROUGH_IDX) continue;
        const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`Migration em falta para stamp da baseline: ${sqlPath}`);
        }
        const sql = fs.readFileSync(sqlPath, "utf8");
        const hash = hashMigrationSql(sql);
        await client.query(
            `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
            [hash, entry.when],
        );
        stamped.push(entry.tag);
    }

    return stamped;
}

async function run(): Promise<void> {
    loadOptionalEnvFiles();
    const connectionString = requireDatabaseUrl();
    const client = new pg.Client({
        connectionString,
        ssl:
            process.env.DB_REQUIRE_SSL === "true" || connectionString.includes("supabase.co")
                ? {rejectUnauthorized: false}
                : undefined,
    });

    await client.connect();
    try {
        const stamped = await stampBaselineIfNeeded(client);
        if (stamped.length > 0) {
            console.log(
                `[db:migrate] Banco existente detectado - baseline carimbada sem reexecutar: ${stamped.join(", ")}`,
            );
        }

        const db = drizzle(client);
        console.log("[db:migrate] Aplicando migrations pendentes…");
        await migrate(db, {migrationsFolder});
        console.log("[db:migrate] Concluído.");
    } finally {
        await client.end();
    }
}

run().catch((error: unknown) => {
    console.error("[db:migrate] Falhou:", error);
    process.exit(1);
});
