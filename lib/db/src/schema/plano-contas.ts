import { integer, pgTable, serial, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { empresasTable } from "./empresas";

export const planoContasTable = pgTable("plano_contas", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
  tipo: text("tipo").notNull(), // receita, custo, despesa
  categoria: text("categoria").notNull(),
  subcategoria: text("subcategoria"),
  codigo: text("codigo"),
  ativo: boolean("ativo").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("plano_contas_empresa_id_codigo_unique").on(table.empresa_id, table.codigo),
]);

export const insertPlanoContaSchema = createInsertSchema(planoContasTable).omit({ id: true, created_at: true, updated_at: true, empresa_id: true });
export type InsertPlanoConta = z.infer<typeof insertPlanoContaSchema>;
export type PlanoConta = typeof planoContasTable.$inferSelect;
