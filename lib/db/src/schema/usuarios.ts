import {pgTable, serial, text, boolean, timestamp, integer, uniqueIndex} from "drizzle-orm/pg-core";
import {createInsertSchema, createSelectSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {empresasTable} from "./empresas";

export const usuariosTable = pgTable("usuarios", {
    id: serial("id").primaryKey(),
    nome: text("nome").notNull(),
    email: text("email").notNull().unique(),
    cargo: text("cargo"),
    perfil_base: text("perfil_base"),
    telefone: text("telefone"),
    celular: text("celular"),
    senha_hash: text("senha_hash").notNull(),
    senha_unica_hash: text("senha_unica_hash"),
    senha_unica_utilizada: boolean("senha_unica_utilizada").default(false).notNull(),
    bloqueado: boolean("bloqueado").default(false).notNull(),
    /**
     * NOVO — Card 2 (Permissões). Único lugar onde "acesso irrestrito a
     * TODAS as empresas" existe. Nunca concedível pela API — só via
     * `syncAdminPermissionsOnBoot` (lista fixa de e-mails) ou seed direto
     * no banco. Substitui o antigo padrão de conceder `"*"` em
     * `usuario_permissoes`, que não sabia distinguir empresa nenhuma.
     */
    superadmin: boolean("superadmin").default(false).notNull(),
    ultimo_acesso: timestamp("ultimo_acesso"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * ALTERADO — Card 2: ganhou `empresa_id`. Uma permissão só vale DENTRO de
 * uma empresa — o contador da empresa A com `financeiro:lancamentos:editar`
 * deixa de carregar essa permissão pra dentro da empresa B só por ter
 * vínculo lá também (fetchPermissions em routes/auth.ts agora filtra por
 * empresa_id ao montar o token).
 */
export const usuarioPermissoesTable = pgTable("usuario_permissoes", {
    id: serial("id").primaryKey(),
    usuario_id: integer("usuario_id").references(() => usuariosTable.id).notNull(),
    empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
    codigo_permissao: text("codigo_permissao").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    // ANTES: uniqueIndex(...).on(table.usuario_id, table.codigo_permissao)
    uniqueIndex("usuario_permissoes_usuario_id_empresa_id_codigo_permissao_idx").on(
        table.usuario_id,
        table.empresa_id,
        table.codigo_permissao,
    ),
]);

/** Um registo por sessão ativa — revogado = true após uso ou ao fazer logout. */
export const refreshTokensTable = pgTable("refresh_tokens", {
    id: serial("id").primaryKey(),
    usuario_id: integer("usuario_id").references(() => usuariosTable.id, {onDelete: "cascade"}).notNull(),
    token_hash: text("token_hash").notNull().unique(),
    expires_at: timestamp("expires_at").notNull(),
    revogado: boolean("revogado").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
});

// Alias de compatibilidade com código que importa `permissoesTable`
export const permissoesTable = usuarioPermissoesTable;

// ─── Schemas Zod derivados do schema Drizzle ──────────────────────────────────

const emailValidator = z.email().toLowerCase().trim();

export const insertUsuarioSchema = createInsertSchema(usuariosTable, {
    email: emailValidator,
    nome: z.string().min(2).max(120).trim(),
}).omit({
    id: true,
    created_at: true,
    updated_at: true,
    senha_unica_hash: true,
    senha_unica_utilizada: true,
    superadmin: true, // nunca setável via input genérico de criação/edição de usuário
});

export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;

/** Schema de seleção segura — NUNCA expõe senha_hash nem campos OTP. */
export const selectUsuarioPublicoSchema = createSelectSchema(usuariosTable).omit({
    senha_hash: true,
    senha_unica_hash: true,
    senha_unica_utilizada: true,
});
export type UsuarioPublico = z.infer<typeof selectUsuarioPublicoSchema>;

export const insertUsuarioPermissaoSchema = createInsertSchema(usuarioPermissoesTable).omit({
    id: true,
    created_at: true
});
export type InsertUsuarioPermissao = z.infer<typeof insertUsuarioPermissaoSchema>;
export type UsuarioPermissao = typeof usuarioPermissoesTable.$inferSelect;

export const insertRefreshTokenSchema = createInsertSchema(refreshTokensTable).omit({id: true, created_at: true});
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;