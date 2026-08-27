import {pgTable, serial, text, varchar, boolean, integer, jsonb, timestamp, uniqueIndex} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {departamentosTable, centrosCustosTable} from "./departamentos";

export const parceirosTable = pgTable("parceiros", {
    id: serial("id").primaryKey(),
    tipo_pessoa: text("tipo_pessoa").notNull(), // PF, PJ
    cpf_cnpj: text("cpf_cnpj"),
    nome: text("nome").notNull(),
    nome_fantasia: text("nome_fantasia"),
    email: text("email"),
    telefone: text("telefone"),
    forma_pagamento_preferencial: text("forma_pagamento_preferencial"),
    tipos: jsonb("tipos").$type<string[]>().default([]).notNull(),
    departamento_id: integer("departamento_id").references(() => departamentosTable.id),
    centro_custo_id: integer("centro_custo_id").references(() => centrosCustosTable.id),
    ativo: boolean("ativo").default(true).notNull(),
    bloqueado: boolean("bloqueado").default(false).notNull(),
    // Lifecycle status: "ativo" | "inativo"
    status: varchar("status", {length: 20}).default("ativo").notNull(),
    chaves_pix: jsonb("chaves_pix").$type<Array<{ tipo: string; chave: string }>>().default([]).notNull(),
    dados_bancarios: jsonb("dados_bancarios")
        .$type<Array<
            | { tipo: "PIX"; tipo_chave: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria"; chave: string }
            | { tipo: "TED"; banco_codigo: string; banco_nome: string; agencia: string; conta: string }
        >>()
        .default([])
        .notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("parceiros_cpf_cnpj_unique_idx").on(table.cpf_cnpj),
]);

export const insertParceiroSchema = createInsertSchema(parceirosTable).omit({
    id: true,
    created_at: true,
    updated_at: true
});
export type InsertParceiro = z.infer<typeof insertParceiroSchema>;
export type Parceiro = typeof parceirosTable.$inferSelect;
