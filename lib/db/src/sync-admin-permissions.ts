/**
 * Sincronização idempotente de permissões dos Super Admins de sistema.
 *
 * Usado no boot da API (sem CLI em TST/PRD) e reutilizado pelo seed CLI.
 * Nunca cria usuários, nunca toca senhas, nunca expõe segredos em log.
 */

import {eq, sql} from "drizzle-orm";
import {db} from "./client";
import {usuariosTable, usuarioPermissoesTable} from "./schema";
import {PERMISSOES_ADMIN} from "./permissoes-catalog";

export {PERMISSOES_ADMIN} from "./permissoes-catalog";

export const SYSTEM_ADMIN_EMAILS = [
    "admin@ism.finance",
    "ismteste@gmail.com",
    "vinicosta37@gmail.com",
] as const;

function parseEmailList(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    return raw
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

/** Resolve e-mails alvo: lista estática + ADMIN_EMAIL + ADMIN_EMAILS (env). */
export function resolveSystemAdminEmails(): string[] {
    const fromEnv = [
        ...parseEmailList(process.env.ADMIN_EMAIL),
        ...parseEmailList(process.env.ADMIN_EMAILS),
    ];
    return [...new Set([...SYSTEM_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv])];
}

export type SyncAdminPermissionsResult = {
    emailsAlvo: number;
    sincronizados: number;
    ausentes: string[];
    permissoesPorUsuario: number;
};

/**
 * Injeta PERMISSOES_ADMIN nos usuários de sistema que já existem no banco.
 * Não cria contas. Fail-soft no chamador - esta função pode lançar em erro de DB.
 */
export async function syncAdminPermissionsOnBoot(): Promise<SyncAdminPermissionsResult> {
    const emails = resolveSystemAdminEmails();
    const ausentes: string[] = [];
    let sincronizados = 0;

    for (const email of emails) {
        const [usuario] = await db
            .select({id: usuariosTable.id, email: usuariosTable.email})
            .from(usuariosTable)
            .where(sql`lower(${usuariosTable.email}) = ${email}`)
            .limit(1);

        if (!usuario) {
            ausentes.push(email);
            continue;
        }

        await db
            .delete(usuarioPermissoesTable)
            .where(eq(usuarioPermissoesTable.usuario_id, usuario.id));

        await db.insert(usuarioPermissoesTable).values(
            PERMISSOES_ADMIN.map((codigo_permissao) => ({
                usuario_id: usuario.id,
                codigo_permissao,
            })),
        );

        await db
            .update(usuariosTable)
            .set({perfil_base: "Admin", updated_at: new Date()})
            .where(eq(usuariosTable.id, usuario.id));

        sincronizados += 1;
    }

    return {
        emailsAlvo: emails.length,
        sincronizados,
        ausentes,
        permissoesPorUsuario: PERMISSOES_ADMIN.length,
    };
}
