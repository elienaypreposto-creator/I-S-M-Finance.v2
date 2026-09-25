import {pgTable, serial, text, integer, timestamp, jsonb, varchar} from "drizzle-orm/pg-core";
import {usuariosTable} from "./usuarios";
import {empresasTable} from "./empresas";
import {tokensApiTable} from "./tokens-api";

export const logsSistemaTable = pgTable("logs_sistema", {
    id: serial("id").primaryKey(),
    servico: text("servico"),
    mensagem: text("mensagem"),
    detalhes: jsonb("detalhes"),
    created_at: timestamp("created_at").defaultNow(),
});

export const logsAuditoriaTable = pgTable("logs_auditoria", {
    id: serial("id").primaryKey(),
    empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
    usuario_id: integer("usuario_id").references(() => usuariosTable.id, {onDelete: "set null"}),
    acao: text("acao").notNull(),
    recurso: text("recurso").notNull(),
    ip: text("ip"),
    detalhes: jsonb("detalhes"),
    status_code: integer("status_code"),
    request_id: varchar("request_id", {length: 128}),
    user_agent: text("user_agent"),
    token_api_id: integer("token_api_id").references(() => tokensApiTable.id, {onDelete: "set null"}),
    duracao_ms: integer("duracao_ms"),
    created_at: timestamp("created_at").defaultNow().notNull(),
});

export type LogSistema = typeof logsSistemaTable.$inferSelect;
export type InsertLogSistema = typeof logsSistemaTable.$inferInsert;

export type LogAuditoria = typeof logsAuditoriaTable.$inferSelect;
export type InsertLogAuditoria = typeof logsAuditoriaTable.$inferInsert;
