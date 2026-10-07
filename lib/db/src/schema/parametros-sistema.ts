import {integer, pgTable, primaryKey, text, timestamp} from "drizzle-orm/pg-core";
import {empresasTable} from "./empresas";

/**
 * Parâmetros do sistema por empresa (FEAT-06 + ISMF-13).
 * PK composta (empresa_id, chave).
 */
export const parametrosSistemaTable = pgTable("parametros_sistema", {
    empresa_id: integer("empresa_id").references(() => empresasTable.id).notNull(),
    chave: text("chave").notNull(),
    valor: text("valor").notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [primaryKey({columns: [table.empresa_id, table.chave], name: "parametros_sistema_pkey"})]);

export const PARAM_MOTIVO_IGNORAR_OBRIGATORIO = "motivo_ignorar_obrigatorio";

export const MOTIVOS_IGNORAR_PREDEFINIDOS = [
    "duplicado",
    "estorno_saida",
    "estorno_entrada",
    "servico_repetitivo",
    "transferencia_contas_proprias",
    "outro",
] as const;

export type MotivoIgnorarPredefinido = (typeof MOTIVOS_IGNORAR_PREDEFINIDOS)[number];
