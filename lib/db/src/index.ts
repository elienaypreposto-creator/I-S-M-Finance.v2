export {
    db,
    pool,
    rawDb,
    ownerDb,
    adminDb,
    ownerPool,
    adminPool,
    closeDbPools,
    assertRlsRoles,
    attachSessionRole,
    applySessionRole,
} from "./client";
export * from "./schema";
export {PERMISSOES_ADMIN, type PermissaoCatalogo} from "./permissoes-catalog";
export {
    SYSTEM_ADMIN_EMAILS,
    resolveSystemAdminEmails,
    syncAdminPermissionsOnBoot,
} from "./sync-admin-permissions";
export type {SyncAdminPermissionsResult} from "./sync-admin-permissions";
export {withTenantTx, withOwnerTx, withBypassRls, getTenantStore, tenantAls} from "./tenant-context";
export type {TenantDb} from "./tenant-context";
