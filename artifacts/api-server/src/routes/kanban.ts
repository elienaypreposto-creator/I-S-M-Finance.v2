import { Router } from "express";
import { db } from "@workspace/db";
import { kanbanCardsTable, kanbanComentariosTable, kanbanAnexosTable, kanbanHistoricoTable, usuariosTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/kanban/cards", async (req, res) => {
  try {
    const { prioridade, responsavel_id, prazo } = req.query;

    let conditions: any[] = [];
    if (prioridade) conditions.push(eq(kanbanCardsTable.prioridade, String(prioridade)));
    if (responsavel_id) conditions.push(eq(kanbanCardsTable.responsavel_id, parseInt(String(responsavel_id))));
    if (prazo) {
      const hoje = new Date().toISOString().split('T')[0];
      if (prazo === "atrasado") {
        conditions.push(eq(kanbanCardsTable.prazo, hoje));
      } else if (prazo === "proximos") {
        const proximaSemana = new Date();
        proximaSemana.setDate(proximaSemana.getDate() + 7);
        conditions.push(eq(kanbanCardsTable.prazo, proximaSemana.toISOString().split('T')[0]));
      }
    }

    const cards = await db
      .select({
        id: kanbanCardsTable.id,
        titulo: kanbanCardsTable.titulo,
        descricao: kanbanCardsTable.descricao,
        coluna: kanbanCardsTable.coluna,
        responsavel_id: kanbanCardsTable.responsavel_id,
        responsavel_nome: usuariosTable.nome,
        responsaveis_multiplos: kanbanCardsTable.responsaveis_multiplos,
        responsaveis_nomes: usuariosTable.nome,
        departamentos: kanbanCardsTable.departamentos,
        tags: kanbanCardsTable.tags,
        checklist: kanbanCardsTable.checklist,
        comentarios_count: kanbanCardsTable.comentarios_count,
        anexos_count: kanbanCardsTable.anexos_count,
        prazo: kanbanCardsTable.prazo,
        prioridade: kanbanCardsTable.prioridade,
        created_by: kanbanCardsTable.created_by,
        created_at: kanbanCardsTable.created_at,
      })
      .from(kanbanCardsTable)
      .leftJoin(usuariosTable, eq(kanbanCardsTable.responsavel_id, usuariosTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(kanbanCardsTable.prioridade, kanbanCardsTable.prazo);

    return res.json(cards);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/kanban/cards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [card] = await db.select({
      id: kanbanCardsTable.id,
      titulo: kanbanCardsTable.titulo,
      descricao: kanbanCardsTable.descricao,
      coluna: kanbanCardsTable.coluna,
      responsavel_id: kanbanCardsTable.responsavel_id,
      responsavel_nome: usuariosTable.nome,
      responsaveis_multiplos: kanbanCardsTable.responsaveis_multiplos,
      departamentos: kanbanCardsTable.departamentos,
      tags: kanbanCardsTable.tags,
      checklist: kanbanCardsTable.checklist,
      comentarios_count: kanbanCardsTable.comentarios_count,
      anexos_count: kanbanCardsTable.anexos_count,
      prazo: kanbanCardsTable.prazo,
      prioridade: kanbanCardsTable.prioridade,
      created_by: kanbanCardsTable.created_by,
      created_at: kanbanCardsTable.created_at,
    })
      .from(kanbanCardsTable)
      .leftJoin(usuariosTable, eq(kanbanCardsTable.responsavel_id, usuariosTable.id))
      .where(eq(kanbanCardsTable.id, id));

    if (!card) return res.status(404).json({ error: "Not found" });

    const comentarios = await db.select().from(kanbanComentariosTable)
      .where(eq(kanbanComentariosTable.card_id, id))
      .orderBy(kanbanComentariosTable.created_at);

    const historico = await db.select().from(kanbanHistoricoTable)
      .where(eq(kanbanHistoricoTable.card_id, id))
      .orderBy(kanbanHistoricoTable.created_at);

    return res.json({ ...card, comentarios, historico });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/kanban/cards", async (req, res) => {
  try {
    const { coluna, ...cardData } = req.body;
    console.log("POST /api/kanban/cards - Request Body:", req.body);
    
    // Sanitizar prazo se for string vazia
    if (cardData.prazo === "") cardData.prazo = null;

    const [card] = await db.insert(kanbanCardsTable).values({
      ...cardData,
      coluna: coluna || "solicitado",
    }).returning();

    console.log("POST /api/kanban/cards - Created Card:", card);

    await db.insert(kanbanHistoricoTable).values({
      card_id: card.id,
      coluna_nova: coluna || "solicitado",
      comentario: "Card criado",
    });

    return res.status(201).json(card);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/kanban/cards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { comentario, ...updateData } = req.body;

    const [current] = await db.select().from(kanbanCardsTable).where(eq(kanbanCardsTable.id, id));
    if (!current) return res.status(404).json({ error: "Not found" });

    const [card] = await db.update(kanbanCardsTable).set({ ...updateData, updated_at: new Date() })
      .where(eq(kanbanCardsTable.id, id)).returning();

if (updateData.coluna && updateData.coluna !== current.coluna) {
      await db.insert(kanbanHistoricoTable).values({
        card_id: id,
        coluna_anterior: current.coluna,
        coluna_nova: updateData.coluna,
        comentario: comentario || `Movido para ${updateData.coluna}`,
      });
    } else if (comentario) {
      await db.insert(kanbanHistoricoTable).values({
        card_id: id,
        comentario,
      });
    }

    return res.json(card);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.patch("/kanban/cards/:id/mover", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { coluna } = req.body;

    const [current] = await db.select().from(kanbanCardsTable).where(eq(kanbanCardsTable.id, id));
    if (!current) return res.status(404).json({ error: "Not found" });

    const [card] = await db.update(kanbanCardsTable).set({ coluna, updated_at: new Date() })
      .where(eq(kanbanCardsTable.id, id)).returning();

    await db.insert(kanbanHistoricoTable).values({
      card_id: id,
      coluna_anterior: current.coluna,
      coluna_nova: coluna,
      comentario: `Movido para ${coluna}`,
    });

    return res.json(card);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/kanban/cards/:id/comentarios", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { usuario_id, comentario } = req.body;

    const [novoComentario] = await db.insert(kanbanComentariosTable).values({
      card_id: id,
      usuario_id,
      comentario,
    }).returning();

    const [card] = await db.select().from(kanbanCardsTable).where(eq(kanbanCardsTable.id, id));
    const novoCount = (card?.comentarios_count || 0) + 1;
    
    await db.update(kanbanCardsTable).set({ comentarios_count: novoCount })
      .where(eq(kanbanCardsTable.id, id));

    return res.status(201).json(novoComentario);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/kanban/cards/:id/comentarios", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const comentarios = await db.select().from(kanbanComentariosTable)
      .where(eq(kanbanComentariosTable.card_id, id))
      .orderBy(kanbanComentariosTable.created_at);
    return res.json(comentarios);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/kanban/usuarios", async (_req, res) => {
  try {
    const usuarios = await db.select({
      id: usuariosTable.id,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      avatar: usuariosTable.avatar,
    }).from(usuariosTable);
    return res.json(usuarios);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/kanban/cards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(kanbanComentariosTable).where(eq(kanbanComentariosTable.card_id, id));
    await db.delete(kanbanAnexosTable).where(eq(kanbanAnexosTable.card_id, id));
    await db.delete(kanbanHistoricoTable).where(eq(kanbanHistoricoTable.card_id, id));
    await db.delete(kanbanCardsTable).where(eq(kanbanCardsTable.id, id));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;