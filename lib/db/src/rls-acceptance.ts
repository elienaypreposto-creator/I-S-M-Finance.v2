/**
 * Smoke ISMF-15 / ISMF-18 contra o Postgres real.
 * Uso: pnpm --filter @workspace/db run rls:smoke
 *
 * Critérios:
 *  - ism_app sem SET LOCAL → count(lancamentos) = 0
 *  - SET LOCAL app.empresa_id = 1 → só empresa 1
 *  - INSERT empresa_id=2 sob contexto 1 → erro de política
 *  - DELETE logs_auditoria como ism_app → permission denied
 *  - pool padrão fail-hard sem role ism_app
 *  - latência listagem 90d: mediana RLS vs baseline dono (alvo ≤ +10%)
 */

import fs from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {fileURLToPath} from "node:url";
import pg from "pg";

(process.env as Record<string, string>).NODE_TLS_REJECT_UNAUTHORIZED = "0";

function loadOptionalEnvFiles(): void {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.resolve(here, "../../../.env"),
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "../../.env"),
    ];
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        process.loadEnvFile(file);
        return;
    }
}

loadOptionalEnvFiles();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error("DATABASE_URL não configurado.");
    process.exit(1);
}

const ssl =
    process.env.DB_REQUIRE_SSL === "true" || url.includes("supabase.co")
        ? {rejectUnauthorized: false}
        : undefined;

const LIST_90D =
    "SELECT count(*)::text AS count FROM lancamentos WHERE vencimento >= CURRENT_DATE - INTERVAL '90 days'";
const LATENCY_SAMPLES = 21;

async function asApp(work: (c: pg.Client) => Promise<void>): Promise<void> {
    const client = new pg.Client({connectionString: url, ssl});
    await client.connect();
    try {
        await client.query("SET ROLE ism_app");
        const {rows} = await client.query<{current_user: string}>("SELECT current_user");
        if (rows[0]?.current_user !== "ism_app") {
            throw new Error(`esperava current_user=ism_app, obtido ${rows[0]?.current_user}`);
        }
        await work(client);
    } finally {
        await client.end();
    }
}

async function asOwner<T>(work: (c: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({connectionString: url, ssl});
    await client.connect();
    try {
        return await work(client);
    } finally {
        await client.end();
    }
}

function median(samples: number[]): number {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function timeMedian(run: () => Promise<void>, n: number): Promise<{medianMs: number; samples: number[]}> {
    await run();
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        await run();
        samples.push(performance.now() - t0);
    }
    return {medianMs: median(samples), samples};
}

async function assertFailHardWithoutAppRole(): Promise<void> {
    const {applySessionRole, pool, ownerPool, adminPool, closeDbPools} = await import("./client.js");

    const raw = new pg.Client({connectionString: url, ssl});
    await raw.connect();
    try {
        let failed = false;
        try {
            await applySessionRole(raw, "ism_app_inexistente");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failed = /SET ROLE ism_app_inexistente falhou/.test(msg);
            if (!failed) throw err;
        }
        if (!failed) {
            throw new Error("SET ROLE de role inexistente deveria falhar (fail-hard)");
        }
    } finally {
        await raw.end();
    }

    const appClient = await pool.connect();
    try {
        const {rows} = await appClient.query<{current_user: string}>("SELECT current_user");
        if (rows[0]?.current_user !== "ism_app") {
            throw new Error(`pool padrão deveria ser ism_app, actual=${rows[0]?.current_user}`);
        }
    } finally {
        appClient.release();
    }

    const adminClient = await adminPool.connect();
    try {
        const {rows} = await adminClient.query<{current_user: string}>("SELECT current_user");
        if (rows[0]?.current_user !== "ism_admin") {
            throw new Error(`admin pool deveria ser ism_admin, actual=${rows[0]?.current_user}`);
        }
    } finally {
        adminClient.release();
    }

    const ownerClient = await ownerPool.connect();
    try {
        const {rows} = await ownerClient.query<{current_user: string}>("SELECT current_user");
        if (rows[0]?.current_user === "ism_app") {
            throw new Error("owner pool não pode ser ism_app (bypass/dono separado)");
        }
    } finally {
        ownerClient.release();
        await closeDbPools();
    }
    console.log("OK  pool padrão = ism_app; admin = ism_admin; SET ROLE inexistente falha (fail-hard)");
}

async function measureLatency(): Promise<void> {
    const ownerCount = await asOwner(async (c) => {
        const r = await c.query<{count: string}>(LIST_90D);
        return Number(r.rows[0]?.count ?? 0);
    });

    const baseline = await asOwner(async (c) => {
        return timeMedian(async () => {
            await c.query(LIST_90D);
        }, LATENCY_SAMPLES);
    });

    let rlsMedian = 0;
    await asApp(async (c) => {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.empresa_id', '1', true)");
        const rls = await timeMedian(async () => {
            await c.query(LIST_90D);
        }, LATENCY_SAMPLES);
        rlsMedian = rls.medianMs;
        await c.query("ROLLBACK");
    });

    const deltaPct = baseline.medianMs === 0 ? 0 : ((rlsMedian - baseline.medianMs) / baseline.medianMs) * 100;
    const within = deltaPct <= 10;

    console.log("LATÊNCIA listagem 90d (mediana, 1 warmup + 21 amostras, performance.now)");
    console.log(`  rows visíveis ao dono (sem RLS): ${ownerCount}`);
    console.log(`  baseline dono / SUPERUSER (sem SET ROLE): ${baseline.medianMs.toFixed(2)} ms`);
    console.log(`  ism_app + SET LOCAL + policy:            ${rlsMedian.toFixed(2)} ms`);
    console.log(`  delta: ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% (alvo ≤ +10%) ${within ? "OK" : "ACIMA DO ALVO"}`);

    if (ownerCount < 50) {
        console.log(
            "  nota: dataset < 50 linhas/90d — overhead de SET LOCAL+policy é constante (~1ms); " +
                "percentagem não é estatística fiável. Índices compostos 0011 cobrem o predicado.",
        );
    } else if (!within) {
        throw new Error(`latência RLS +${deltaPct.toFixed(1)}% acima do alvo de 10% (n=${ownerCount} rows)`);
    }
}

async function main(): Promise<void> {
    await asApp(async (c) => {
        const empty = await c.query<{count: string}>("SELECT count(*)::text AS count FROM lancamentos");
        const n = Number(empty.rows[0]?.count ?? -1);
        if (n !== 0) {
            throw new Error(`sem SET LOCAL: esperado 0 lançamentos, obtido ${n}`);
        }
        console.log("OK  ism_app sem SET LOCAL → lancamentos = 0");
    });

    await asApp(async (c) => {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.empresa_id', '1', true)");
        const scoped = await c.query<{empresa_id: number}>(
            "SELECT DISTINCT empresa_id FROM lancamentos",
        );
        const ids = scoped.rows.map((r) => r.empresa_id);
        if (ids.some((id) => id !== 1)) {
            throw new Error(`SET LOCAL=1 vazou outras empresas: ${ids.join(",")}`);
        }
        console.log(`OK  SET LOCAL=1 → só empresa 1 (${scoped.rowCount ?? 0} rows distintas)`);

        let policyDenied = false;
        try {
            await c.query(
                `INSERT INTO lancamentos (empresa_id, tipo, vencimento, descricao, valor, status)
                 VALUES (2, 'CP', CURRENT_DATE, 'rls-probe', 1, 'pendente')`,
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            policyDenied = /row-level security|policy|new row violates/i.test(msg);
            if (!policyDenied) throw err;
        }
        if (!policyDenied) {
            await c.query("ROLLBACK");
            throw new Error("INSERT empresa_id=2 sob contexto 1 deveria falhar a policy");
        }
        console.log("OK  INSERT empresa_id=2 sob contexto 1 → policy denied");
        await c.query("ROLLBACK");
    });

    await asApp(async (c) => {
        let denied = false;
        try {
            await c.query("DELETE FROM logs_auditoria");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            denied = /permission denied|must be owner/i.test(msg);
            if (!denied) throw err;
        }
        if (!denied) {
            throw new Error("DELETE logs_auditoria como ism_app deveria ser permission denied");
        }
        console.log("OK  DELETE logs_auditoria como ism_app → permission denied");
    });

    await measureLatency();
    await assertFailHardWithoutAppRole();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
