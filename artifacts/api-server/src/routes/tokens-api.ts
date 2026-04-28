import { Router } from "express";
import { db } from "@workspace/db";
import { tokensApiTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

router.get("/tokens-api", async (_req, res) => {
  try {
    const items = await db.select({
      id: tokensApiTable.id,
      descricao: tokensApiTable.descricao,
      token: tokensApiTable.token_preview,
      data_expiracao: tokensApiTable.data_expiracao,
      ativo: tokensApiTable.ativo,
      created_at: tokensApiTable.created_at,
    }).from(tokensApiTable).orderBy(tokensApiTable.created_at);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/tokens-api", async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const token_hash = crypto.createHash("sha256").update(token).digest("hex");
    const token_preview = `${token.slice(0, 8)}...${token.slice(-8)}`;
    const [item] = await db.insert(tokensApiTable).values({
      ...req.body,
      token_hash,
      token_preview,
      ativo: req.body.ativo !== false,
    }).returning({
      id: tokensApiTable.id,
      descricao: tokensApiTable.descricao,
      token: tokensApiTable.token_preview,
      data_expiracao: tokensApiTable.data_expiracao,
      ativo: tokensApiTable.ativo,
      created_at: tokensApiTable.created_at,
    });
    // Return the full token once (only time it's visible)
    return res.status(201).json({ ...item, token });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/tokens-api/:id", async (req, res) => {
  try {
    const [item] = await db.update(tokensApiTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(tokensApiTable.id, parseInt(req.params.id))).returning({
        id: tokensApiTable.id,
        descricao: tokensApiTable.descricao,
        token: tokensApiTable.token_preview,
        data_expiracao: tokensApiTable.data_expiracao,
        ativo: tokensApiTable.ativo,
        created_at: tokensApiTable.created_at,
      });
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.delete("/tokens-api/:id", async (req, res) => {
  try {
    await db.delete(tokensApiTable).where(eq(tokensApiTable.id, parseInt(req.params.id)));
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
