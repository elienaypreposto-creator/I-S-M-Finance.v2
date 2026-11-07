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
    index,
    check,
} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {contasBancariasTable} from "./contas-bancarias";
import {parceirosTable} from "./parceiros";
import {planoContasTable} from "./plano-contas";
import {departamentosTable, centrosCustosTable} from "./departamentos";
import {usuariosTable} from "./usuarios";
import {empresasTable} from "./empresas";
import {origemLancamentoEnum, statusLancamentoEnum, tipoDocumentoLancamentoEnum, tipoLancamentoEnum} from "./enums";

export const lancamentosTable = pgTable("lancamentos", {
    id: serial("id").primaryKey(),
    empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
    tipo: tipoLancamentoEnum("tipo").notNull(),
    vencimento: date("vencimento").notNull(),
    competencia: date("competencia"),
    conta_id: integer("conta_id").references(() => contasBancariasTable.id),
    parceiro_id: integer("parceiro_id").references(() => parceirosTable.id),
    descricao: text("descricao"),
    tipo_documento: tipoDocumentoLancamentoEnum("tipo_documento"),
    numero_documento: varchar("numero_documento", {length: 60}),
    observacao: text("observacao"),
    valor: numeric("valor", {precision: 15, scale: 2}).notNull(),
    // Retenções na fonte (o tomador retém e paga o líquido). `valor` segue
    // sendo o BRUTO da nota; `valor_liquido` é a base da quitação.
    retencao_ir: numeric("retencao_ir", {precision: 15, scale: 2}).notNull().default("0"),
    retencao_pis: numeric("retencao_pis", {precision: 15, scale: 2}).notNull().default("0"),
    retencao_cofins: numeric("retencao_cofins", {precision: 15, scale: 2}).notNull().default("0"),
    retencao_csll: numeric("retencao_csll", {precision: 15, scale: 2}).notNull().default("0"),
    retencao_inss: numeric("retencao_inss", {precision: 15, scale: 2}).notNull().default("0"),
    retencao_iss: numeric("retencao_iss", {precision: 15, scale: 2}).notNull().default("0"),
    // Coluna gerada (STORED): nunca entra em INSERT/UPDATE.
    valor_liquido: numeric("valor_liquido", {precision: 15, scale: 2}).generatedAlwaysAs(
        sql`"valor" - ("retencao_ir" + "retencao_pis" + "retencao_cofins" + "retencao_csll" + "retencao_inss" + "retencao_iss")`,
    ),
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
    check(
        "lancamentos_retencoes_nao_negativas_chk",
        sql`${table.retencao_ir} >= 0 AND ${table.retencao_pis} >= 0 AND ${table.retencao_cofins} >= 0 AND ${table.retencao_csll} >= 0 AND ${table.retencao_inss} >= 0 AND ${table.retencao_iss} >= 0`,
    ),
    check(
        "lancamentos_retencoes_ate_valor_chk",
        sql`(${table.retencao_ir} + ${table.retencao_pis} + ${table.retencao_cofins} + ${table.retencao_csll} + ${table.retencao_inss} + ${table.retencao_iss}) = 0 OR (${table.retencao_ir} + ${table.retencao_pis} + ${table.retencao_cofins} + ${table.retencao_csll} + ${table.retencao_inss} + ${table.retencao_iss}) <= ${table.valor}`,
    ),
    foreignKey({
        columns: [table.lancamento_origem_id],
        foreignColumns: [table.id],
        name: "lancamentos_lancamento_origem_id_fkey",
    }),
    // esse filtro sozinho e composto com status (padrão mais comum nas rotas).
    index("lancamentos_empresa_id_idx").on(table.empresa_id),
    index("lancamentos_empresa_id_status_idx").on(table.empresa_id, table.status),
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
    index("lancamentos_empresa_id_vencimento_idx").on(table.empresa_id, table.vencimento),
    index("lancamentos_empresa_id_conta_id_idx").on(table.empresa_id, table.conta_id),
]);

export const insertLancamentoSchema = createInsertSchema(lancamentosTable).omit({
    id: true,
    created_at: true,
    updated_at: true,
    empresa_id: true,
});
export type InsertLancamento = z.infer<typeof insertLancamentoSchema>;
export type Lancamento = typeof lancamentosTable.$inferSelect;