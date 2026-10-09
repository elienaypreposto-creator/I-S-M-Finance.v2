import {sql} from "drizzle-orm";
import {boolean, check, pgTable, serial, text, timestamp} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";

export const empresasTable = pgTable("empresas", {
    id: serial("id").primaryKey(),
    razao_social: text("razao_social").notNull(),
    nome_fantasia: text("nome_fantasia"),
    cnpj: text("cnpj").unique(),
    slug: text("slug").notNull().unique(),
    ativa: boolean("ativa").default(true).notNull(),
    /** Nome de quem aceitou o DPA em nome do controlador. Sem isto a empresa não entra ativa. */
    dpa_representante: text("dpa_representante"),
    dpa_assinado_em: timestamp("dpa_assinado_em"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
    check(
        "empresas_ativa_exige_dpa",
        sql`${table.ativa} = false OR ${table.dpa_assinado_em} IS NOT NULL`,
    ),
]);

export const insertEmpresaSchema = createInsertSchema(empresasTable).omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type Empresa = typeof empresasTable.$inferSelect;
