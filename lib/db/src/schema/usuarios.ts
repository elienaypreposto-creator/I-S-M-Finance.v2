import { pgTable, serial, text, boolean, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  telefone: text("telefone"),
  celular: text("celular"),
  senha_hash: text("senha_hash").notNull(),
  bloqueado: boolean("bloqueado").default(false).notNull(),
  ultimo_acesso: timestamp("ultimo_acesso"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const usuarioPermissoesTable = pgTable("usuario_permissoes", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").references(() => usuariosTable.id).notNull(),
  codigo_permissao: text("codigo_permissao").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("usuario_permissoes_usuario_id_codigo_permissao_idx").on(table.usuario_id, table.codigo_permissao),
]);

/** Tabela de refresh tokens — um registro por sessão ativa */
export const refreshTokensTable = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").references(() => usuariosTable.id, { onDelete: "cascade" }).notNull(),
  token_hash: text("token_hash").notNull().unique(),
  expires_at: timestamp("expires_at").notNull(),
  revogado: boolean("revogado").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Alias de compatibilidade temporária com nomenclatura antiga
export const permissoesTable = usuarioPermissoesTable;

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;

/** Schema de seleção segura — NUNCA expõe senha_hash na API */
export const selectUsuarioPublicoSchema = createSelectSchema(usuariosTable).omit({ senha_hash: true });
export type UsuarioPublico = z.infer<typeof selectUsuarioPublicoSchema>;

export const insertUsuarioPermissaoSchema = createInsertSchema(usuarioPermissoesTable).omit({ id: true, created_at: true });
export type InsertUsuarioPermissao = z.infer<typeof insertUsuarioPermissaoSchema>;
export type UsuarioPermissao = typeof usuarioPermissoesTable.$inferSelect;

export const insertRefreshTokenSchema = createInsertSchema(refreshTokensTable).omit({ id: true, created_at: true });
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
