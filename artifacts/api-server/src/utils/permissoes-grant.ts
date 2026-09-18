/**
 * Regras de concessão de permissões (Card 91).
 *
 * `"*"` nunca entra pela API — só seed (`seed-admin.ts` / `sync-admin-permissions.ts`).
 * A rota exige `admin:permissoes:conceder`, independente de `admin:usuarios:editar`.
 */

import {PERMISSOES_ADMIN} from "../constants/permissoes";

export const SUPERUSER_WILDCARD = "*";

export const PERMISSOES_CONHECIDAS: ReadonlySet<string> = new Set(PERMISSOES_ADMIN);

export type GrantPermissoesInput = {
    actorUserId: number;
    targetUserId: number;
    actorPermissions: readonly string[];
    requested: readonly string[];
    targetCurrentPermissions?: readonly string[];
};

export type GrantPermissoesOk = {ok: true; permissoes: string[]};
export type GrantPermissoesFail = {
    ok: false;
    status: 400 | 403;
    code: string;
    message: string;
};
export type GrantPermissoesResult = GrantPermissoesOk | GrantPermissoesFail;

export function actorIsSuperuser(permissions: readonly string[]): boolean {
    return permissions.includes(SUPERUSER_WILDCARD);
}

function uniqueTrimmed(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
        const value = raw.trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

export function validatePermissoesGrant(input: GrantPermissoesInput): GrantPermissoesResult {
    const {actorUserId, targetUserId, actorPermissions, requested} = input;

    if (actorUserId === targetUserId) {
        return {
            ok: false,
            status: 403,
            code: "SELF_PERMISSION_EDIT_FORBIDDEN",
            message: "Não é permitido alterar as próprias permissões.",
        };
    }

    const permissoes = uniqueTrimmed(requested);
    if (permissoes.includes(SUPERUSER_WILDCARD)) {
        return {
            ok: false,
            status: 403,
            code: "PRIVILEGE_ESCALATION",
            message: "Não é permitido conceder a permissão curinga.",
        };
    }

    const actorSuper = actorIsSuperuser(actorPermissions);
    const targetCurrent = input.targetCurrentPermissions ?? [];

    if (targetCurrent.includes(SUPERUSER_WILDCARD)) {
        return {
            ok: false,
            status: 403,
            code: "FORBIDDEN",
            message: "Não é permitido alterar permissões de um superutilizador.",
        };
    }

    if (!actorSuper) {
        const superiores = targetCurrent.filter((codigo) => !actorPermissions.includes(codigo));
        if (superiores.length > 0) {
            return {
                ok: false,
                status: 403,
                code: "FORBIDDEN",
                message: "Não é permitido alterar permissões de um utilizador com privilégios superiores.",
            };
        }
    }

    for (const codigo of permissoes) {
        if (!PERMISSOES_CONHECIDAS.has(codigo)) {
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message: "Uma ou mais permissões são inválidas.",
            };
        }

        if (!actorSuper && !actorPermissions.includes(codigo)) {
            return {
                ok: false,
                status: 403,
                code: "PRIVILEGE_ESCALATION",
                message: "Não é permitido conceder permissões que você não possui.",
            };
        }
    }

    return {ok: true, permissoes};
}
