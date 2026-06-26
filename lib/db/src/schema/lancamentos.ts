import {
    pgTable,
    serial,
    text,
    varchar,
    numeric,
    date,
    integer,
    jsonb,
    timestamp,
    boolean,
    foreignKey,
    index
} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {contasBancariasTable} from "./contas-bancarias";
import {parceirosTable} from "./parceiros";
import {planoContasTable} from "./plano-contas";
import {departamentosTable, centrosCustosTable} from "./departamentos";
import {usuariosTable} from "./usuarios";
import {origemLancamentoEnum, statusLancamentoEnum, tipoLancamentoEnum} from "./enums";

export const lancamentosTable = pgTable("lancamentos", {
    id: serial("id").primaryKey(),
    tipo: tipoLancamentoEnum("tipo").notNull(),
    vencimento: date("vencimento").notNull(),
    competencia: date("competencia"),
    conta_id: integer("conta_id").references(() => contasBancariasTable.id),
    parceiro_id: integer("parceiro_id").references(() => parceirosTable.id),
    descricao: text("descricao"),
    valor: numeric("valor", {precision: 15, scale: 2}).notNull(),
    status: statusLancamentoEnum("status").notNull().default("pendente"),
    origem: origemLancamentoEnum("origem").notNull().default("manual"),
    plano_conta_id: integer("plano_conta_id").references(() => planoContasTable.id),
    departamento_id: integer("departamento_id").references(() => departamentosTable.id),
    centro_custo_id: integer("centro_custo_id").references(() => centrosCustosTable.id),
    parcela_atual: integer("parcela_atual").default(1),
    total_parcelas: integer("total_parcelas").default(1),
    riscos: jsonb("riscos").$type<string[]>().default([]),
    // Campos de baixa/quitação
    data_quitacao: date("data_quitacao"),
    valor_quitado: numeric("valor_quitado", {precision: 15, scale: 2}),
    juros: numeric("juros", {precision: 15, scale: 2}).default("0"),
    multa: numeric("multa", {precision: 15, scale: 2}).default("0"),
    desconto: numeric("desconto", {precision: 15, scale: 2}).default("0"),
    acrescimo: numeric("acrescimo", {precision: 15, scale: 2}).default("0"),
    // Forma de pagamento
    forma_pagamento: varchar("forma_pagamento", {length: 20}),
    dados_pagamento: jsonb("dados_pagamento").$type<{
        tipo: "PIX" | "TED" | "Boleto";
        [key: string]: unknown;
    } | null>(),
    // Resíduo parcial
    is_residuo_parcial: boolean("is_residuo_parcial").default(false).notNull(),
    lancamento_origem_id: integer("lancamento_origem_id"),
    // Transferência espelhada
    transferencia_grupo_id: text("transferencia_grupo_id"),
    criado_por: integer("criado_por").references(() => usuariosTable.id),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.lancamento_origem_id],
        foreignColumns: [table.id],
        name: "lancamentos_lancamento_origem_id_fkey",
    }),
    // Índices de consulta FK (joins with contas_bancarias, parceiros, plano_contas)
    index("lancamentos_conta_id_idx").on(table.conta_id),
    index("lancamentos_parceiro_id_idx").on(table.parceiro_id),
    index("lancamentos_plano_conta_id_idx").on(table.plano_conta_id),
    // Consultas de intervalo de datas (vencimento BETWEEN, ORDER BY)
    index("lancamentos_vencimento_idx").on(table.vencimento),
    // Presente em praticamente todas as cláusulas WHERE em rotas e relatórios
    index("lancamentos_status_idx").on(table.status),
    // Filtro/ordenação de consultas de fluxo de caixa e painel de controle por data de liquidação
    index("lancamentos_data_quitacao_idx").on(table.data_quitacao),
]);

export const insertLancamentoSchema = createInsertSchema(lancamentosTable).omit({
    id: true,
    created_at: true,
    updated_at: true
});
export type InsertLancamento = z.infer<typeof insertLancamentoSchema>;
export type Lancamento = typeof lancamentosTable.$inferSelect;
