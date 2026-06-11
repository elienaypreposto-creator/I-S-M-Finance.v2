import React, { createContext, useContext, useState, useEffect } from "react";
import { authStorage, fetchApiData } from "@/lib/api-config";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export interface User {
  id: number;
  nome: string;
  email: string;
  cargo?: string;
  permissoes: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string, userData: User) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const initAuth = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        // Busca os dados do usuário atual na API
        const response = await fetchApiData<any>("/auth/me");
        
        // Suporte para o formato antigo do backend (que separava permissoes do user)
        // e o formato novo (que embutia dentro do user)
        const userObj = response.user || response;
        const permissoes = userObj.permissoes || response.permissoes || [];
        
        setUser({ ...userObj, permissoes });
      } catch (error) {
        console.error("Erro ao validar sessão:", error);
        authStorage.clearTokens();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (accessToken: string, refreshToken: string, userData: User) => {
    authStorage.setTokens(accessToken, refreshToken);
    
    // Como a API antiga de login pode não retornar as permissões embutidas,
    // garantimos buscando do /auth/me imediatamente
    try {
        const response = await fetchApiData<any>("/auth/me");
        const userObj = response.user || response;
        const permissoes = userObj.permissoes || response.permissoes || userData.permissoes || [];
        setUser({ ...userData, ...userObj, permissoes });
    } catch {
        setUser({ ...userData, permissoes: userData.permissoes || [] });
    }
    
    setLocation("/");
  };

  const logout = () => {
    authStorage.clearTokens();
    setUser(null);
    setLocation("/login");
  };

  const hasPermission = (permission: string) => {
    if (!user || !Array.isArray(user.permissoes)) return false;
    // Permissões com wildcard ou exatas
    return user.permissoes.includes("*") || user.permissoes.includes(permission);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
