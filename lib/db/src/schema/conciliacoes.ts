import { pgTable, serial, text, integer, numeric, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contasBancariasTable } from "./contas-bancarias";
import { lancamentosTable } from "./lancamentos";
import { usuariosTable } from "./usuarios";
import {
  acaoHistoricoConciliacaoEnum,
  statusConciliacaoEnum,
  statusExtratoEnum,
  statusItemConciliacaoEnum,
  tipoMovimentoExtratoEnum,
} from "./enums";

export const extratosTable = pgTable("extratos", {
  id: serial("id").primaryKey(),
  conta_id: integer("conta_id").references(() => contasBancariasTable.id).notNull(),
  periodo_inicio: date("periodo_inicio"),
  periodo_fim: date("periodo_fim"),
  status: statusExtratoEnum("status").notNull().default("pendente"),
  arquivo_nome: text("arquivo_nome"),
  arquivo_hash: text("arquivo_hash"),
  importado_em: timestamp("importado_em").defaultNow().notNull(),
  total_linhas: integer("total_linhas").default(0).notNull(),
  total_creditos: numeric("total_creditos", { precision: 15, scale: 2 }).default("0").notNull(),
  total_debitos: numeric("total_debitos", { precision: 15, scale: 2 }).default("0").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const extratoLinhasTable = pgTable("extrato_linhas", {
  id: serial("id").primaryKey(),
  extrato_id: integer("extrato_id").references(() => extratosTable.id).notNull(),
  identificador_externo: text("identificador_externo"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull(),
  saldo_pos_linha: numeric("saldo_pos_linha", { precision: 15, scale: 2 }),
  tipo_movimento: tipoMovimentoExtratoEnum("tipo_movimento").notNull(),
  descricao: text("descricao"),
  data_movimento: date("data_movimento"),
  data_compensacao: date("data_compensacao"),
  documento: text("documento"),
  observacao: text("observacao"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("extrato_linhas_extrato_id_identificador_externo_idx").on(table.extrato_id, table.identificador_externo),
]);

export const conciliacoesTable = pgTable("conciliacoes", {
  id: serial("id").primaryKey(),
  extrato_id: integer("extrato_id").references(() => extratosTable.id).notNull(),
  conta_id: integer("conta_id").references(() => contasBancariasTable.id).notNull(),
  periodo_inicio: date("periodo_inicio"),
  periodo_fim: date("periodo_fim"),
  status: statusConciliacaoEnum("status").notNull().default("pendente"),
  arquivo_nome: text("arquivo_nome"),
  resumo_conciliados: integer("resumo_conciliados").default(0).notNull(),
  resumo_ignorados: integer("resumo_ignorados").default(0).notNull(),
  resumo_pendentes: integer("resumo_pendentes").default(0).notNull(),
  resumo_total: integer("resumo_total").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const itensConciliacaoTable = pgTable("itens_conciliacao", {
  id: serial("id").primaryKey(),
  conciliacao_id: integer("conciliacao_id").references(() => conciliacoesTable.id).notNull(),
  extrato_linha_id: integer("extrato_linha_id").references(() => extratoLinhasTable.id).notNull(),
  valor_extrato: numeric("valor_extrato", { precision: 15, scale: 2 }).notNull(),
  valor_vinculado_total: numeric("valor_vinculado_total", { precision: 15, scale: 2 }).default("0").notNull(),
  valor_saldo: numeric("valor_saldo", { precision: 15, scale: 2 }).default("0").notNull(),
  status: statusItemConciliacaoEnum("status").notNull().default("pendente"),
  tipo_extrato: tipoMovimentoExtratoEnum("tipo_extrato").notNull(),
  descricao: text("descricao"),
  data: date("data"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const itensConciliacaoLancamentosTable = pgTable("itens_conciliacao_lancamentos", {
  id: serial("id").primaryKey(),
  item_conciliacao_id: integer("item_conciliacao_id").references(() => itensConciliacaoTable.id).notNull(),
  lancamento_id: integer("lancamento_id").references(() => lancamentosTable.id).notNull(),
  valor_vinculado: numeric("valor_vinculado", { precision: 15, scale: 2 }).notNull(),
  desconto: numeric("desconto", { precision: 15, scale: 2 }).default("0").notNull(),
  acrescimo: numeric("acrescimo", { precision: 15, scale: 2 }).default("0").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const historicoConciliacaoTable = pgTable("historico_conciliacao", {
  id: serial("id").primaryKey(),
  conciliacao_id: integer("conciliacao_id").references(() => conciliacoesTable.id).notNull(),
  item_conciliacao_id: integer("item_conciliacao_id").references(() => itensConciliacaoTable.id),
  usuario_id: integer("usuario_id").references(() => usuariosTable.id),
  acao: acaoHistoricoConciliacaoEnum("acao").notNull(),
  detalhes: text("detalhes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertExtratoSchema = createInsertSchema(extratosTable).omit({ id: true, created_at: true, updated_at: true, importado_em: true });
export type InsertExtrato = z.infer<typeof insertExtratoSchema>;
export type Extrato = typeof extratosTable.$inferSelect;

export const insertExtratoLinhaSchema = createInsertSchema(extratoLinhasTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertExtratoLinha = z.infer<typeof insertExtratoLinhaSchema>;
export type ExtratoLinha = typeof extratoLinhasTable.$inferSelect;

export const insertConciliacaoSchema = createInsertSchema(conciliacoesTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertConciliacao = z.infer<typeof insertConciliacaoSchema>;
export type Conciliacao = typeof conciliacoesTable.$inferSelect;

export const insertItemConciliacaoSchema = createInsertSchema(itensConciliacaoTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertItemConciliacao = z.infer<typeof insertItemConciliacaoSchema>;
export type ItemConciliacao = typeof itensConciliacaoTable.$inferSelect;

export const insertItemConciliacaoLancamentoSchema = createInsertSchema(itensConciliacaoLancamentosTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertItemConciliacaoLancamento = z.infer<typeof insertItemConciliacaoLancamentoSchema>;
export type ItemConciliacaoLancamento = typeof itensConciliacaoLancamentosTable.$inferSelect;

export const insertHistoricoConciliacaoSchema = createInsertSchema(historicoConciliacaoTable).omit({ id: true, created_at: true });
export type InsertHistoricoConciliacao = z.infer<typeof insertHistoricoConciliacaoSchema>;
export type HistoricoConciliacao = typeof historicoConciliacaoTable.$inferSelect;
