import {Router} from "express";
import {db} from "@workspace/db";
import {kanbanCardsTable, kanbanComentariosTable, kanbanAnexosTable, kanbanHistoricoTable, usuariosTable} from "@workspace/db/schema";
import {eq, lt, lte, gte, and, desc, sql} from "drizzle-orm";
import {errorResponse, successResponse} from "../utils/response";

const router = Router();

const COLUNAS_VALIDAS = ["solicitado", "em_andamento", "revisao", "concluido", "cancelado"] as const;
const PRIORIDADES_VALIDAS = ["baixa", "media", "alta", "critica"] as const;

type Coluna = typeof COLUNAS_VALIDAS[number];
type Prioridade = typeof PRIORIDADES_VALIDAS[number];

router.get("/cards", async (req, res) => {
    try {
        const {prioridade, responsavel_id, prazo} = req.query;
        let conditions = [];

        if (prioridade && PRIORIDADES_VALIDAS.includes(prioridade as Prioridade)) {
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
                const limit = proximaSemana.toISOString().split("T")[0];
                conditions.push(and(gte(kanbanCardsTable.prazo, hoje), lte(kanbanCardsTable.prazo, limit)));
            }
        }

        const data = await db.select({
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
            responsavel: {
                id: usuariosTable.id,
                nome: usuariosTable.nome
            },
            comentarios_count: sql<number>`count(distinct ${kanbanComentariosTable.id})::int`,
            anexos_count: sql<number>`count(distinct ${kanbanAnexosTable.id})::int`
        })
        .from(kanbanCardsTable)
        .leftJoin(usuariosTable, eq(kanbanCardsTable.responsavel_id, usuariosTable.id))
        .leftJoin(kanbanComentariosTable, eq(kanbanCardsTable.id, kanbanComentariosTable.card_id))
        .leftJoin(kanbanAnexosTable, eq(kanbanCardsTable.id, kanbanAnexosTable.card_id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(kanbanCardsTable.id, usuariosTable.id)
        .orderBy(desc(kanbanCardsTable.created_at));

        // Formata o responsavel para undefined se for nulo (comportamento do leftJoin)
        const cards = data.map((card) => {
            const responsavel = card.responsavel?.id ? card.responsavel : null;
            return {
                ...card,
                responsavel
            };
        });

        return successResponse(res, cards);
    } catch (error) {
        console.error("Erro ao buscar cards:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar cards do kanban.");
    }
});

router.post("/cards", async (req, res) => {
    try {
        const titulo = typeof req.body?.titulo === "string" ? req.body.titulo.trim() : null;
        const descricao = typeof req.body?.descricao === "string" ? req.body.descricao.trim() : null;
        const prazo = typeof req.body?.prazo === "string" ? req.body.prazo : null;
        const rawPrioridade = typeof req.body?.prioridade === "string" ? req.body.prioridade : "media";
        const rawColuna = typeof req.body?.coluna === "string" ? req.body.coluna : "solicitado";
        const departamentos = Array.isArray(req.body?.departamentos) ? req.body.departamentos : [];
        const checklist = Array.isArray(req.body?.checklist) ? req.body.checklist : [];
        const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

        if (!titulo) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Título é obrigatório.");
        }

        const prioridade: Prioridade = PRIORIDADES_VALIDAS.includes(rawPrioridade as Prioridade)
            ? (rawPrioridade as Prioridade)
            : "media";

        const coluna: Coluna = COLUNAS_VALIDAS.includes(rawColuna as Coluna)
            ? (rawColuna as Coluna)
            : "solicitado";

        const [data] = await db
            .insert(kanbanCardsTable)
            .values({titulo, descricao, prioridade, coluna, prazo, departamentos, checklist, tags})
            .returning();

        await db
            .insert(kanbanHistoricoTable)
            .values({card_id: data.id, tipo: "criacao", descricao: `Tarefa "${titulo}" criada`});

        return successResponse(res, data, null, 201);
    } catch (error) {
        console.error("Erro ao criar card:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao criar card do kanban.");
    }
});

router.patch("/cards/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");
        }

        type KanbanUpdate = {
            titulo?: string;
            descricao?: string;
            prioridade?: Prioridade;
            coluna?: Coluna;
            prazo?: string | null;
            departamentos?: unknown[];
            checklist?: unknown[];
            tags?: unknown[];
        };

        const updates: KanbanUpdate = {};

        if (typeof req.body?.titulo === "string") updates.titulo = req.body.titulo.trim();
        if (typeof req.body?.descricao === "string") updates.descricao = req.body.descricao.trim();
        if (typeof req.body?.prazo === "string") updates.prazo = req.body.prazo;
        if (req.body?.prazo === null) updates.prazo = null;

        if (typeof req.body?.prioridade === "string" && PRIORIDADES_VALIDAS.includes(req.body.prioridade as Prioridade)) {
            updates.prioridade = req.body.prioridade as Prioridade;
        }
        if (typeof req.body?.coluna === "string" && COLUNAS_VALIDAS.includes(req.body.coluna as Coluna)) {
            updates.coluna = req.body.coluna as Coluna;
        }
        if (Array.isArray(req.body?.departamentos)) updates.departamentos = req.body.departamentos;
        if (Array.isArray(req.body?.checklist)) updates.checklist = req.body.checklist;
        if (Array.isArray(req.body?.tags)) updates.tags = req.body.tags;

        if (Object.keys(updates).length === 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Nenhum campo válido para atualizar.");
        }

        const [data] = await db
            .update(kanbanCardsTable)
            .set(updates)
            .where(eq(kanbanCardsTable.id, id))
            .returning();
            
        if (!data) {
            return errorResponse(res, 404, "NOT_FOUND", "Card não encontrado.");
        }

        if (updates.coluna) {
            await db.insert(kanbanHistoricoTable).values({
                card_id: id,
                tipo: "movimentacao",
                descricao: `Movido para ${updates.coluna}`,
                coluna_destino: updates.coluna,
            });
        }

        return successResponse(res, data);
    } catch (error) {
        console.error("Erro ao atualizar card:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao atualizar card do kanban.");
    }
});

router.get("/usuarios", async (_req, res) => {
    try {
        const data = await db.select({
            id: usuariosTable.id,
            nome: usuariosTable.nome,
            email: usuariosTable.email
        })
        .from(usuariosTable)
        .orderBy(usuariosTable.nome);

        return successResponse(res, data);
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao buscar usuários do kanban.");
    }
});

export default router;
