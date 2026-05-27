import React from "react";
import { useAuth } from "@/contexts/auth-context";

interface RequiresPermissionProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequiresPermission({ permission, children, fallback = null }: RequiresPermissionProps) {
  const { hasPermission } = useAuth();

  if (hasPermission(permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
