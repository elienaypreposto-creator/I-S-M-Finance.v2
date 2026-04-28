import { Router } from "express";
import { db } from "@workspace/db";
import { kanbanCardsTable, kanbanHistoricoTable, usuariosTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/kanban/cards", async (_req, res) => {
  try {
    const cards = await db
      .select({
        id: kanbanCardsTable.id,
        titulo: kanbanCardsTable.titulo,
        descricao: kanbanCardsTable.descricao,
        coluna: kanbanCardsTable.coluna,
        responsavel_id: kanbanCardsTable.responsavel_id,
        responsavel_nome: usuariosTable.nome,
        prazo: kanbanCardsTable.prazo,
        prioridade: kanbanCardsTable.prioridade,
        criado_por: kanbanCardsTable.criado_por,
        created_at: kanbanCardsTable.created_at,
      })
      .from(kanbanCardsTable)
      .leftJoin(usuariosTable, eq(kanbanCardsTable.responsavel_id, usuariosTable.id))
      .orderBy(kanbanCardsTable.created_at);

    const cardsWithHistory = await Promise.all(cards.map(async (card) => {
      const historico = await db.select().from(kanbanHistoricoTable)
        .where(eq(kanbanHistoricoTable.card_id, card.id))
        .orderBy(kanbanHistoricoTable.created_at);
      return { ...card, historico };
    }));

    return res.json(cardsWithHistory);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/kanban/cards", async (req, res) => {
  try {
    const [card] = await db.insert(kanbanCardsTable).values({
      ...req.body,
      coluna: "solicitado",
    }).returning();

    await db.insert(kanbanHistoricoTable).values({
      card_id: card.id,
      coluna_nova: "solicitado",
      comentario: "Card criado",
    });

    return res.status(201).json({ ...card, historico: [] });
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

    const historico = await db.select().from(kanbanHistoricoTable)
      .where(eq(kanbanHistoricoTable.card_id, id))
      .orderBy(kanbanHistoricoTable.created_at);

    return res.json({ ...card, historico });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/kanban/cards/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(kanbanHistoricoTable).where(eq(kanbanHistoricoTable.card_id, id));
    await db.delete(kanbanCardsTable).where(eq(kanbanCardsTable.id, id));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
