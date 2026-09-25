/**
 * SSL + Supabase Pooler (PgBouncer): ao usar `connectionString`, o driver `pg`
 * pode extrair `sslmode=require` da URL e criar um TLSSocket que valida o
 * certificado - ignorando `ssl: { rejectUnauthorized: false }` do Pool.
 *
 * Definir esta variável ANTES de criar o pool garante que o Node.js aceite o
 * certificado da CA intermediária do Supabase sem rejeitar a conexão.
 *
 * Pooler: o pooler do Supabase (porta 6543) corre em **transaction mode**.
 * SET de sessão vaza entre clientes; SET LOCAL só vale dentro de BEGIN…COMMIT
 * e é o único modo seguro. Session mode (5432 direto / Docker) também aceita
 * SET LOCAL — usamos sempre SET LOCAL.
 *
 * Não desabilita criptografia - apenas a validação do certificado CA.
 * Remover quando o cert Supabase for adicionado ao bundle: `ssl: { ca: ... }`.
 */
(process.env as Record<string, string>).NODE_TLS_REJECT_UNAUTHORIZED = "0";

import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import {tenantAls} from "./tenant-als";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurado.");
}

const ssl =
    process.env.DB_REQUIRE_SSL === "true" || process.env.DATABASE_URL.includes("supabase.co")
        ? {rejectUnauthorized: false}
        : undefined;

const poolMax = Math.max(5, Number(process.env.DB_POOL_MAX ?? 12) || 12);

const ROLE_IDENT = /^[a-z_][a-z0-9_]*$/;

function makePool(connectionString: string, extra?: pg.PoolConfig): pg.Pool {
    return new pg.Pool({
        connectionString,
        max: poolMax,
        ssl,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ...extra,
    });
}

/**
 * Aplica SET ROLE e confirma current_user. Falha = throw (nunca warn-and-continue).
 */
export async function applySessionRole(client: Pick<pg.PoolClient, "query">, role: string): Promise<void> {
    if (!ROLE_IDENT.test(role)) {
        throw new Error(`[db] role de sessão inválida: ${role}`);
    }
    try {
        await client.query(`SET ROLE ${role}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[db] SET ROLE ${role} falhou — rode db:migrate (0013): ${msg}`);
    }
    const {rows} = await client.query<{current_user: string}>("SELECT current_user");
    const actual = rows[0]?.current_user;
    if (actual !== role) {
        throw new Error(
            `[db] SET ROLE ${role} não aplicou (current_user=${actual ?? "?"}). Rode db:migrate (0013).`,
        );
    }
}

/**
 * SET ROLE obrigatório após acquire. Falha = recusa a conexão (fail-hard).
 * O evento `connect` do pg não é awaited — sobrescrever `pool.connect` evita
 * corrida com a primeira query. Sem skip: o pool padrão nunca sobrevive como
 * dono/superuser (FORCE RLS é ignorado por SUPERUSER).
 */
export function attachSessionRole(p: pg.Pool, role: "ism_app" | "ism_admin"): void {
    const original = p.connect.bind(p) as {
        (): Promise<pg.PoolClient>;
        (cb: (err: Error, client: pg.PoolClient, done: (release?: unknown) => void) => void): void;
    };

    const apply = async (client: pg.PoolClient): Promise<pg.PoolClient> => {
        try {
            await applySessionRole(client, role);
        } catch (err) {
            try {
                client.release();
            } catch {
                /* já libertado ou conexão morta */
            }
            throw err;
        }
        return client;
    };

    p.connect = ((cb?: (err: Error, client: pg.PoolClient, done: (release?: unknown) => void) => void) => {
        if (typeof cb === "function") {
            return original((err, client, done) => {
                if (err || !client) return cb(err, client, done);
                void apply(client).then(
                    (ready) => cb(undefined as unknown as Error, ready, done),
                    (roleErr: Error) => cb(roleErr, undefined as unknown as pg.PoolClient, done),
                );
            });
        }
        return original().then(apply);
    }) as typeof p.connect;
}

async function assertPoolRole(p: pg.Pool, role: "ism_app" | "ism_admin"): Promise<void> {
    const client = await p.connect();
    try {
        const {rows} = await client.query<{current_user: string}>("SELECT current_user");
        const actual = rows[0]?.current_user;
        if (actual !== role) {
            throw new Error(`[db] pool deveria ser ${role}, actual=${actual ?? "?"}`);
        }
    } finally {
        client.release();
    }
}

/** Pool padrão da API: role `ism_app` (sem BYPASSRLS). Nunca usar para retenção/migrate. */
export const pool = makePool(process.env.DATABASE_URL);
attachSessionRole(pool, "ism_app");

pool.on("error", (err) => {
    console.error("Pool Postgres - erro inesperado:", err.message);
});

const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;

/** Pool da role dona — retenção de auditoria, lookups pre-RLS (token v1). Sem SET ROLE. */
export const ownerPool = makePool(ownerUrl, {max: 3});
ownerPool.on("error", (err) => {
    console.error("Pool owner Postgres - erro inesperado:", err.message);
});

/** Pool BYPASSRLS — só rotas administrativas explícitas (ex.: GET /auditoria?todas_empresas=1). */
export const adminPool = makePool(ownerUrl, {max: 2});
attachSessionRole(adminPool, "ism_admin");
adminPool.on("error", (err) => {
    console.error("Pool admin Postgres - erro inesperado:", err.message);
});

export const rawDb = drizzle(pool, {schema});
export const ownerDb = drizzle(ownerPool, {schema});
export const adminDb = drizzle(adminPool, {schema});

type AppDb = NodePgDatabase<typeof schema>;

/**
 * Proxy: dentro de `withTenantTx` / ALS, `db` é a transação da request
 * (já com SET LOCAL app.empresa_id). Fora, é o pool `ism_app` sem tenant
 * — RLS devolve conjunto vazio nas tabelas de domínio.
 */
export async function closeDbPools(): Promise<void> {
    await Promise.all([pool.end(), ownerPool.end(), adminPool.end()]);
}

/** Fail-hard no boot: sem ism_app / ism_admin o processo não sobe. */
export async function assertRlsRoles(): Promise<void> {
    await assertPoolRole(pool, "ism_app");
    await assertPoolRole(adminPool, "ism_admin");
}

export const db: AppDb = new Proxy(rawDb, {
    get(target, prop, receiver) {
        const tx = tenantAls.getStore()?.tx as AppDb | undefined;
        const src = tx ?? target;
        const value = Reflect.get(src, prop, src === target ? receiver : src);
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(src) : value;
    },
});
