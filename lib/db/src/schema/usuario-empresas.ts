import {pgTable, serial, text, boolean, timestamp, integer, unique} from "drizzle-orm/pg-core";
import {createInsertSchema} from "drizzle-zod";
import {z} from "zod/v4";
import {usuariosTable} from "./usuarios";
import {empresasTable} from "./empresas";

export const PAPEL_USUARIO_EMPRESA = ["admin", "membro"] as const;
export type PapelUsuarioEmpresa = (typeof PAPEL_USUARIO_EMPRESA)[number];

export const usuarioEmpresasTable = pgTable(
    "usuario_empresas",
    {
        id: serial("id").primaryKey(),
        usuario_id: integer("usuario_id")
            .references(() => usuariosTable.id, {onDelete: "cascade"})
            .notNull(),
        empresa_id: integer("empresa_id")
            .references(() => empresasTable.id)
            .notNull(),
        papel: text("papel").$type<PapelUsuarioEmpresa>().notNull(),
        ativo: boolean("ativo").default(true).notNull(),
        created_at: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [unique("usuario_empresas_usuario_id_empresa_id_unique").on(table.usuario_id, table.empresa_id)],
);

export const insertUsuarioEmpresaSchema = createInsertSchema(usuarioEmpresasTable).omit({
    id: true,
    created_at: true,
});
export type InsertUsuarioEmpresa = z.infer<typeof insertUsuarioEmpresaSchema>;
export type UsuarioEmpresa = typeof usuarioEmpresasTable.$inferSelect;
