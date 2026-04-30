import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const logsSistemaTable = pgTable("logs_sistema", {
  id: serial("id").primaryKey(),
  servico: text("servico"),
  mensagem: text("mensagem"),
  detalhes: jsonb("detalhes"),
  created_at: timestamp("created_at").defaultNow(),
});

export type LogSistema = typeof logsSistemaTable.$inferSelect;
export type InsertLogSistema = typeof logsSistemaTable.$inferInsert;
