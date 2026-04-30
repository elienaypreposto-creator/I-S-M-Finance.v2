import { pgTable, serial, text, numeric, date, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contasBancariasTable } from "./contas-bancarias";
import { parceirosTable } from "./parceiros";
import { planoContasTable } from "./plano-contas";
import { departamentosTable, centrosCustosTable } from "./departamentos";

export const lancamentosTable = pgTable("lancamentos", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(), // CP, CR
  vencimento: date("vencimento").notNull(),
  competencia: date("competencia"),
  conta_id: integer("conta_id").references(() => contasBancariasTable.id),
  parceiro_id: integer("parceiro_id").references(() => parceirosTable.id),
  descricao: text("descricao"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("pendente"), // pendente, pago, recebido, atrasado, cancelado
  plano_conta_id: integer("plano_conta_id").references(() => planoContasTable.id),
  departamento_id: integer("departamento_id").references(() => departamentosTable.id),
  centro_custo_id: integer("centro_custo_id").references(() => centrosCustosTable.id),
  parcela_atual: integer("parcela_atual").default(1),
  total_parcelas: integer("total_parcelas").default(1),
  riscos: jsonb("riscos").$type<string[]>().default([]),
  criado_por: integer("criado_por").references(() => usuariosTable.id),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLancamentoSchema = createInsertSchema(lancamentosTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertLancamento = z.infer<typeof insertLancamentoSchema>;
export type Lancamento = typeof lancamentosTable.$inferSelect;
