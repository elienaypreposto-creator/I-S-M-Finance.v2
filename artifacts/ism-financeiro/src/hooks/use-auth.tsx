import { useState, useEffect } from "react";
import { fetchApi, authStorage } from "@/lib/api-config";

export function useAuth() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const login = (token: string, userData: any) => {
        authStorage.setToken(token);
        setUser(userData);
    };

    const logout = () => {
        authStorage.removeToken(); // Limpa o token sem redirecionar em loop
        setUser(null);
        window.location.href = "/login";
    };

    useEffect(() => {
        const token = authStorage.getToken();
        if (!token) {
            setLoading(false);
            return;
        }

        // Ajustado para ler do envelope .data
        fetchApi("/auth/me")
            .then((res: any) => {
                if (res?.data?.user) {
                    setUser(res.data.user);
                }
            })
            .catch(() => {
                authStorage.removeToken();
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    return { user, loading, login, logout, isAuthenticated: !!user };
}