// Centralized API configuration for I-S-M-Finance
// The API_URL defaults to the local dev server, but should be overridden by VITE_API_URL in production (Vercel)

const DEFAULT_API_URL = "https://i-s-m-finance-v2-api-server.vercel.app/api";

export const API_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD 
    ? DEFAULT_API_URL 
    : "http://localhost:5000/api"
);

/**
 * Helper to fetch data from the API
 */
export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Erro na requisição: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}
