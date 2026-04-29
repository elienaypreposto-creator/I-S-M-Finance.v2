import { pgTable, serial, text, integer, date, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usuariosTable } from "./usuarios";

export const kanbanCardsTable = pgTable("kanban_cards", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  coluna: text("coluna").notNull().default("solicitado"),
  responsavel_id: integer("responsavel_id").references(() => usuariosTable.id),
  responsaveis_multiplos: jsonb("responsaveis_multiplos").$type<number[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  checklist: jsonb("checklist").$type<{ id: string; texto: string; completed: boolean }[]>().default([]),
  comentarios_count: integer("comentarios_count").default(0),
  anexos_count: integer("anexos_count").default(0),
  prazo: date("prazo"),
  prioridade: text("prioridade").notNull().default("media"),
  criado_por: integer("criado_por").references(() => usuariosTable.id),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const kanbanComentariosTable = pgTable("kanban_comentarios", {
  id: serial("id").primaryKey(),
  card_id: integer("card_id").references(() => kanbanCardsTable.id).notNull(),
  usuario_id: integer("usuario_id").references(() => usuariosTable.id).notNull(),
  comentario: text("comentario").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const kanbanAnexosTable = pgTable("kanban_anexos", {
  id: serial("id").primaryKey(),
  card_id: integer("card_id").references(() => kanbanCardsTable.id).notNull(),
  usuario_id: integer("usuario_id").references(() => usuariosTable.id).notNull(),
  nome_arquivo: text("nome_arquivo").notNull(),
  url: text("url").notNull(),
  tipo: text("tipo"),
  tamanho: integer("tamanho"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const kanbanHistoricoTable = pgTable("kanban_historico", {
  id: serial("id").primaryKey(),
  card_id: integer("card_id").references(() => kanbanCardsTable.id).notNull(),
  coluna_anterior: text("coluna_anterior"),
  coluna_nova: text("coluna_nova"),
  comentario: text("comentario"),
  usuario_id: integer("usuario_id").references(() => usuariosTable.id),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertKanbanCardSchema = createInsertSchema(kanbanCardsTable).omit({ id: true, created_at: true, updated_at: true, comentarios_count: true, anexos_count: true });
export type InsertKanbanCard = z.infer<typeof insertKanbanCardSchema>;
export type KanbanCard = typeof kanbanCardsTable.$inferSelect;

export const insertKanbanComentarioSchema = createInsertSchema(kanbanComentariosTable).omit({ id: true, created_at: true });
export type InsertComentario = z.infer<typeof insertKanbanComentarioSchema>;
export type KanbanComentario = typeof kanbanComentariosTable.$inferSelect;

export const insertKanbanAnexoSchema = createInsertSchema(kanbanAnexosTable).omit({ id: true, created_at: true });
export type InsertAnexo = z.infer<typeof insertKanbanAnexoSchema>;
export type KanbanAnexo = typeof kanbanAnexosTable.$inferSelect;