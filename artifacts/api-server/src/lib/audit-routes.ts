/**
 * Prefixos GET auditados. Mutações (POST/PUT/PATCH/DELETE) são sempre auditadas.
 * A API v1 (token de integração) é auditada em qualquer método exceto OPTIONS.
 */

export const AUDIT_SENSITIVE_GET_PREFIXES = [
    "/relatorios",
    "/dashboard",
    "/usuarios",
    "/auditoria",
    "/tokens-api",
    "/v1",
] as const;

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeApiPath(url: string): string {
    const path = (url.split("?")[0] ?? "") || "/";
    return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

export function isApiV1Path(url: string): boolean {
    const path = normalizeApiPath(url);
    return path === "/v1" || path.startsWith("/v1/");
}

export function shouldAuditRequest(method: string, url: string): boolean {
    const metodo = method.toUpperCase();
    if (MUTATION_METHODS.has(metodo)) return true;
    if (isApiV1Path(url)) return metodo !== "OPTIONS";
    if (metodo !== "GET") return false;

    const path = normalizeApiPath(url);
    if (path.includes("export")) return true;
    return AUDIT_SENSITIVE_GET_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}