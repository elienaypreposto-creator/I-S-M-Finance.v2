import {pgTable, serial, text, integer, numeric, date, timestamp, index, uniqueIndex} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {contasBancariasTable} from "./contas-bancarias";
import {lancamentosTable} from "./lancamentos";
import {usuariosTable} from "./usuarios";
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
    total_creditos: numeric("total_creditos", {precision: 15, scale: 2}).default("0").notNull(),
    total_debitos: numeric("total_debitos", {precision: 15, scale: 2}).default("0").notNull(),
    /** Saldo informado pelo banco (LEDGERBAL) - DEF-03. */
    saldo_final_banco: numeric("saldo_final_banco", {precision: 15, scale: 2}),
    saldo_banco_data: date("saldo_banco_data"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    index("extratos_conta_id_idx").on(table.conta_id),
    index("extratos_arquivo_hash_idx").on(table.arquivo_hash),
]);

export const extratoLinhasTable = pgTable("extrato_linhas", {
    id: serial("id").primaryKey(),
    extrato_id: integer("extrato_id").references(() => extratosTable.id).notNull(),
    /** Desnormalizado para dedupe entre extratos (DEF-02). */
    conta_id: integer("conta_id").references(() => contasBancariasTable.id).notNull(),
    identificador_externo: text("identificador_externo"),
    /** SHA-256 estável por conta - dedupe entre recortes (DEF-02). */
    hash_linha: text("hash_linha").notNull(),
    valor: numeric("valor", {precision: 15, scale: 2}).notNull(),
    saldo_pos_linha: numeric("saldo_pos_linha", {precision: 15, scale: 2}),
    tipo_movimento: tipoMovimentoExtratoEnum("tipo_movimento").notNull(),
    descricao: text("descricao"),
    data_movimento: date("data_movimento"),
    data_compensacao: date("data_compensacao"),
    documento: text("documento"),
    observacao: text("observacao"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("extrato_linhas_conta_id_identificador_externo_idx").on(
        table.conta_id,
        table.identificador_externo,
    ),
    uniqueIndex("extrato_linhas_conta_id_hash_linha_idx").on(table.conta_id, table.hash_linha),
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
    data_conciliacao: date("data_conciliacao"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    index("conciliacoes_extrato_id_idx").on(table.extrato_id),
    index("conciliacoes_conta_id_idx").on(table.conta_id),
]);

export const itensConciliacaoTable = pgTable("itens_conciliacao", {
    id: serial("id").primaryKey(),
    conciliacao_id: integer("conciliacao_id").references(() => conciliacoesTable.id).notNull(),
    extrato_linha_id: integer("extrato_linha_id").references(() => extratoLinhasTable.id).notNull(),
    valor_extrato: numeric("valor_extrato", {precision: 15, scale: 2}).notNull(),
    valor_vinculado_total: numeric("valor_vinculado_total", {precision: 15, scale: 2}).default("0").notNull(),
    valor_saldo: numeric("valor_saldo", {precision: 15, scale: 2}).default("0").notNull(),
    status: statusItemConciliacaoEnum("status").notNull().default("pendente"),
    tipo_extrato: tipoMovimentoExtratoEnum("tipo_extrato").notNull(),
    descricao: text("descricao"),
    data: date("data"),
    motivo_ignorar: text("motivo_ignorar"),
    motivo_ignorar_codigo: text("motivo_ignorar_codigo"),
    data_conciliacao: date("data_conciliacao"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    // COUNT by conciliacao_id (resumo de status) e pesquisar por extrato_linha_id (vincular/ignorar)
    index("itens_conciliacao_conciliacao_id_idx").on(table.conciliacao_id),
    index("itens_conciliacao_extrato_linha_id_idx").on(table.extrato_linha_id),
]);

export const itensConciliacaoLancamentosTable = pgTable("itens_conciliacao_lancamentos", {
    id: serial("id").primaryKey(),
    item_conciliacao_id: integer("item_conciliacao_id").references(() => itensConciliacaoTable.id).notNull(),
    lancamento_id: integer("lancamento_id").references(() => lancamentosTable.id).notNull(),
    valor_vinculado: numeric("valor_vinculado", {precision: 15, scale: 2}).notNull(),
    desconto: numeric("desconto", {precision: 15, scale: 2}).default("0").notNull(),
    juros_multa: numeric("juros_multa", {precision: 15, scale: 2}).default("0").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    index("itens_conciliacao_lancamentos_item_id_idx").on(table.item_conciliacao_id),
    index("itens_conciliacao_lancamentos_lancamento_id_idx").on(table.lancamento_id),
]);

export const historicoConciliacaoTable = pgTable("historico_conciliacao", {
    id: serial("id").primaryKey(),
    conciliacao_id: integer("conciliacao_id").references(() => conciliacoesTable.id).notNull(),
    item_conciliacao_id: integer("item_conciliacao_id").references(() => itensConciliacaoTable.id),
    usuario_id: integer("usuario_id").references(() => usuariosTable.id),
    acao: acaoHistoricoConciliacaoEnum("acao").notNull(),
    detalhes: text("detalhes"),
    created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index("historico_conciliacao_conciliacao_id_idx").on(table.conciliacao_id),
]);

export const insertExtratoSchema = createInsertSchema(extratosTable).omit({
    id: true,
    created_at: true,
    updated_at: true,
    importado_em: true
});
export type InsertExtrato = z.infer<typeof insertExtratoSchema>;
export type Extrato = typeof extratosTable.$inferSelect;

export const insertExtratoLinhaSchema = createInsertSchema(extratoLinhasTable).omit({
    id: true,
    created_at: true,
    updated_at: true
});
export type InsertExtratoLinha = z.infer<typeof insertExtratoLinhaSchema>;
export type ExtratoLinha = typeof extratoLinhasTable.$inferSelect;

export const insertConciliacaoSchema = createInsertSchema(conciliacoesTable).omit({
    id: true,
    created_at: true,
    updated_at: true
});
export type InsertConciliacao = z.infer<typeof insertConciliacaoSchema>;
export type Conciliacao = typeof conciliacoesTable.$inferSelect;

export const insertItemConciliacaoSchema = createInsertSchema(itensConciliacaoTable).omit({
    id: true,
    created_at: true,
    updated_at: true
});
export type InsertItemConciliacao = z.infer<typeof insertItemConciliacaoSchema>;
export type ItemConciliacao = typeof itensConciliacaoTable.$inferSelect;

export const insertItemConciliacaoLancamentoSchema = createInsertSchema(itensConciliacaoLancamentosTable).omit({
    id: true,
    created_at: true,
    updated_at: true
});
export type InsertItemConciliacaoLancamento = z.infer<typeof insertItemConciliacaoLancamentoSchema>;
export type ItemConciliacaoLancamento = typeof itensConciliacaoLancamentosTable.$inferSelect;

export const insertHistoricoConciliacaoSchema = createInsertSchema(historicoConciliacaoTable).omit({
    id: true,
    created_at: true
});
export type InsertHistoricoConciliacao = z.infer<typeof insertHistoricoConciliacaoSchema>;
export type HistoricoConciliacao = typeof historicoConciliacaoTable.$inferSelect;
