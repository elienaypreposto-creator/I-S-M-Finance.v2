import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contasBancariasTable = pgTable("contas_bancarias", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(), // corrente, movimento, poupanca
  banco: text("banco"),
  agencia: text("agencia"),
  digito_agencia: text("digito_agencia"),
  conta: text("conta"),
  digito_conta: text("digito_conta"),
  nome: text("nome").notNull(),
  empresa: text("empresa"),
  saldo_inicial: numeric("saldo_inicial", { precision: 15, scale: 2 }).default("0"),
  data_inicio: date("data_inicio").notNull(),
  status: text("status").default("ativo").notNull(), // ativo, bloqueado
  cor: text("cor").default("#3BA8DC"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertContaBancariaSchema = createInsertSchema(contasBancariasTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertContaBancaria = z.infer<typeof insertContaBancariaSchema>;
export type ContaBancaria = typeof contasBancariasTable.$inferSelect;
