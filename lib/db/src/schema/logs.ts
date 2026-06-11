import {pgTable, serial, text, integer, timestamp, jsonb} from "drizzle-orm/pg-core";
import {usuariosTable} from "./usuarios";

export const logsSistemaTable = pgTable("logs_sistema", {
    id: serial("id").primaryKey(),
    servico: text("servico"),
    mensagem: text("mensagem"),
    detalhes: jsonb("detalhes"),
    created_at: timestamp("created_at").defaultNow(),
});

export const logsAuditoriaTable = pgTable("logs_auditoria", {
    id: serial("id").primaryKey(),
    usuario_id: integer("usuario_id").references(() => usuariosTable.id, {onDelete: "set null"}),
    acao: text("acao").notNull(), // HTTP method
    recurso: text("recurso").notNull(), // originalUrl
    ip: text("ip"),
    detalhes: jsonb("detalhes"), // sanitised req.body
    status_code: integer("status_code"),
    created_at: timestamp("created_at").defaultNow().notNull(),
});

export type LogSistema = typeof logsSistemaTable.$inferSelect;
export type InsertLogSistema = typeof logsSistemaTable.$inferInsert;

export type LogAuditoria = typeof logsAuditoriaTable.$inferSelect;
export type InsertLogAuditoria = typeof logsAuditoriaTable.$inferInsert;
