import {Router} from "express";
import {supabase} from "../lib/supabase";
import {errorResponse, successResponse} from "../utils/response";

const router = Router();

const COLUNAS_VALIDAS = ["solicitado", "em_andamento", "revisao", "concluido", "cancelado"] as const;
const PRIORIDADES_VALIDAS = ["baixa", "media", "alta", "critica"] as const;

type Coluna = typeof COLUNAS_VALIDAS[number];
type Prioridade = typeof PRIORIDADES_VALIDAS[number];

function isPermissionError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { code?: string; message?: string };
    return (
        e.code === "42501" ||
        e.code === "PGRST301" ||
        (typeof e.message === "string" &&
            (e.message.includes("permission denied") || e.message.includes("row-level security")))
    );
}

router.get("/cards", async (req, res) => {
    try {
        const {prioridade, responsavel_id, prazo} = req.query;

        let query = supabase
            .from("kanban_cards")
            .select(`
        *,
        responsavel:usuarios!responsavel_id(id, nome),
        comentarios:kanban_comentarios(count),
        anexos:kanban_anexos(count)
      `);

        if (prioridade && PRIORIDADES_VALIDAS.includes(prioridade as Prioridade)) {
            query = query.eq("prioridade", prioridade as string);
        }

        if (responsavel_id) {
            const rid = parseInt(String(responsavel_id), 10);
            if (!isNaN(rid)) query = query.eq("responsavel_id", rid);
        }

        if (prazo) {
            const hoje = new Date().toISOString().split("T")[0];
            if (prazo === "atrasado") {
                query = query.lt("prazo", hoje);
            } else if (prazo === "hoje") {
                query = query.eq("prazo", hoje);
            } else if (prazo === "proximos") {
                const proximaSemana = new Date();
                proximaSemana.setDate(proximaSemana.getDate() + 7);
                query = query
                    .lte("prazo", proximaSemana.toISOString().split("T")[0])
                    .gte("prazo", hoje);
            }
        }

        const {data, error} = await query.order("created_at", {ascending: false});
        if (error) throw error;

        const cards = data.map((card) => ({
            ...card,
            comentarios_count: card.comentarios?.[0]?.count ?? 0,
            anexos_count: card.anexos?.[0]?.count ?? 0,
            comentarios: undefined,
            anexos: undefined,
        }));

        return successResponse(res, cards);
    } catch (error) {
        if (isPermissionError(error)) {
            return errorResponse(res, 403, "FORBIDDEN", "Sem permissão para acessar os cards do kanban.");
        }
        console.error("Erro ao buscar cards:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar cards do kanban.");
    }
});

router.post("/cards", async (req, res) => {
    try {
        // Whitelist explícita — bloqueia mass assignment
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

        const {data, error} = await supabase
            .from("kanban_cards")
            .insert([{titulo, descricao, prioridade, coluna, prazo, departamentos, checklist, tags}])
            .select()
            .single();

        if (error) throw error;

        await supabase
            .from("kanban_historico")
            .insert([{card_id: data.id, tipo: "criacao", descricao: `Tarefa "${titulo}" criada`}]);

        return successResponse(res, data, null, 201);
    } catch (error) {
        if (isPermissionError(error)) {
            return errorResponse(res, 403, "FORBIDDEN", "Sem permissão para criar cards no kanban.");
        }
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

        // Whitelist explícita dos campos mutáveis
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

        if (typeof req.body?.prioridade === "string" && PRIORIDADES_VALIDAS.includes(req.body.prioridade)) {
            updates.prioridade = req.body.prioridade;
        }
        if (typeof req.body?.coluna === "string" && COLUNAS_VALIDAS.includes(req.body.coluna)) {
            updates.coluna = req.body.coluna;
        }
        if (Array.isArray(req.body?.departamentos)) updates.departamentos = req.body.departamentos;
        if (Array.isArray(req.body?.checklist)) updates.checklist = req.body.checklist;
        if (Array.isArray(req.body?.tags)) updates.tags = req.body.tags;

        if (Object.keys(updates).length === 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "Nenhum campo válido para atualizar.");
        }

        const {data, error} = await supabase
            .from("kanban_cards")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        if (updates.coluna) {
            await supabase.from("kanban_historico").insert([{
                card_id: id,
                tipo: "movimentacao",
                descricao: `Movido para ${updates.coluna}`,
                coluna_destino: updates.coluna,
            }]);
        }

        return successResponse(res, data);
    } catch (error) {
        if (isPermissionError(error)) {
            return errorResponse(res, 403, "FORBIDDEN", "Sem permissão para atualizar este card do kanban.");
        }
        console.error("Erro ao atualizar card:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao atualizar card do kanban.");
    }
});

router.get("/usuarios", async (_req, res) => {
    try {
        const {data, error} = await supabase
            .from("usuarios")
            .select("id, nome, email")
            .order("nome");

        if (error) throw error;
        return successResponse(res, data);
    } catch (error) {
        if (isPermissionError(error)) {
            return errorResponse(res, 403, "FORBIDDEN", "Sem permissão para acessar os usuários do kanban.");
        }
        console.error("Erro ao buscar usuários:", error);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao buscar usuários do kanban.");
    }
});

export default router;
