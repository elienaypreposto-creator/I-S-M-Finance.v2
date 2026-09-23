import {and, eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {empresasTable, usuarioEmpresasTable} from "@workspace/db/schema";
import {AppError} from "../utils/app-error";

export type EmpresaVinculo = {
    id: number;
    razao_social: string;
    nome_fantasia: string | null;
    slug: string;
    papel: string;
};

export async function listEmpresasAtivasDoUsuario(usuarioId: number): Promise<EmpresaVinculo[]> {
    const rows = await db
        .select({
            id: empresasTable.id,
            razao_social: empresasTable.razao_social,
            nome_fantasia: empresasTable.nome_fantasia,
            slug: empresasTable.slug,
            papel: usuarioEmpresasTable.papel,
        })
        .from(usuarioEmpresasTable)
        .innerJoin(empresasTable, eq(usuarioEmpresasTable.empresa_id, empresasTable.id))
        .where(
            and(
                eq(usuarioEmpresasTable.usuario_id, usuarioId),
                eq(usuarioEmpresasTable.ativo, true),
                eq(empresasTable.ativa, true),
            ),
        )
        .orderBy(empresasTable.razao_social);

    return rows;
}

export async function assertVinculoAtivo(usuarioId: number, empresaId: number): Promise<EmpresaVinculo> {
    const [row] = await db
        .select({
            id: empresasTable.id,
            razao_social: empresasTable.razao_social,
            nome_fantasia: empresasTable.nome_fantasia,
            slug: empresasTable.slug,
            papel: usuarioEmpresasTable.papel,
        })
        .from(usuarioEmpresasTable)
        .innerJoin(empresasTable, eq(usuarioEmpresasTable.empresa_id, empresasTable.id))
        .where(
            and(
                eq(usuarioEmpresasTable.usuario_id, usuarioId),
                eq(usuarioEmpresasTable.empresa_id, empresaId),
                eq(usuarioEmpresasTable.ativo, true),
                eq(empresasTable.ativa, true),
            ),
        )
        .limit(1);

    if (!row) {
        throw new AppError(403, "EMPRESA_NAO_VINCULADA", "Vínculo com a empresa inexistente ou inativo.");
    }
    return row;
}
