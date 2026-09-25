/**
 * ISMF-15: transação com SET LOCAL app.empresa_id (+ role ism_app no pool).
 * Nunca usar SET de sessão — o pooler Supabase está em transaction mode.
 */

import {sql} from "drizzle-orm";
import type {NodePgDatabase} from "drizzle-orm/node-postgres";
import {adminDb, ownerDb, rawDb} from "./client";
import * as schema from "./schema";
import {tenantAls} from "./tenant-als";

export type TenantDb = NodePgDatabase<typeof schema>;

export async function withTenantTx<T>(
    empresaId: number,
    work: (tx: TenantDb) => Promise<T>,
    options?: {isolated?: boolean},
): Promise<T> {
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
        throw new Error("withTenantTx: empresaId inválido");
    }

    const existing = tenantAls.getStore();
    if (!options?.isolated && existing && !existing.bypass && existing.empresaId === empresaId) {
        return work(existing.tx as TenantDb);
    }

    return rawDb.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.empresa_id', ${String(empresaId)}, true)`);
        return tenantAls.run({empresaId, tx}, () => work(tx));
    });
}

/** Consultas como dona (sem SET ROLE ism_app): retenção, lookup de token v1. */
export async function withOwnerTx<T>(work: (tx: TenantDb) => Promise<T>): Promise<T> {
    return ownerDb.transaction(async (tx) => work(tx));
}

/** Superadmin: role ism_admin (BYPASSRLS). Nunca no pool padrão. */
export async function withBypassRls<T>(work: (tx: TenantDb) => Promise<T>): Promise<T> {
    return adminDb.transaction(async (tx) => {
        return tenantAls.run({empresaId: 0, tx, bypass: true}, () => work(tx));
    });
}

export {getTenantAlsStore as getTenantStore, tenantAls} from "./tenant-als";
