/**
 *
 * Substitui `drizzle-kit push` no boot do container. Em bancos já existentes
 * (schema criado por push), carimba 0000–0008 em `__drizzle_migrations` sem
 * reexecutar o SQL histórico. Em banco vazio, aplica o histórico completo.
 *
 * Corre como DATABASE_MIGRATE_URL (ism_user, só DDL). Senhas de
 * ism_app / ism_admin / ism_owner vêm do ambiente — nunca do SQL versionado.
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
import {pgUrlPassword} from "./src/db-urls";

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

/** Local: lê .env se existir. Deploy: variáveis já vêm do compose - não sobrescreve. */
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

function requireMigrateUrl(): string {
    const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
    if (!url) {
        throw new Error(
            "DATABASE_MIGRATE_URL (ou DATABASE_OWNER_URL / DATABASE_URL) não configurado. db:migrate corre como bootstrap.",
        );
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

async function hashesAplicados(client: pg.Client): Promise<Set<string>> {
    const existe = await tableExists(client, "drizzle", "__drizzle_migrations");
    if (!existe) return new Set();
    const {rows} = await client.query<{hash: string}>(`SELECT hash FROM drizzle.__drizzle_migrations`);
    return new Set(rows.map((row) => row.hash));
}

/** Nome de cada migration cujo hash entrou em `__drizzle_migrations` nesta execução. */
async function logarMigrationsAplicadas(client: pg.Client, antes: Set<string>): Promise<void> {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
    const depois = await hashesAplicados(client);
    const aplicadas: string[] = [];

    for (const entry of journal.entries) {
        const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
        if (!fs.existsSync(sqlPath)) continue;
        const hash = hashMigrationSql(fs.readFileSync(sqlPath, "utf8"));
        if (depois.has(hash) && !antes.has(hash)) aplicadas.push(entry.tag);
    }

    if (aplicadas.length === 0) {
        console.log("[db:migrate] Nenhuma migration nova.");
        return;
    }
    for (const tag of aplicadas) {
        console.log(`[db:migrate] Aplicada: ${tag}`);
    }
}

async function applyRolePasswords(client: pg.Client, ownerUrl: string): Promise<void> {
    const appPass = process.env.ISM_APP_PASSWORD ?? pgUrlPassword(ownerUrl);
    const adminPass = process.env.ISM_ADMIN_PASSWORD ?? pgUrlPassword(ownerUrl);
    const ownerPass = process.env.ISM_OWNER_PASSWORD ?? pgUrlPassword(ownerUrl);
    if (!appPass || !adminPass || !ownerPass) {
        throw new Error(
            "ISM_APP_PASSWORD, ISM_ADMIN_PASSWORD e ISM_OWNER_PASSWORD são obrigatórios (ou a URL de migrate tem de ter senha).",
        );
    }

    const {rows: appSql} = await client.query<{cmd: string}>(
        "SELECT format('ALTER ROLE ism_app LOGIN PASSWORD %L', $1::text) AS cmd",
        [appPass],
    );
    const {rows: adminSql} = await client.query<{cmd: string}>(
        "SELECT format('ALTER ROLE ism_admin LOGIN PASSWORD %L', $1::text) AS cmd",
        [adminPass],
    );
    const {rows: ownerSql} = await client.query<{cmd: string}>(
        "SELECT format('ALTER ROLE ism_owner LOGIN PASSWORD %L', $1::text) AS cmd",
        [ownerPass],
    );
    if (!appSql[0]?.cmd || !adminSql[0]?.cmd || !ownerSql[0]?.cmd) {
        throw new Error("Falha a montar ALTER ROLE PASSWORD.");
    }
    await client.query(appSql[0].cmd);
    await client.query(adminSql[0].cmd);
    await client.query(ownerSql[0].cmd);
    console.log("[db:migrate] Roles ism_app, ism_admin e ism_owner com LOGIN + senha de ambiente.");

    try {
        await client.query("ALTER ROLE ism_owner WITH BYPASSRLS");
        console.log("[db:migrate] ism_owner BYPASSRLS (retenção sob FORCE RLS).");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[db:migrate] ism_owner sem BYPASSRLS neste host: ${msg}`);
    }
}

/** Tabelas novas criadas pelo bootstrap (ism_user) passam a ism_owner. */
async function reassignPublicToOwner(client: pg.Client): Promise<void> {
    await client.query(`
        DO
        $$
            DECLARE
                obj  record;
                kind text;
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ism_owner') THEN
                    RETURN;
                END IF;
                FOR obj IN
                    SELECT n.nspname AS sch, c.relname AS rel, c.relkind
                    FROM pg_class c
                             JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public'
                      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
                      AND pg_get_userbyid(c.relowner) = current_user
                      -- Sequence de coluna serial acompanha a tabela; ALTER direto nela falha.
                      AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1
                                                           FROM pg_depend d
                                                           WHERE d.classid = 'pg_class'::regclass
                                                             AND d.objid = c.oid
                                                             AND d.refclassid = 'pg_class'::regclass
                                                             AND d.deptype IN ('a', 'i')))
                    LOOP
                        kind := CASE obj.relkind
                                    WHEN 'v' THEN 'VIEW'
                                    WHEN 'm' THEN 'MATERIALIZED VIEW'
                                    WHEN 'S' THEN 'SEQUENCE'
                                    ELSE 'TABLE'
                            END;
                        EXECUTE format('ALTER %s %I.%I OWNER TO ism_owner', kind, obj.sch, obj.rel);
                    END LOOP;
            END
        $$;
    `);
}

async function run(): Promise<void> {
    loadOptionalEnvFiles();
    const connectionString = requireMigrateUrl();
    const client = new pg.Client({
        connectionString,
        ssl:
            process.env.DB_REQUIRE_SSL === "true" || connectionString.includes("supabase.co")
                ? {rejectUnauthorized: false}
                : undefined,
    });

    await client.connect();
    try {
        await client.query("SET statement_timeout = 0");
        const stamped = await stampBaselineIfNeeded(client);
        if (stamped.length > 0) {
            console.log(
                `[db:migrate] Banco existente detectado - baseline carimbada sem reexecutar: ${stamped.join(", ")}`,
            );
        }

        const db = drizzle(client);
        const antes = await hashesAplicados(client);
        console.log("[db:migrate] Aplicando migrations pendentes…");
        await migrate(db, {migrationsFolder});
        await logarMigrationsAplicadas(client, antes);
        await applyRolePasswords(client, connectionString);
        await reassignPublicToOwner(client);
        console.log("[db:migrate] Concluído.");
    } finally {
        await client.end();
    }
}

run().catch((error: unknown) => {
    console.error("[db:migrate] Falhou:", error);
    process.exit(1);
});
