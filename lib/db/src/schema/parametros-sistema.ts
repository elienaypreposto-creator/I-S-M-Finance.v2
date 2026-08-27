import {pgTable, text, timestamp, boolean} from "drizzle-orm/pg-core";

/**
 * Parâmetros globais do sistema (FEAT-06).
 * Linha singleton id implícito via chave.
 */
export const parametrosSistemaTable = pgTable("parametros_sistema", {
    chave: text("chave").primaryKey(),
    valor: text("valor").notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
});

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
