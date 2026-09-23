/**
 * Contrato de tenant (ISMF-14) - fonte de verdade para ISMF-15/16/18/19.
 *
 * AccessTokenPayload.empresa_id  -> empresa ativa da sessão
 * req.tenant = { empresaId }     -> definido por withTenant após withAuth
 * tenantScope(table, empresaId)  -> único jeito canónico de filtrar domínio
 * withEmpresaId(body, empresaId) -> escrita: ignora empresa_id do cliente
 * runInTenantTx                  -> gancho SET LOCAL app.empresa_id (ISMF-15 RLS)
 *
 * Services NÃO montam eq(table.empresa_id, …) ad hoc.
 */

import {and, eq, sql, type SQL} from "drizzle-orm";
import type {PgTransaction} from "drizzle-orm/pg-core";
import type {Request} from "express";
import {AppError} from "../utils/app-error";

export type TenantContext = { empresaId: number };

export type TenantTable = { empresa_id: unknown };

export function requireTenant(req: Request): TenantContext {
    const empresaId = req.tenant?.empresaId;
    if (!empresaId || !Number.isInteger(empresaId) || empresaId <= 0) {
        throw new AppError(401, "UNAUTHORIZED", "Contexto de empresa ausente. Faça login novamente.");
    }
    return {empresaId};
}

/** Filtro canónico de leitura. Use em todo `where` de tabela de domínio. */
export function tenantScope<TTable extends TenantTable>(table: TTable, empresaId: number): SQL {
    return eq(table.empresa_id as never, empresaId);
}

/** Combina o escopo de tenant com condições extras sem `eq(empresa_id)` solto. */
export function tenantWhere<TTable extends TenantTable>(
    table: TTable,
    empresaId: number,
    ...conditions: Array<SQL | undefined>
): SQL {
    return and(tenantScope(table, empresaId), ...conditions)!;
}

/** Sobrescreve qualquer `empresa_id` do body pelo do tenant (nunca do cliente). */
export function withEmpresaId<T extends object>(
    body: T,
    empresaId: number,
): T & { empresa_id: number } {
    return {...body, empresa_id: empresaId};
}

/**
 * Gancho para ISMF-15 (RLS). `set_config(..., true)` = SET LOCAL: vale só
 * dentro desta transação. Nunca usar SET de sessão em conexão do pool.
 */
export async function runInTenantTx<T>(
    empresaId: number,
    work: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<T>,
): Promise<T> {
    const {db} = await import("@workspace/db");
    return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.empresa_id', ${String(empresaId)}, true)`);
        return work(tx);
    });
}

export type TenantTx = PgTransaction<never, Record<string, never>, never>;
