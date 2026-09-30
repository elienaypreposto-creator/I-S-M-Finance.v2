/**
 * O driver pg, com connectionString, honra sslmode=require da URL e ignora
 * ssl.rejectUnauthorized do Pool. Esta variável precisa existir ANTES do pool.
 * Não desliga a cifra; só a validação da CA intermediária do Supabase.
 *
 * O pooler (6543) é transaction mode: SET de sessão vaza entre clientes.
 * SET LOCAL só vale dentro de BEGIN...COMMIT.
 */
(process.env as Record<string, string>).NODE_TLS_REJECT_UNAUTHORIZED = "0";

import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import {tenantAls} from "./tenant-als";
import {resolveDbUrls} from "./db-urls";

const {appUrl, adminUrl, ownerUrl} = resolveDbUrls();

const ssl =
    process.env.DB_REQUIRE_SSL === "true" || appUrl.includes("supabase.co") || ownerUrl.includes("supabase.co")
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
 * SET ROLE só para smoke que tenta escalar a partir de ism_app. A API não usa isto.
 */
export async function applySessionRole(client: Pick<pg.PoolClient, "query">, role: string): Promise<void> {
    if (!ROLE_IDENT.test(role)) {
        throw new Error(`[db] role de sessão inválida: ${role}`);
    }
    try {
        await client.query(`SET ROLE ${role}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[db] SET ROLE ${role} falhou - rode db:migrate (0013/0019): ${msg}`);
    }
    const {rows} = await client.query<{ current_user: string }>("SELECT current_user");
    const actual = rows[0]?.current_user;
    if (actual !== role) {
        throw new Error(
            `[db] SET ROLE ${role} não aplicou (current_user=${actual ?? "?"}). Rode db:migrate (0013/0019).`,
        );
    }
}

type RoleProbe = { current_user: string; rolsuper: boolean };

async function assertPoolLogin(p: pg.Pool, role: "ism_app" | "ism_admin" | "ism_owner"): Promise<void> {
    const client = await p.connect();
    try {
        const {rows} = await client.query<RoleProbe>(
            `SELECT current_user, r.rolsuper
             FROM pg_roles r
             WHERE r.rolname = current_user`,
        );
        const actual = rows[0]?.current_user;
        if (actual !== role) {
            throw new Error(`[db] pool deveria login como ${role}, actual=${actual ?? "?"}`);
        }
        if (rows[0]?.rolsuper) {
            throw new Error(`[db] ${role} não pode ser SUPERUSER (RESET ROLE anularia a RLS)`);
        }
        await client.query("RESET ROLE");
        const after = await client.query<RoleProbe>(
            `SELECT current_user, r.rolsuper
             FROM pg_roles r
             WHERE r.rolname = current_user`,
        );
        if (after.rows[0]?.current_user !== role || after.rows[0]?.rolsuper) {
            throw new Error(
                `[db] RESET ROLE alargou privilégios (user=${after.rows[0]?.current_user}, super=${after.rows[0]?.rolsuper})`,
            );
        }
    } finally {
        client.release();
    }
}

/** Pool padrão da API: login direto como `ism_app`. Sem SET ROLE. */
export const pool = makePool(appUrl);

pool.on("error", (err) => {
    console.error("Pool Postgres - erro inesperado:", err.message);
});

/** Pool da role dona (ism_owner NOSUPERUSER): só retenção de auditoria. Sem HTTP. */
export const ownerPool = makePool(ownerUrl, {max: 3});
ownerPool.on("error", (err) => {
    console.error("Pool owner Postgres - erro inesperado:", err.message);
});

/** Login direto como ism_admin. Só rotas administrativas explícitas. */
export const adminPool = makePool(adminUrl, {max: 2});
adminPool.on("error", (err) => {
    console.error("Pool admin Postgres - erro inesperado:", err.message);
});

export const rawDb = drizzle(pool, {schema});
export const ownerDb = drizzle(ownerPool, {schema});
export const adminDb = drizzle(adminPool, {schema});

type AppDb = NodePgDatabase<typeof schema>;

export async function closeDbPools(): Promise<void> {
    await Promise.all([pool.end(), ownerPool.end(), adminPool.end()]);
}

/** Sem login ism_app / ism_admin / ism_owner (NOSUPERUSER) o processo não sobe. */
export async function assertRlsRoles(): Promise<void> {
    await assertPoolLogin(pool, "ism_app");
    await assertPoolLogin(adminPool, "ism_admin");
    await assertPoolLogin(ownerPool, "ism_owner");
}

/**
 * Dentro de withTenantTx / ALS, db é a transação da request (SET LOCAL).
 * Fora, é o pool ism_app sem tenant: RLS devolve conjunto vazio.
 */
export const db: AppDb = new Proxy(rawDb, {
    get(target, prop, receiver) {
        const tx = tenantAls.getStore()?.tx as AppDb | undefined;
        const src = tx ?? target;
        const value = Reflect.get(src, prop, src === target ? receiver : src);
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(src) : value;
    },
});
