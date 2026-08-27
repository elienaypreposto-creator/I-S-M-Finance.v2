import {pgTable, serial, text, varchar, integer, boolean, timestamp, index} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {contasBancariasTable} from "./contas-bancarias";
import {parceirosTable} from "./parceiros";
import {planoContasTable} from "./plano-contas";
import {departamentosTable, centrosCustosTable} from "./departamentos";
import {naturezaRegraConciliacaoEnum, tipoMatchRegraConciliacaoEnum} from "./enums";

/**
 * Card 48/FEAT-03 — motor de regras de conciliação.
 *
 * Cada regra casa o texto da linha do extrato (`texto_gatilho` + `tipo_match`)
 * dentro de uma `natureza` (entrada/saída — nunca cruzam) e, ao casar, aplica
 * a classificação (plano de contas, parceiro, departamento, centro de custo,
 * forma de pagamento) e, se `criar_lancamento_automatico`, cria o lançamento
 * já quitado/vinculado. `conta_id` nulo = regra vale para todas as contas.
 * Em empate de `prioridade`, a regra mais recente (`created_at`) vence — ver
 * `aplicarRegrasConciliacao` em routes/conciliacoes.ts.
 */
export const regrasConciliacaoTable = pgTable("regras_conciliacao", {
    id: serial("id").primaryKey(),
    /** null = regra vale para todas as contas bancárias. */
    conta_id: integer("conta_id").references(() => contasBancariasTable.id),
    texto_gatilho: text("texto_gatilho").notNull(),
    tipo_match: tipoMatchRegraConciliacaoEnum("tipo_match").notNull().default("contem"),
    natureza: naturezaRegraConciliacaoEnum("natureza").notNull(),
    plano_conta_id: integer("plano_conta_id").references(() => planoContasTable.id),
    parceiro_id: integer("parceiro_id").references(() => parceirosTable.id),
    departamento_id: integer("departamento_id").references(() => departamentosTable.id),
    centro_custo_id: integer("centro_custo_id").references(() => centrosCustosTable.id),
    forma_pagamento: varchar("forma_pagamento", {length: 20}),
    criar_lancamento_automatico: boolean("criar_lancamento_automatico").default(true).notNull(),
    prioridade: integer("prioridade").default(0).notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    index("regras_conciliacao_conta_id_idx").on(table.conta_id),
    // Usado pelo motor: WHERE ativo AND natureza = ... ORDER BY prioridade DESC
    index("regras_conciliacao_ativo_natureza_idx").on(table.ativo, table.natureza),
]);

export const insertRegraConciliacaoSchema = createInsertSchema(regrasConciliacaoTable).omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type InsertRegraConciliacao = z.infer<typeof insertRegraConciliacaoSchema>;
export type RegraConciliacao = typeof regrasConciliacaoTable.$inferSelect;