import {pgTable, serial, text, boolean, timestamp, integer, unique, index} from "drizzle-orm/pg-core";
import {usuariosTable} from "./usuarios";
import {empresasTable} from "./empresas";

/** Provedores de identidade externos aceitos. Hoje só o GovADM. */
export const PROVEDORES_IDENTIDADE_EXTERNA = ["govadm"] as const;
export type ProvedorIdentidadeExterna = (typeof PROVEDORES_IDENTIDADE_EXTERNA)[number];

/**
 * Vínculo entre um usuário do ISM e a identidade dele num sistema externo (login vindo do GovADM).
 *
 * Tabela GLOBAL, como `usuarios`: sem empresa_id e sem RLS. O acesso é controlado
 * pelas rotas (permissão de edição de usuário + vínculo do alvo com a empresa da sessão).
 *
 * - `emissor` identifica a instalação do GovADM (o mesmo idUsuario pode existir em duas).
 * - `sujeito_externo` é o idUsuario do GovADM, sempre como texto.
 * - `empresa_id_padrao` (opcional) escolhe a empresa da sessão quando o usuário tem várias;
 *   ON DELETE SET NULL para não travar a eliminação de empresa (LGPD).
 */
export const usuarioIdentidadesExternasTable = pgTable(
    "usuario_identidades_externas",
    {
        id: serial("id").primaryKey(),
        provedor: text("provedor").$type<ProvedorIdentidadeExterna>().notNull(),
        emissor: text("emissor").notNull(),
        sujeito_externo: text("sujeito_externo").notNull(),
        usuario_id: integer("usuario_id")
            .references(() => usuariosTable.id, {onDelete: "cascade"})
            .notNull(),
        empresa_id_padrao: integer("empresa_id_padrao").references(() => empresasTable.id, {onDelete: "set null"}),
        ativo: boolean("ativo").default(true).notNull(),
        criado_por: integer("criado_por").references(() => usuariosTable.id, {onDelete: "set null"}),
        created_at: timestamp("created_at").defaultNow().notNull(),
        ultimo_uso_em: timestamp("ultimo_uso_em"),
    },
    (table) => [
        unique("usuario_identidades_externas_provedor_emissor_sujeito_unique").on(
            table.provedor,
            table.emissor,
            table.sujeito_externo,
        ),
        unique("usuario_identidades_externas_provedor_emissor_usuario_unique").on(
            table.provedor,
            table.emissor,
            table.usuario_id,
        ),
        index("usuario_identidades_externas_usuario_id_idx").on(table.usuario_id),
    ],
);

export type UsuarioIdentidadeExterna = typeof usuarioIdentidadesExternasTable.$inferSelect;
export type InsertUsuarioIdentidadeExterna = typeof usuarioIdentidadesExternasTable.$inferInsert;
