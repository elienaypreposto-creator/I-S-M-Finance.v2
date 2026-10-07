/**
 * Regras de concessão de permissões (Card 91 / VIN-16).
 *
 * ALTERADO — Card 2 (Permissões): `"*"` deixou de existir como conceito em
 * QUALQUER lugar — nem no catálogo, nem como permissão gravável, nem como
 * marcador de "superuser". O bit de acesso irrestrito agora é
 * `usuarios.superadmin` (boolean), passado explicitamente pelo chamador
 * (routes/usuarios.ts lê de `req.user.superadmin`) em vez de inferido
 * procurando `"*"` dentro de `actorPermissions`.
 */

import {PERMISSOES_ADMIN} from "../constants/permissoes";

export const PERMISSOES_CONHECIDAS: ReadonlySet<string> = new Set(PERMISSOES_ADMIN);

export type GrantPermissoesInput = {
    actorUserId: number;
    targetUserId: number;
    actorPermissions: readonly string[];
    /** NOVO — Card 2: antes inferido de `actorPermissions.includes("*")`. */
    actorSuperadmin: boolean;
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
    const {actorUserId, targetUserId, actorPermissions, actorSuperadmin, requested} = input;

    if (actorUserId === targetUserId) {
        return {
            ok: false,
            status: 403,
            code: "SELF_PERMISSION_EDIT_FORBIDDEN",
            message: "Não é permitido alterar as próprias permissões.",
        };
    }

    // ANTES: bloqueava requested.includes("*") explicitamente. Não é mais
    // necessário: codigoPermissaoCatalogoSchema (constants/permissoes.ts) é
    // um z.enum sobre PERMISSOES_ADMIN, que nunca incluiu "*" — o payload
    // já é rejeitado a 400 na validação de body, antes mesmo de chegar aqui.
    const permissoes = uniqueTrimmed(requested);

    const targetCurrent = input.targetCurrentPermissions ?? [];

    // ANTES: bloqueava se targetCurrent.includes("*") — não existe mais
    // "usuário com a permissão curinga" para proteger; superadmin não passa
    // por usuario_permissoes de forma nenhuma, é um campo à parte.

    if (!actorSuperadmin) {
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

        if (!actorSuperadmin && !actorPermissions.includes(codigo)) {
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