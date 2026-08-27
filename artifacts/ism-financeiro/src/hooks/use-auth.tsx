import {useState, useEffect, useCallback} from "react";
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

type MeResponse = {
    data: {
        user: AuthUser;
        permissoes?: string[];
    };
};

export function useAuth() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const login = (accessToken: string, refreshToken: string, userData: AuthUser, perms: string[] = []) => {
        authStorage.setTokens(accessToken, refreshToken);
        setUser(userData);
        setPermissions(perms);
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
                // Best-effort
            }
        }

        authStorage.clearTokens();
        setUser(null);
        setPermissions([]);
        window.location.href = "/login";
    };

    const hasPermission = useCallback(
        (permission: string) => {
            if (!user) return false;
            return permissions.includes("*") || permissions.includes(permission);
        },
        [user, permissions],
    );

    useEffect(() => {
        const token = authStorage.getAccessToken();
        if (!token) {
            setLoading(false);
            return;
        }

        fetchApi<MeResponse>("/auth/me")
            .then((res) => {
                if (res?.data?.user) {
                    setUser(res.data.user);
                    setPermissions(Array.isArray(res.data.permissoes) ? res.data.permissoes : []);
                }
            })
            .catch(() => {
                authStorage.clearTokens();
                setUser(null);
                setPermissions([]);
            })
            .finally(() => setLoading(false));
    }, []);

    return {
        user,
        permissions,
        loading,
        login,
        logout,
        hasPermission,
        isAuthenticated: !!user,
    };
}
