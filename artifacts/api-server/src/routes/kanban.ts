import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
    kanbanAnexosTable,
    kanbanCardsTable,
    kanbanComentariosTable,
    kanbanHistoricoTable,
    usuariosTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { validateBody } from "../middlewares/validate";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

const COLUNAS_VALIDAS = [
    "solicitado",
    "em_analise",
    "em_execucao",
    "aguardando_aprovacao",
    "concluido",
] as const;

const PRIORIDADES_VALIDAS = [
    "baixa",
    "media",
    "alta",
    "urgente",
] as const;

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const createCardBodySchema = z.object({
    titulo: z.string().trim().min(1, "Título é obrigatório."),
    descricao: z.string().trim().optional(),
    prioridade: z.enum(PRIORIDADES_VALIDAS).default("media"),
    coluna: z.enum(COLUNAS_VALIDAS).default("solicitado"),
    prazo: z.string().trim().min(1).nullable().optional(),
    departamentos: z.array(z.any()).default([]),
    checklist: z.array(z.any()).default([]),
    tags: z.array(z.any()).default([]),
});

const patchCardBodySchema = z.object({
    titulo: z.string().trim().min(1).optional(),
    descricao: z.string().trim().optional(),
    prioridade: z.enum(PRIORIDADES_VALIDAS).optional(),
    coluna: z.enum(COLUNAS_VALIDAS).optional(),
    prazo: z.string().trim().min(1).nullable().optional(),
    departamentos: z.array(z.any()).optional(),
    checklist: z.array(z.any()).optional(),
    tags: z.array(z.any()).optional(),
});

type CreateCardBody = z.infer<typeof createCardBodySchema>;
type PatchCardBody = z.infer<typeof patchCardBodySchema>;

router.get("/cards", async (req, res) => {
    try {
        const { prioridade, responsavel_id, prazo } = req.query;
        const conditions = [];

        if (prioridade && PRIORIDADES_VALIDAS.includes(prioridade as (typeof PRIORIDADES_VALIDAS)[number])) {
            conditions.push(eq(kanbanCardsTable.prioridade, prioridade as string));
        }
        if (responsavel_id) {
            const rid = parseInt(String(responsavel_id), 10);
            if (!isNaN(rid)) conditions.push(eq(kanbanCardsTable.responsavel_id, rid));
        }
        if (prazo) {
            const hoje = new Date().toISOString().split("T")[0];
            if (prazo === "atrasado") {
                conditions.push(lt(kanbanCardsTable.prazo, hoje));
            } else if (prazo === "hoje") {
                conditions.push(eq(kanbanCardsTable.prazo, hoje));
            } else if (prazo === "proximos") {
                const proximaSemana = new Date();
                proximaSemana.setDate(proximaSemana.getDate() + 7);
                conditions.push(and(gte(kanbanCardsTable.prazo, hoje), lte(kanbanCardsTable.prazo, proximaSemana.toISOString().split("T")[0])));
            }
        }

        const data = await db
            .select({
                id: kanbanCardsTable.id,
                titulo: kanbanCardsTable.titulo,
                descricao: kanbanCardsTable.descricao,
                prioridade: kanbanCardsTable.prioridade,
                coluna: kanbanCardsTable.coluna,
                prazo: kanbanCardsTable.prazo,
                departamentos: kanbanCardsTable.departamentos,
                checklist: kanbanCardsTable.checklist,
                tags: kanbanCardsTable.tags,
                responsavel_id: kanbanCardsTable.responsavel_id,
                created_at: kanbanCardsTable.created_at,
                updated_at: kanbanCardsTable.updated_at,
                responsavel: { id: usuariosTable.id, nome: usuariosTable.nome },
                comentarios_count: sql<number>`count(distinct
                ${kanbanComentariosTable.id}
                )
                :
                :
                int`,
                anexos_count: sql<number>`count(distinct
                ${kanbanAnexosTable.id}
                )
                :
                :
                int`,
            })
            .from(kanbanCardsTable)
            .leftJoin(usuariosTable, eq(kanbanCardsTable.responsavel_id, usuariosTable.id))
            .leftJoin(kanbanComentariosTable, eq(kanbanCardsTable.id, kanbanComentariosTable.card_id))
            .leftJoin(kanbanAnexosTable, eq(kanbanCardsTable.id, kanbanAnexosTable.card_id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(kanbanCardsTable.id, usuariosTable.id)
            .orderBy(desc(kanbanCardsTable.created_at));

        const cards = data.map((card) => ({
            ...card,
            responsavel: card.responsavel?.id ? card.responsavel : null,
        }));

        return successResponse(res, cards);
    } catch (error) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar cards do kanban.");
    }
});

router.post(
    "/cards",
    validateBody(createCardBodySchema),
    async (req, res) => {
        try {
            const { titulo, descricao, prioridade, coluna, prazo, departamentos, checklist, tags } =
                req.body as CreateCardBody;

            const card = await db.transaction(async (tx) => {
                const [inserted] = await tx
                    .insert(kanbanCardsTable)
                    .values({ titulo, descricao, prioridade, coluna, prazo, departamentos, checklist, tags })
                    .returning();

                await tx
                    .insert(kanbanHistoricoTable)
                    .values({ card_id: inserted.id, comentario: `Tarefa "${titulo}" criada` });

                return inserted;
            });

            return successResponse(res, card, null, 201);
        } catch (error) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao criar card do kanban.");
        }
    },
);

router.patch(
    "/cards/:id",
    validateBody(patchCardBodySchema),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");
            }

            const updates = req.body as PatchCardBody;

            // Zod strips unknown keys; se todos os campos do body eram inválidos/ausentes,
            // o objeto chega vazio — não há nada a persistir.
            if (Object.keys(updates).length === 0) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "Nenhum campo válido para atualizar.");
            }

            const card = await db.transaction(async (tx) => {
                const [updated] = await tx
                    .update(kanbanCardsTable)
                    .set(updates)
                    .where(eq(kanbanCardsTable.id, id))
                    .returning();

                if (!updated) return null;

                if (updates.coluna) {
                    await tx.insert(kanbanHistoricoTable).values({
                        card_id: id,
                        coluna_anterior: card.coluna,
                        coluna_nova: updates.coluna,
                        comentario: `Movido para ${updates.coluna}`,
                    });
                }

                return updated;
            });

            if (!card) {
                return errorResponse(res, 404, "NOT_FOUND", "Card não encontrado.");
            }

            return successResponse(res, card);
        } catch (error) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao atualizar card do kanban.");
        }
    },
);

router.get("/usuarios", async (_req, res) => {
    try {
        const data = await db
            .select({ id: usuariosTable.id, nome: usuariosTable.nome, email: usuariosTable.email })
            .from(usuariosTable)
            .orderBy(usuariosTable.nome);
        return successResponse(res, data);
    } catch (error) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao buscar usuários do kanban.");
    }
});

export default router;
