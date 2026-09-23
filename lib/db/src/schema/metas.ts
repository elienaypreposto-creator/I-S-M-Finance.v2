import { pgTable, serial, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { planoContasTable } from "./plano-contas";
import { empresasTable } from "./empresas";

export const metasTable = pgTable("metas", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
  plano_conta_id: integer("plano_conta_id").references(() => planoContasTable.id).notNull(),
  ano: integer("ano").notNull(),
  mes: integer("mes").notNull(), // 1-12
  valor_projetado: numeric("valor_projetado", { precision: 15, scale: 2 }).default("0").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("metas_empresa_id_plano_conta_ano_mes_unique").on(table.empresa_id, table.plano_conta_id, table.ano, table.mes),
]);

export const insertMetaSchema = createInsertSchema(metasTable).omit({ id: true, created_at: true, updated_at: true, empresa_id: true });
export type InsertMeta = z.infer<typeof insertMetaSchema>;
export type Meta = typeof metasTable.$inferSelect;
