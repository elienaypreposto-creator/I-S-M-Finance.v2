export const API_URL = import.meta.env.VITE_API_URL || "/api";

// Erro tipado da API - propaga status HTTP e code do envelope de erros
export class ApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(message: string, status: number, code: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

// O access token vive só em memória. O refresh token está em cookie httpOnly
// (inacessível ao JavaScript) e é enviado automaticamente nas rotas /auth/*.
let accessToken: string | null = null;

// Limpeza de resíduos da versão anterior (só remove, nunca lê): garante que não
// sobre nenhum token no localStorage (critério de aceite do ISMF-6).
try {
    ["ism_finance_access_token", "ism_finance_refresh_token"].forEach((key) =>
        localStorage.removeItem(key),
    );
} catch {
    // noop
}

export const authStorage = {
    getAccessToken: () => accessToken,

    setAccessToken: (token: string) => {
        accessToken = token;
    },

    clearTokens: () => {
        accessToken = null;
    },

    /** @deprecated Use getAccessToken(). Mantido para compatibilidade com App.tsx. */
    getToken: () => accessToken,
};

export type ApiEnvelope<T> = {
    data: T;
    meta: Record<string, unknown> | null;
    errors: Array<{ code: string; message: string; details?: unknown }> | null;
};

// Garante que apenas um refresh ocorre por vez nesta aba
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
    try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({}),
        });

        if (!res.ok) return null;

        const body = await res.json();
        const newAccessToken = body?.data?.accessToken as string | undefined;
        if (!newAccessToken) return null;

        authStorage.setAccessToken(newAccessToken);
        return newAccessToken;
    } catch {
        return null;
    }
}

/**
 * Renova o access token usando o cookie httpOnly.
 * - Single-flight dentro da aba (evita refresh duplicado, inclusive no StrictMode).
 * - Web Locks entre abas: o refresh token rotaciona a cada uso, então duas abas
 *   renovando ao mesmo tempo disparariam a detecção de reuso e derrubariam a sessão.
 */
export function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
        const run: Promise<string | null> =
            typeof navigator !== "undefined" && "locks" in navigator
                ? navigator.locks.request("ism-finance-refresh", doRefresh)
                : doRefresh();

        refreshPromise = run.finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

// Rotas de auth que nunca devem disparar o interceptor de 401
const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/select-empresa"];
const isAuthPath = (path: string) => AUTH_PATHS.some(p => path.includes(p));

// ─── Converte erros de rede (TypeError) em mensagens legíveis ─────────────────
function toReadableError(err: unknown): Error {
    if (err instanceof TypeError) {
        // Falha de rede: servidor fora do ar, sem internet, CORS, etc.
        return new Error("Sem conexão com o servidor. Verifique sua internet ou tente novamente.");
    }
    if (err instanceof Error) return err;
    return new Error("Erro desconhecido.");
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${API_URL}${normalizedPath}`;
    const token = authStorage.getAccessToken();
    const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
    // Rotas /auth/* trocam o cookie do refresh token (login, switch-empresa, logout...)
    const sendCredentials = normalizedPath.startsWith("/auth/");

    const buildHeaders = (bearerToken: string | null): HeadersInit => ({
        ...(isFormData ? {} : {"Content-Type": "application/json"}),
        "X-Requested-With": "XMLHttpRequest",
        ...(bearerToken ? {Authorization: `Bearer ${bearerToken}`} : {}),
        ...options?.headers,
    });

    const buildInit = (bearerToken: string | null): RequestInit => ({
        ...options,
        credentials: sendCredentials ? "include" : options?.credentials,
        headers: buildHeaders(bearerToken),
    });

    let res: Response;

    try {
        res = await fetch(url, buildInit(token));
    } catch (err) {
        throw toReadableError(err);
    }

    // Interceptor de 401: tenta renovar o Access Token uma única vez
    if (res.status === 401 && !isAuthPath(normalizedPath)) {
        const newToken = await refreshAccessToken();

        if (!newToken) {
            authStorage.clearTokens();
            if (window.location.pathname !== "/login") {
                window.location.href = "/login";
            }
            throw new Error("Sessão expirada. Faça login novamente.");
        }

        let retryRes: Response;
        try {
            retryRes = await fetch(url, buildInit(newToken));
        } catch (err) {
            throw toReadableError(err);
        }

        if (!retryRes.ok) {
            const errBody = await retryRes.json().catch(() => ({}));
            const code = errBody.errors?.[0]?.code ?? "UNKNOWN";
            const message = errBody.errors?.[0]?.message ?? `Erro ${retryRes.status}`;

            if (code === "UNAUTHORIZED") {
                authStorage.clearTokens();
                if (window.location.pathname !== "/login") {
                    window.location.href = "/login";
                }
                throw new ApiError("Sessão expirada. Faça login novamente.", retryRes.status, code);
            }
            throw new ApiError(message, retryRes.status, code);
        }

        return retryRes.json() as Promise<T>;
    }

    if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const code = errorBody.errors?.[0]?.code ?? "UNKNOWN";
        const message = errorBody.errors?.[0]?.message ?? errorBody.error ?? `Erro ${res.status}`;

        if ((code === "UNAUTHORIZED" || res.status === 401) && !isAuthPath(normalizedPath)) {
            authStorage.clearTokens();
            if (window.location.pathname !== "/login") {
                window.location.href = "/login";
            }
            throw new ApiError("Sessão expirada. Faça login novamente.", res.status, code);
        }

        throw new ApiError(message, res.status, code);
    }

    return res.json() as Promise<T>;
}

export async function fetchApiData<T>(path: string, options?: RequestInit): Promise<T> {
    const envelope = await fetchApi<ApiEnvelope<T>>(path, options);
    return envelope.data;
}