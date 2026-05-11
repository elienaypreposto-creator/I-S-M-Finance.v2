import { Router } from "express";
import { supabase } from "../lib/supabase";
import { errorResponse, successResponse } from "../utils/response";

const router = Router();

// GET /api/kanban/cards
router.get("/cards", async (req, res) => {
  try {
    const { prioridade, responsavel_id, prazo } = req.query;
    
    let query = supabase
      .from("kanban_cards")
      .select(`
        *,
        responsavel:usuarios!responsavel_id(id, nome),
        comentarios:kanban_comentarios(count),
        anexos:kanban_anexos(count)
      `);

    if (prioridade) query = query.eq("prioridade", String(prioridade));
    if (responsavel_id) query = query.eq("responsavel_id", parseInt(String(responsavel_id)));
    
    if (prazo) {
      const hoje = new Date().toISOString().split('T')[0];
      if (prazo === "atrasado") {
        query = query.lt("prazo", hoje);
      } else if (prazo === "hoje") {
        query = query.eq("prazo", hoje);
      } else if (prazo === "proximos") {
        const proximaSemana = new Date();
        proximaSemana.setDate(proximaSemana.getDate() + 7);
        query = query.lte("prazo", proximaSemana.toISOString().split('T')[0]).gte("prazo", hoje);
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;

    // Transform data to match frontend expectation (nesting count)
    const cards = data.map(card => ({
      ...card,
      comentarios_count: card.comentarios?.[0]?.count || 0,
      anexos_count: card.anexos?.[0]?.count || 0,
      comentarios: undefined,
      anexos: undefined
    }));

    return successResponse(res, cards);
  } catch (error) {
    console.error("Erro ao buscar cards:", error);
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao buscar cards do kanban.");
  }
});

// POST /api/kanban/cards
router.post("/cards", async (req, res) => {
  try {
    const { titulo, descricao, prioridade, coluna, prazo, departamentos, checklist, tags } = req.body;

    if (!titulo) {
      return errorResponse(res, 400, "VALIDATION_ERROR", "Título é obrigatório.");
    }

    const { data, error } = await supabase
      .from("kanban_cards")
      .insert([{
        titulo,
        descricao,
        prioridade: prioridade || "media",
        coluna: coluna || "solicitado",
        prazo: prazo || null,
        departamentos: departamentos || [],
        checklist: checklist || [],
        tags: tags || [],
        comentarios_count: 0,
        anexos_count: 0
      }])
      .select()
      .single();

    if (error) throw error;

    // Criar histórico
    await supabase
      .from("kanban_historico")
      .insert([{
        card_id: data.id,
        tipo: "criacao",
        descricao: `Tarefa "${titulo}" criada`,
      }]);

    return successResponse(res, data, null, 201);
  } catch (error) {
    console.error("Erro ao criar card:", error);
    
    // Log do erro no banco via Supabase (mesmo se o log falhar, retornamos o erro original)
    try {
      await supabase.from("logs_sistema").insert([{
        servico: "api-kanban",
        mensagem: "Erro ao criar card",
        detalhes: JSON.stringify({ body: req.body })
      }]);
    } catch (logErr) {
      console.error("Falha ao salvar log:", logErr);
    }
    
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao criar card do kanban.");
  }
});

// PATCH /api/kanban/cards/:id
router.patch("/cards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from("kanban_cards")
      .update(updates)
      .eq("id", parseInt(id))
      .select()
      .single();

    if (error) throw error;

    // Se a coluna mudou, registrar no histórico
    if (updates.coluna) {
      await supabase
        .from("kanban_historico")
        .insert([{
          card_id: parseInt(id),
          tipo: "movimentacao",
          descricao: `Movido para ${updates.coluna}`,
          coluna_destino: updates.coluna
        }]);
    }

    return successResponse(res, data);
  } catch (error) {
    console.error("Erro ao atualizar card:", error);
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao atualizar card do kanban.");
  }
});

// GET /api/kanban/usuarios
router.get("/usuarios", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome, email")
      .order("nome");

    if (error) throw error;
    return successResponse(res, data);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno ao buscar usuários do kanban.");
  }
});

export default router;