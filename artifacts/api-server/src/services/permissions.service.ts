/**
 * Permissões que entram no token para (usuário, empresa ativa).
 *
 * Extraído de routes/auth.ts (ISMF-16) para ser testável sem carregar o
 * router de auth. Só as linhas de `usuario_permissoes` DA empresa ativa
 * entram; trocar de empresa remonta a lista do zero. Superadmin global
 * recebe o catálogo completo (não depende de linhas por tenant) para o
 * frontend não esconder menus ao trocar de empresa. Admin de empresa soma
 * `ADMIN_USUARIOS_AUTOMATICAS` daquela empresa, sem gravar curinga.
 */
import {and, eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {permissoesTable, usuarioEmpresasTable} from "@workspace/db/schema";
import {ADMIN_USUARIOS_AUTOMATICAS, PERMISSOES_ADMIN} from "../constants/permissoes";

export async function fetchPermissions(
    usuarioId: number,
    empresaId: number,
    superadmin = false,
): Promise<string[]> {
    if (superadmin) {
        return [...PERMISSOES_ADMIN];
    }

    const [rows, vinculo] = await Promise.all([
        db
            .select({codigo_permissao: permissoesTable.codigo_permissao})
            .from(permissoesTable)
            .where(and(eq(permissoesTable.usuario_id, usuarioId), eq(permissoesTable.empresa_id, empresaId))),
        db
            .select({papel: usuarioEmpresasTable.papel})
            .from(usuarioEmpresasTable)
            .where(and(eq(usuarioEmpresasTable.usuario_id, usuarioId), eq(usuarioEmpresasTable.empresa_id, empresaId)))
            .limit(1),
    ]);

    const permissoes = rows.map((r) => r.codigo_permissao);
    if (vinculo[0]?.papel === "admin") {
        for (const codigo of ADMIN_USUARIOS_AUTOMATICAS) {
            if (!permissoes.includes(codigo)) permissoes.push(codigo);
        }
    }
    return permissoes;
}
