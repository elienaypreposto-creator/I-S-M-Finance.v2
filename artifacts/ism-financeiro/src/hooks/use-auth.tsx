import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from "react";
import {fetchApi, authStorage} from "@/lib/api-config";
import {nomeEmpresa, setCurrentEmpresaId} from "@/lib/tenant-query";
import {queryClient} from "@/lib/query-client";

export type AuthUser = {
    id: number;
    nome: string;
    email: string;
    empresa_id?: number;
    cargo?: string | null;
    bloqueado?: boolean;
    telefone?: string | null;
    celular?: string | null;
    ultimo_acesso?: string | null;
};

export type EmpresaVinculo = {
    id: number;
    razao_social: string;
    nome_fantasia: string | null;
    slug: string;
    papel: string;
};

export type EmpresaAtiva = {
    id: number;
    nome: string;
    slug: string;
};

type MeResponse = {
    data: {
        user: AuthUser;
        permissoes?: string[];
        empresas?: EmpresaVinculo[];
    };
};

type SessionPayload = {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    permissoes?: string[];
    empresa_id?: number;
};

type AuthContextValue = {
    user: AuthUser | null;
    permissions: string[];
    empresas: EmpresaVinculo[];
    empresaAtiva: EmpresaAtiva | null;
    loading: boolean;
    login: (accessToken: string, refreshToken: string, userData: AuthUser, perms?: string[], empresas?: EmpresaVinculo[]) => void;
    logout: () => Promise<void>;
    switchEmpresa: (empresaId: number) => Promise<void>;
    hasPermission: (permission: string) => boolean;
    isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toEmpresaAtiva(empresas: EmpresaVinculo[], empresaId: number | undefined): EmpresaAtiva | null {
    if (!empresaId) return null;
    const found = empresas.find((e) => e.id === empresaId);
    if (!found) {
        return {id: empresaId, nome: `Empresa ${empresaId}`, slug: ""};
    }
    return {id: found.id, nome: nomeEmpresa(found), slug: found.slug};
}

export function AuthProvider({children}: {children: ReactNode}) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [empresas, setEmpresas] = useState<EmpresaVinculo[]>([]);
    const [loading, setLoading] = useState(true);

    const applySession = useCallback(
        (userData: AuthUser, perms: string[] = [], vinculos?: EmpresaVinculo[]) => {
            setUser(userData);
            setPermissions(perms);
            if (vinculos) setEmpresas(vinculos);
            setCurrentEmpresaId(userData.empresa_id);
        },
        [],
    );

    const login = useCallback(
        (
            accessToken: string,
            refreshToken: string,
            userData: AuthUser,
            perms: string[] = [],
            vinculos: EmpresaVinculo[] = [],
        ) => {
            authStorage.setTokens(accessToken, refreshToken);
            applySession(userData, perms, vinculos);
            if (vinculos.length === 0) {
                void fetchApi<MeResponse>("/auth/me")
                    .then((res) => {
                        if (res?.data?.user) {
                            applySession(
                                res.data.user,
                                Array.isArray(res.data.permissoes) ? res.data.permissoes : perms,
                                Array.isArray(res.data.empresas) ? res.data.empresas : [],
                            );
                        }
                    })
                    .catch(() => undefined);
            }
        },
        [applySession],
    );

    const logout = useCallback(async () => {
        const refreshToken = authStorage.getRefreshToken();
        if (refreshToken) {
            try {
                await fetchApi("/auth/logout", {
                    method: "POST",
                    body: JSON.stringify({refreshToken}),
                });
            } catch {
                // best-effort
            }
        }
        authStorage.clearTokens();
        setUser(null);
        setPermissions([]);
        setEmpresas([]);
        setCurrentEmpresaId(0);
        queryClient.clear();
        window.location.href = "/login";
    }, []);

    const switchEmpresa = useCallback(async (empresaId: number) => {
        const refreshToken = authStorage.getRefreshToken();
        const res = await fetchApi<{data: SessionPayload}>("/auth/switch-empresa", {
            method: "POST",
            body: JSON.stringify({empresa_id: empresaId, refreshToken}),
        });
        const {accessToken, refreshToken: nextRefresh, user: nextUser, permissoes, empresa_id} = res.data;
        if (!accessToken || !nextRefresh || !nextUser) {
            throw new Error("Resposta do servidor inválida.");
        }
        const merged = {...nextUser, empresa_id: nextUser.empresa_id ?? empresa_id};
        authStorage.setTokens(accessToken, nextRefresh);
        applySession(merged, Array.isArray(permissoes) ? permissoes : []);
        queryClient.clear();
        window.location.assign("/");
    }, [applySession]);

    const hasPermission = useCallback(
        (permission: string) => {
            if (!user) return false;
            return permissions.includes(permission);
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
                    applySession(
                        res.data.user,
                        Array.isArray(res.data.permissoes) ? res.data.permissoes : [],
                        Array.isArray(res.data.empresas) ? res.data.empresas : [],
                    );
                }
            })
            .catch(() => {
                authStorage.clearTokens();
                setUser(null);
                setPermissions([]);
                setEmpresas([]);
                setCurrentEmpresaId(0);
            })
            .finally(() => setLoading(false));
    }, [applySession]);

    const empresaAtiva = useMemo(
        () => toEmpresaAtiva(empresas, user?.empresa_id),
        [empresas, user?.empresa_id],
    );

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            permissions,
            empresas,
            empresaAtiva,
            loading,
            login,
            logout,
            switchEmpresa,
            hasPermission,
            isAuthenticated: !!user,
        }),
        [user, permissions, empresas, empresaAtiva, loading, login, logout, switchEmpresa, hasPermission],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth deve ser usado dentro de AuthProvider");
    }
    return ctx;
}
