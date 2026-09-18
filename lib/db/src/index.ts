export {db, pool} from "./client";
export * from "./schema";
export {PERMISSOES_ADMIN, type PermissaoCatalogo} from "./permissoes-catalog";
export {
    SYSTEM_ADMIN_EMAILS,
    resolveSystemAdminEmails,
    syncAdminPermissionsOnBoot,
} from "./sync-admin-permissions";
export type {SyncAdminPermissionsResult} from "./sync-admin-permissions";
