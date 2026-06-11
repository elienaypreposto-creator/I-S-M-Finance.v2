import { useAuth as useGlobalAuth, type User } from "@/contexts/auth-context";

export type AuthUser = User;

export function useAuth() {
    const context = useGlobalAuth();
    
    // Mapeia o contexto global para a interface que a plataforma já usava
    return {
        user: context.user as AuthUser | null,
        loading: context.isLoading,
        login: context.login,
        logout: context.logout,
        isAuthenticated: !!context.user,
        hasPermission: context.hasPermission
    };
}