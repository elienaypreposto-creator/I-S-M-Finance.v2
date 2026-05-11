const DEFAULT_API_URL = "/api";

export const API_URL = import.meta.env.VITE_API_URL || "/api";

// Chave para o LocalStorage
const AUTH_TOKEN_KEY = "ism_finance_token";

export const authStorage = {
    getToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
    setToken: (token: string) => localStorage.setItem(AUTH_TOKEN_KEY, token),
    removeToken: () => localStorage.removeItem(AUTH_TOKEN_KEY),
    logout: () => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        window.location.href = "/login";
    }
};

export type ApiEnvelope<T> = {
  data: T;
  meta: Record<string, unknown> | null;
  errors: Array<{ code: string; message: string; details?: unknown }> | null;
};

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
    const token = authStorage.getToken();

    const res = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? {"Authorization": `Bearer ${token}`} : {}),
            ...options?.headers,
        },
    });

    if (res.status === 401 && !path.includes("/auth/login")) {
        authStorage.logout();
        throw new Error("Sessão expirada");
    }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = errorBody.errors?.[0]?.message || errorBody.error || `Erro: ${res.status}`;
    throw new Error(message);
  }

  const body = await res.json();
  return body;
}

export async function fetchApiData<T>(path: string, options?: RequestInit): Promise<T> {
  const envelope = await fetchApi<ApiEnvelope<T>>(path, options);
  return envelope.data;
}