/**
 * Sincronização idempotente de permissões dos Super Admins de sistema.
 *
 * Usado no boot da API (sem CLI em TST/PRD) e reutilizado pelo seed CLI.
 * Nunca cria usuários, nunca toca senhas, nunca expõe segredos em log.
 */

import {eq, sql} from "drizzle-orm";
import {db} from "./client";
import {usuariosTable, usuarioPermissoesTable} from "./schema";

export const SYSTEM_ADMIN_EMAILS = [
    "admin@ism.finance",
    "ismteste@gmail.com",
    "vinicosta37@gmail.com",
] as const;

/**
 * Catálogo canônico de permissões do Super Admin (API + UI).
 * Fonte única - manter alinhado a withPermission / grant_admin.
 */
export const PERMISSOES_ADMIN: readonly string[] = [
    "dashboard:ver",

    "financeiro:lancamentos:criar",
    "financeiro:lancamentos:listar",
    "financeiro:lancamentos:editar",
    "financeiro:lancamentos:alterar_valor",
    "financeiro:lancamentos:deletar",

    "financeiro:parceiros:criar",
    "financeiro:parceiros:listar",
    "financeiro:parceiros:editar",
    "financeiro:parceiros:deletar",

    "financeiro:metas:criar",
    "financeiro:metas:listar",
    "financeiro:metas:editar",
    "financeiro:metas:deletar",

    "financeiro:fechamentos:criar",
    "financeiro:fechamentos:listar",
    "financeiro:fechamentos:deletar",

    "financeiro:contas-pagar:criar",
    "financeiro:contas-pagar:listar",
    "financeiro:contas-pagar:baixar",
    "financeiro:contas-pagar:cancelar",
    "financeiro:importar",
    "financeiro:contas-receber:criar",
    "financeiro:contas-receber:listar",
    "financeiro:contas-receber:baixar",
    "financeiro:contas-receber:cancelar",
    "financeiro:contas-receber:exportar",

    "financeiro:conciliacao:acessar",
    "financeiro:conciliacao:importar",
    "financeiro:conciliacao:vincular",
    "financeiro:conciliacao:ignorar",
    "financeiro:conciliacao:desfazer",
    "financeiro:conciliacao:concluir",
    "financeiro:conciliacao:configurar",

    "financeiro:regras-conciliacao:listar",
    "financeiro:regras-conciliacao:criar",
    "financeiro:regras-conciliacao:editar",
    "financeiro:regras-conciliacao:deletar",

    "financeiro:transferencias:criar",

    "configuracoes:contas-bancarias:criar",
    "configuracoes:contas-bancarias:listar",
    "configuracoes:contas-bancarias:editar",
    "configuracoes:contas-bancarias:deletar",

    "configuracoes:plano-contas:criar",
    "configuracoes:plano-contas:listar",
    "configuracoes:plano-contas:editar",
    "configuracoes:plano-contas:deletar",
    "configuracoes:plano-contas:exportar",

    "configuracoes:categorias:criar",
    "configuracoes:categorias:listar",
    "configuracoes:categorias:deletar",

    "configuracoes:filiais:criar",
    "configuracoes:filiais:editar",
    "configuracoes:filiais:deletar",

    "configuracoes:departamentos:criar",
    "configuracoes:departamentos:editar",
    "configuracoes:departamentos:deletar",

    "admin:usuarios:listar",
    "admin:usuarios:criar",
    "admin:usuarios:editar",
    "admin:usuarios:deletar",
    "admin:migrate-passwords",

    "admin:tokens-api:listar",
    "admin:tokens-api:criar",
    "admin:tokens-api:editar",
    "admin:tokens-api:deletar",

    "admin:auditoria:listar",
    "admin:transferencias:editar",
    "admin:transferencias:deletar",

    "relatorios:dre",
    "relatorios:fluxo-caixa-diario",
    "relatorios:fluxo-caixa-mensal",
    "relatorios:economico",
    "relatorios:financeiro",
    "relatorios:vencimento",
    "relatorios:extrato",
    "relatorios:metas",
    "relatorios:conciliacao",
    "relatorios:contabil-fiscal",
];

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
