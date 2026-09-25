/**
 * ISMF-19: query keys e localStorage namespaced por empresa.
 * Não decodifica o JWE — o id vem de /auth/me ou do payload de login.
 */

let currentEmpresaId = 0;

export function setCurrentEmpresaId(id: number | undefined | null): void {
    currentEmpresaId = Number.isInteger(id) && (id as number) > 0 ? (id as number) : 0;
}

export function getCurrentEmpresaId(): number {
    return currentEmpresaId;
}

/** Primeiro elemento da queryKey = empresaId. Troca de tenant nunca reaproveita cache. */
export function tenantQueryKey(...parts: unknown[]): unknown[] {
    return [getCurrentEmpresaId(), ...parts];
}

export function queryFamily(queryKey: readonly unknown[]): string | undefined {
    const family = typeof queryKey[0] === "number" ? queryKey[1] : queryKey[0];
    return typeof family === "string" ? family : undefined;
}

const PREF_PREFIX = "ism_pref";

export const tenantStorage = {
    get(key: string): string | null {
        return localStorage.getItem(`${PREF_PREFIX}:${getCurrentEmpresaId()}:${key}`);
    },
    set(key: string, value: string): void {
        localStorage.setItem(`${PREF_PREFIX}:${getCurrentEmpresaId()}:${key}`, value);
    },
    remove(key: string): void {
        localStorage.removeItem(`${PREF_PREFIX}:${getCurrentEmpresaId()}:${key}`);
    },
};

export function nomeEmpresa(empresa: {
    nome_fantasia?: string | null;
    razao_social?: string | null;
    nome?: string | null;
}): string {
    const fantasia = empresa.nome_fantasia?.trim();
    if (fantasia) return fantasia;
    const razao = empresa.razao_social?.trim();
    if (razao) return razao;
    return empresa.nome?.trim() || "Empresa";
}
