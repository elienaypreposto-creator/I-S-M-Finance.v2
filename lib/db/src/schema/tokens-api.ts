import {pgTable, serial, text, boolean, date, timestamp, integer} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {empresasTable} from "./empresas";
import {usuariosTable} from "./usuarios";

/**
 * Escopos válidos para tokens da API v1. Centralizado aqui para ser
 * reutilizado tanto no CRUD (validação na criação) quanto no
 * middleware withScope (checagem por rota).
 *
 * Ajuste/complete esta lista conforme os recursos reais expostos em
 * routes/v1.ts.
 */
export const ESCOPOS_V1_DISPONIVEIS = [
    "v1:lancamentos:ler",
    "v1:parceiros:ler",
    "v1:bancos:ler",
    "v1:filiais:ler",
    "v1:planoContas:ler",
] as const;

export type EscopoV1 = (typeof ESCOPOS_V1_DISPONIVEIS)[number];

export const tokensApiTable = pgTable("tokens_api", {
    id: serial("id").primaryKey(),

    // NOVO — Onda 2: cada token v1 passa a pertencer a UMA empresa.
    // O middleware v1AuthMiddleware expõe isso em req.tenant.empresaId.
    empresa_id: integer("empresa_id")
        .references(() => empresasTable.id)
        .notNull(),

    // NOVO — Onda 2: quem criou o token, para auditoria.
    criado_por_usuario_id: integer("criado_por_usuario_id")
        .references(() => usuariosTable.id),

    descricao: text("descricao").notNull(),
    token_hash: text("token_hash").notNull().unique(),
    token_preview: text("token_preview"),

    // NOVO — Onda 2: escopos explícitos.
    escopos: text("escopos").array().notNull(),

    // Onda 2: todo token tem prazo de validade.
    data_expiracao: date("data_expiracao").notNull(),

    // NOVO — Onda 2: rastreabilidade de uso.
    last_used_at: timestamp("last_used_at"),
    last_used_ip: text("last_used_ip"),

    ativo: boolean("ativo").default(true).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTokenApiSchema = createInsertSchema(tokensApiTable, {
    escopos: z.array(z.string()).min(1, "Informe ao menos um escopo."),
    data_expiracao: z
        .string()
        .refine(
            (v) => !Number.isNaN(Date.parse(v)),
            "data_expiracao inválida.",
        ),
}).omit({
    id: true,
    created_at: true,
    updated_at: true,
    token_hash: true,
    token_preview: true,
    last_used_at: true,
    last_used_ip: true,
});

export type InsertTokenApi = z.infer<typeof insertTokenApiSchema>;

export type TokenApi = typeof tokensApiTable.$inferSelect;