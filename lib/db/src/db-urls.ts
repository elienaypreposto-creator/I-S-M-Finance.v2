/**
 * URLs por role. A API nunca usa a URL do bootstrap/superuser no pool padrão.
 *
 * - DATABASE_URL: login direto como ism_app (sem privilégios).
 * - DATABASE_ADMIN_URL / ISM_ADMIN_PASSWORD: ism_admin (rotas admin + lookup v1).
 * - DATABASE_OWNER_URL: ism_owner NOSUPERUSER (retenção de auditoria).
 * - DATABASE_MIGRATE_URL: ism_user só em db:migrate / pg_dump.
 */

export function pgUrlUser(connectionString: string): string {
    try {
        return decodeURIComponent(new URL(connectionString).username);
    } catch {
        return "";
    }
}

export function pgUrlPassword(connectionString: string): string | undefined {
    try {
        const password = new URL(connectionString).password;
        return password ? decodeURIComponent(password) : undefined;
    } catch {
        return undefined;
    }
}

export function replacePgUser(connectionString: string, user: string, password: string): string {
    const parsed = new URL(connectionString);
    parsed.username = user;
    parsed.password = password;
    return parsed.toString();
}

export type ResolvedDbUrls = {
    appUrl: string;
    adminUrl: string;
    ownerUrl: string;
    migrateUrl: string;
};

export function resolveDbUrls(): ResolvedDbUrls {
    const appUrl = process.env.DATABASE_URL;
    if (!appUrl) {
        throw new Error("DATABASE_URL não configurado.");
    }

    const sessionUser = pgUrlUser(appUrl).split(".")[0];
    if (sessionUser === "ism_user" || sessionUser === "postgres") {
        throw new Error(
            "DATABASE_URL da API não pode ser ism_user/postgres (SUPERUSER). Use login ism_app - ver docker-compose.",
        );
    }

    const appPassword = process.env.ISM_APP_PASSWORD ?? pgUrlPassword(appUrl);
    const adminPassword = process.env.ISM_ADMIN_PASSWORD ?? appPassword;
    const ownerPassword = process.env.ISM_OWNER_PASSWORD ?? appPassword;

    const adminUrl =
        process.env.DATABASE_ADMIN_URL ??
        (adminPassword ? replacePgUser(appUrl, "ism_admin", adminPassword) : undefined);
    const ownerUrl =
        process.env.DATABASE_OWNER_URL ??
        (ownerPassword ? replacePgUser(appUrl, "ism_owner", ownerPassword) : undefined);
    const migrateUrl =
        process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_OWNER_URL ?? appUrl;

    if (!adminUrl) {
        throw new Error("DATABASE_ADMIN_URL (ou ISM_ADMIN_PASSWORD) não configurado.");
    }
    if (!ownerUrl) {
        throw new Error("DATABASE_OWNER_URL (ou ISM_OWNER_PASSWORD) não configurado.");
    }

    return {appUrl, adminUrl, ownerUrl, migrateUrl};
}
