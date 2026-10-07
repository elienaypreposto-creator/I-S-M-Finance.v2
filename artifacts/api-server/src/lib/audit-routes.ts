/**
 * Prefixos GET auditados. Mutações (POST/PUT/PATCH/DELETE) são sempre auditadas.
 */

export const AUDIT_SENSITIVE_GET_PREFIXES = [
    "/relatorios",
    "/dashboard",
    "/usuarios",
    "/auditoria",
    "/tokens-api",
] as const;

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeApiPath(url: string): string {
    const path = (url.split("?")[0] ?? "") || "/";
    return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

export function shouldAuditRequest(method: string, url: string): boolean {
    if (MUTATION_METHODS.has(method.toUpperCase())) return true;
    if (method.toUpperCase() !== "GET") return false;

    const path = normalizeApiPath(url);
    if (path.includes("export")) return true;
    return AUDIT_SENSITIVE_GET_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
