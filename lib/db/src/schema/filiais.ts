import {integer, pgTable, serial, text, timestamp, index} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";

export const filiaisTable = pgTable("filiais", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
  nome: text("nome").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index("filiais_empresa_id_idx").on(table.empresa_id),
]);

export const insertFilialSchema = createInsertSchema(filiaisTable).omit({ id: true, created_at: true, empresa_id: true });
export type InsertFilial = z.infer<typeof insertFilialSchema>;
export type Filial = typeof filiaisTable.$inferSelect;
