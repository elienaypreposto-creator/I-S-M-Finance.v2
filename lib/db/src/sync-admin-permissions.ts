/**
 * Sincronização idempotente dos Super Admins de sistema.
 *
 * ALTERADO — Card 2 (Permissões): antes injetava todo o catálogo
 * PERMISSOES_ADMIN como linhas em usuario_permissoes (uma tabela por
 * usuário, sem noção de empresa); agora só liga `usuarios.superadmin`.
 * Superadmin bypassa withPermission/withSuperadmin inteiramente (ver
 * middlewares/withPermission.ts e withSuperadmin.ts), então não precisa de
 * nenhuma linha de permissão gravada — e como permissão agora é por
 * empresa (usuario_permissoes.empresa_id), não existiria "a empresa certa"
 * pra gravar essas ~80 linhas de qualquer forma.
 *
 * Mantém o vínculo com a empresa 1 como papel "admin" (não mais "superuser
 * de permissões" — só o vínculo de conveniência que já existia, pra login
 * ter uma empresa ativa por padrão; `superadmin=true` é o que realmente
 * abre as portas).
 *
 * Usado no boot da API (sem CLI em TST/PRD) e reutilizado pelo seed CLI.
 * Nunca cria usuários, nunca toca senhas, nunca expõe segredos em log.
 * Nunca grava `"*"`. O catálogo granular é a única fonte.
 */

import {eq, sql} from "drizzle-orm";
import {db} from "./client";
import {usuariosTable, usuarioEmpresasTable} from "./schema";
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

/** Resolve e-mails alvo do seed/boot: lista estática + ADMIN_EMAIL + ADMIN_EMAILS (env). */
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
    /** Mantido por compatibilidade de assinatura — sempre 0 agora (nada mais é inserido em usuario_permissoes). */
    permissoesPorUsuario: number;
};

/**
 * Marca `superadmin = true` nos usuários de sistema que já existem no banco
 * e garante o vínculo de conveniência com a empresa 1. Não cria contas.
 * Fail-soft no chamador - esta função pode lançar em erro de DB.
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
            .update(usuariosTable)
            .set({superadmin: true, perfil_base: "Admin", updated_at: new Date()})
            .where(eq(usuariosTable.id, usuario.id));

        await db
            .insert(usuarioEmpresasTable)
            .values({
                usuario_id: usuario.id,
                empresa_id: 1,
                papel: "admin",
                ativo: true,
            })
            .onConflictDoUpdate({
                target: [usuarioEmpresasTable.usuario_id, usuarioEmpresasTable.empresa_id],
                set: {papel: "admin", ativo: true},
            });

        sincronizados += 1;
    }

    return {
        emailsAlvo: emails.length,
        sincronizados,
        ausentes,
        permissoesPorUsuario: 0,
    };
}