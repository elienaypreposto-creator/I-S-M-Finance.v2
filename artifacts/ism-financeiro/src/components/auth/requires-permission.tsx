import React from "react";
import {useAuth} from "@/hooks/use-auth";

interface RequiresPermissionProps {
    permission: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

/** Renderiza children apenas se o usuário tiver a permissão (FEAT-09). */
export function RequiresPermission({permission, children, fallback = null}: RequiresPermissionProps) {
    const {hasPermission} = useAuth();

    if (hasPermission(permission)) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
}
