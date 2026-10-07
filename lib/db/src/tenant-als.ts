/**
 * AsyncLocalStorage do tenant, sem importar o client (evita ciclo).
 * SET LOCAL app.empresa_id vive só dentro da transação.
 */

import {AsyncLocalStorage} from "node:async_hooks";

export type TenantAlsStore = {
    empresaId: number;
    tx: unknown;
    bypass?: boolean;
};

export const tenantAls = new AsyncLocalStorage<TenantAlsStore>();

export function getTenantAlsStore(): TenantAlsStore | undefined {
    return tenantAls.getStore();
}
