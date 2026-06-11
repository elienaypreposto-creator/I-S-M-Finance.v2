import {Router} from "express";
import {and, count, desc, eq, gte, lte} from "drizzle-orm";
import {db} from "@workspace/db";
import {logsAuditoriaTable, usuariosTable} from "@workspace/db/schema";
import {withPermission} from "../middlewares/withPermission";
import {errorResponse, successResponse} from "../utils/response";

const router = Router();

/**
 * GET /auditoria
 *
 * Retorna o histórico de ações de mutação registradas no sistema.
 * Requer permissão: admin:auditoria:listar
 *
 * Query params (todos opcionais):
 *   page - número da página (default 1)
 *   limit - itens por página (default 50, máx 100)
 *   usuario_id - filtra por usuário específico
 *   acao - filtra pelo HTTP method (POST, PUT, PATCH, DELETE)
 *   status_code - filtra pelo HTTP status de resposta
 *   data_inicio - filtra a partir desta data (ISO 8601, inclusive)
 *   data_fim - filtra até esta data (ISO 8601, inclusive, final do dia)
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

            const where = conditions.length > 0 ? and(...conditions) : undefined;

            const [[{total}], items] = await Promise.all([
                db
                    .select({total: count()})
                    .from(logsAuditoriaTable)
                    .where(where),

                db
                    .select({
                        id: logsAuditoriaTable.id,
                        usuario_id: logsAuditoriaTable.usuario_id,
                        usuario_nome: usuariosTable.nome,
                        acao: logsAuditoriaTable.acao,
                        recurso: logsAuditoriaTable.recurso,
                        ip: logsAuditoriaTable.ip,
                        detalhes: logsAuditoriaTable.detalhes,
                        status_code: logsAuditoriaTable.status_code,
                        created_at: logsAuditoriaTable.created_at,
                    })
                    .from(logsAuditoriaTable)
                    .leftJoin(usuariosTable, eq(logsAuditoriaTable.usuario_id, usuariosTable.id))
                    .where(where)
                    .orderBy(desc(logsAuditoriaTable.created_at))
                    .limit(limit)
                    .offset(offset),
            ]);

            return successResponse(res, items, {total: Number(total), page, limit});
        } catch (e) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar logs de auditoria.", String(e));
        }
    },
);

export default router;
