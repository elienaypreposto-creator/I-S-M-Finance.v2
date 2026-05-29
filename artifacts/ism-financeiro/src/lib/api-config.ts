export const API_URL = import.meta.env.VITE_API_URL || "/api";

const ACCESS_TOKEN_KEY = "ism_finance_access_token";
const REFRESH_TOKEN_KEY = "ism_finance_refresh_token";

export const authStorage = {
    getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
    getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),

    setTokens: (accessToken: string, refreshToken: string) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    },

    clearTokens: () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    },

    /** @deprecated Usa getAccessToken(). Mantido para compatibilidade com App.tsx. */
    getToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
};

export type ApiEnvelope<T> = {
    data: T;
    meta: Record<string, unknown> | null;
    errors: Array<{ code: string; message: string; details?: unknown }> | null;
};

// Garante que apenas um refresh ocorre por vez,
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
    const refreshToken = authStorage.getRefreshToken();
    if (!refreshToken) return null;

    try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({refreshToken}),
        });

        if (!res.ok) return null;

        const body = await res.json();
        const newAccessToken = body?.data?.accessToken as string | undefined;
        const newRefreshToken = body?.data?.refreshToken as string | undefined;

        if (!newAccessToken || !newRefreshToken) return null;

        authStorage.setTokens(newAccessToken, newRefreshToken);
        return newAccessToken;
    } catch {
        return null;
    }
}

// Rotas de auth que nunca devem disparar o interceptor de 401
const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];
const isAuthPath = (path: string) => AUTH_PATHS.some((p) => path.includes(p));

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
    const token = authStorage.getAccessToken();
    const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;

    const buildHeaders = (bearerToken: string | null): HeadersInit => ({
        ...(isFormData ? {} : {"Content-Type": "application/json"}),
        ...(bearerToken ? {Authorization: `Bearer ${bearerToken}`} : {}),
        ...options?.headers,
    });

    const res = await fetch(url, {...options, headers: buildHeaders(token)});

    // Interceptor de 401: tenta renovar o Access Token uma única vez
    if (res.status === 401 && !isAuthPath(path)) {
        if (!refreshPromise) {
            refreshPromise = tryRefreshToken().finally(() => {
                refreshPromise = null;
            });
        }

        const newToken = await refreshPromise;

        if (!newToken) {
            // Refresh falhou - força logout sem loop
            authStorage.clearTokens();
            if (window.location.pathname !== "/login") {
                window.location.href = "/login";
            }
            throw new Error("Sessão expirada. Faça login novamente.");
        }

        // Retry da requisição original com o novo Access Token
        const retryRes = await fetch(url, {...options, headers: buildHeaders(newToken)});

        if (!retryRes.ok) {
            const errBody = await retryRes.json().catch(() => ({}));
            const code = errBody.errors?.[0]?.code;
            const message = errBody.errors?.[0]?.message ?? `Erro ${retryRes.status}`;
            
            if (code === "UNAUTHORIZED") {
                authStorage.clearTokens();
                if (window.location.pathname !== "/login") {
                    window.location.href = "/login";
                }
                throw new Error("Sessão expirada. Faça login novamente.");
            }
            throw new Error(message);
        }

        return retryRes.json() as Promise<T>;
    }

    if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const code = errorBody.errors?.[0]?.code;
        const message = errorBody.errors?.[0]?.message ?? errorBody.error ?? `Erro ${res.status}`;
        
        if (code === "UNAUTHORIZED" || res.status === 401) {
            authStorage.clearTokens();
            if (window.location.pathname !== "/login") {
                window.location.href = "/login";
            }
            throw new Error("Sessão expirada. Faça login novamente.");
        }
        
        throw new Error(message);
    }

    return res.json() as Promise<T>;
}

export async function fetchApiData<T>(path: string, options?: RequestInit): Promise<T> {
    const envelope = await fetchApi<ApiEnvelope<T>>(path, options);
    return envelope.data;
}
