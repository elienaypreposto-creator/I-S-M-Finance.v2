import {Router} from "express";
import {and, count, desc, eq, gte, lte, type SQL} from "drizzle-orm";
import {db, resolveSystemAdminEmails, withBypassRls, type TenantDb} from "@workspace/db";
import {logsAuditoriaTable, usuariosTable} from "@workspace/db/schema";
import {withPermission} from "../middlewares/withPermission";
import {errorResponse, successResponse} from "../utils/response";
import {requireTenant, tenantWhere} from "../lib/tenant-scope";

const router = Router();

const AUDITORIA_COLS = {
    id: logsAuditoriaTable.id,
    empresa_id: logsAuditoriaTable.empresa_id,
    usuario_id: logsAuditoriaTable.usuario_id,
    usuario_nome: usuariosTable.nome,
    acao: logsAuditoriaTable.acao,
    recurso: logsAuditoriaTable.recurso,
    ip: logsAuditoriaTable.ip,
    detalhes: logsAuditoriaTable.detalhes,
    status_code: logsAuditoriaTable.status_code,
    request_id: logsAuditoriaTable.request_id,
    user_agent: logsAuditoriaTable.user_agent,
    token_api_id: logsAuditoriaTable.token_api_id,
    duracao_ms: logsAuditoriaTable.duracao_ms,
    created_at: logsAuditoriaTable.created_at,
} as const;

function isSystemAdmin(email: string | undefined): boolean {
    if (!email) return false;
    return resolveSystemAdminEmails().includes(email.toLowerCase());
}

/**
 * Histórico da empresa ativa (withTenant + RLS). Superadmin pode passar
 * todas_empresas=1 para consultar qualquer tenant (pool ism_admin / BYPASSRLS).
 */
router.get(
    "/auditoria",
    withPermission("admin:auditoria:listar"),
    async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
            const offset = (page - 1) * limit;

            const conditions = [];

            if (req.query.usuario_id) {
                const uid = parseInt(req.query.usuario_id as string, 10);
                if (!isNaN(uid)) conditions.push(eq(logsAuditoriaTable.usuario_id, uid));
            }

            if (req.query.acao) {
                conditions.push(eq(logsAuditoriaTable.acao, (req.query.acao as string).toUpperCase()));
            }

            if (req.query.status_code) {
                const sc = parseInt(req.query.status_code as string, 10);
                if (!isNaN(sc)) conditions.push(eq(logsAuditoriaTable.status_code, sc));
            }

            if (req.query.data_inicio) {
                const d = new Date(req.query.data_inicio as string);
                if (!isNaN(d.getTime())) conditions.push(gte(logsAuditoriaTable.created_at, d));
            }

            if (req.query.data_fim) {
                const d = new Date(req.query.data_fim as string);
                if (!isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999);
                    conditions.push(lte(logsAuditoriaTable.created_at, d));
                }
            }

            const crossTenant =
                (req.query.todas_empresas === "1" || req.query.todas_empresas === "true") &&
                isSystemAdmin(req.user?.email);

            const runQuery = async (client: typeof db, where: SQL | undefined) => {
                const [[{total}], items] = await Promise.all([
                    client.select({total: count()}).from(logsAuditoriaTable).where(where),
                    client
                        .select(AUDITORIA_COLS)
                        .from(logsAuditoriaTable)
                        .leftJoin(usuariosTable, eq(logsAuditoriaTable.usuario_id, usuariosTable.id))
                        .where(where)
                        .orderBy(desc(logsAuditoriaTable.created_at))
                        .limit(limit)
                        .offset(offset),
                ]);
                return {total: Number(total), items};
            };

            if (crossTenant) {
                const where = conditions.length ? and(...conditions) : undefined;
                const result = await withBypassRls((tx: TenantDb) => runQuery(tx, where));
                return successResponse(res, result.items, {total: result.total, page, limit, todas_empresas: true});
            }

            const {empresaId} = requireTenant(req);
            const where = tenantWhere(logsAuditoriaTable, empresaId, ...conditions);
            const result = await runQuery(db, where);
            return successResponse(res, result.items, {total: result.total, page, limit});
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar logs de auditoria.", e);
        }
    },
);

export default router;
