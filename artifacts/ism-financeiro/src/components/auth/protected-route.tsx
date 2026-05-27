import React from "react";
import { Route, Redirect } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { AppLayout } from "../layout/app-layout";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
  requiredPermission?: string;
}

export function ProtectedRoute({ path, component: Component, requiredPermission }: ProtectedRouteProps) {
  const { user, hasPermission } = useAuth();

  return (
    <Route path={path}>
      {(params) => {
        // Se não estiver logado, redireciona para o login
        if (!user) {
          return <Redirect to="/login" />;
        }

        // Se uma permissão for requerida e o usuário não a tiver, redireciona para o dashboard ou exibe erro
        if (requiredPermission && !hasPermission(requiredPermission)) {
          // Poderia redirecionar para uma página de "Não autorizado"
          return <Redirect to="/" />;
        }

        return (
          <AppLayout>
            <Component {...params} />
          </AppLayout>
        );
      }}
    </Route>
  );
}
