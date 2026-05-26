import {useState, useEffect} from "react";
import {fetchApi, authStorage} from "@/lib/api-config";

export type AuthUser = {
    id: number;
    nome: string;
    email: string;
    bloqueado?: boolean;
    telefone?: string | null;
    celular?: string | null;
    ultimo_acesso?: string | null;
};

export function useAuth() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const login = (accessToken: string, refreshToken: string, userData: AuthUser) => {
        authStorage.setTokens(accessToken, refreshToken);
        setUser(userData);
    };

    const logout = async () => {
        const refreshToken = authStorage.getRefreshToken();

        if (refreshToken) {
            try {
                await fetchApi("/auth/logout", {
                    method: "POST",
                    body: JSON.stringify({refreshToken}),
                });
            } catch {
                // Best-effort: revoga no servidor quando possível, mas não bloqueia o logout local
            }
        }

        authStorage.clearTokens();
        setUser(null);
        window.location.href = "/login";
    };

    useEffect(() => {
        const token = authStorage.getAccessToken();
        if (!token) {
            setLoading(false);
            return;
        }

        fetchApi<{ data: { user: AuthUser } }>("/auth/me")
            .then((res) => {
                if (res?.data?.user) {
                    setUser(res.data.user);
                }
            })
            .catch(() => {
                // /auth/me falhou mesmo após tentativa de refresh — sessão inválida
                authStorage.clearTokens();
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    return {user, loading, login, logout, isAuthenticated: !!user};
}
