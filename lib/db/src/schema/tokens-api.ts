import { integer, pgTable, serial, text, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";

export const tokensApiTable = pgTable("tokens_api", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
  descricao: text("descricao").notNull(),
  token_hash: text("token_hash").notNull().unique(),
  token_preview: text("token_preview"), // first/last few chars for display
  data_expiracao: date("data_expiracao"),
  ativo: boolean("ativo").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTokenApiSchema = createInsertSchema(tokensApiTable).omit({ id: true, created_at: true, updated_at: true, empresa_id: true });
export type InsertTokenApi = z.infer<typeof insertTokenApiSchema>;
export type TokenApi = typeof tokensApiTable.$inferSelect;
