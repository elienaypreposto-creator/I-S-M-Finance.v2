import React, { createContext, useContext, useState, useEffect } from "react";
import { authStorage, fetchApiData } from "@/lib/api-config";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export interface User {
  id: number;
  nome: string;
  email: string;
  permissoes: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, userData: User) => void;
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
        const userData = await fetchApiData<User>("/auth/me");
        setUser(userData);
      } catch (error) {
        console.error("Erro ao validar sessão:", error);
        authStorage.logout();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = (token: string, userData: User) => {
    authStorage.setToken(token);
    setUser(userData);
    setLocation("/");
  };

  const logout = () => {
    authStorage.logout();
    setUser(null);
  };

  const hasPermission = (permission: string) => {
    if (!user) return false;
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
