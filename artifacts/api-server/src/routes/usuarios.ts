import { Router } from "express";
import { db } from "@workspace/db";
import { usuariosTable, permissoesTable } from "@workspace/db/schema";
import { eq, ilike, and, count } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

router.get("/usuarios", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (req.query.search) conditions.push(ilike(usuariosTable.nome, `%${req.query.search}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(usuariosTable).where(where);
    const items = await db.select({
      id: usuariosTable.id,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      telefone: usuariosTable.telefone,
      celular: usuariosTable.celular,
      bloqueado: usuariosTable.bloqueado,
      ultimo_acesso: usuariosTable.ultimo_acesso,
      created_at: usuariosTable.created_at,
    }).from(usuariosTable).where(where).limit(limit).offset(offset).orderBy(usuariosTable.nome);

    return res.json({ data: items, total: totalResult.count, page, limit });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.post("/usuarios", async (req, res) => {
  try {
    const { senha, ...rest } = req.body;
    const senha_hash = crypto.createHash("sha256").update(senha).digest("hex");
    const [item] = await db.insert(usuariosTable).values({ ...rest, senha_hash }).returning({
      id: usuariosTable.id,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      telefone: usuariosTable.telefone,
      celular: usuariosTable.celular,
      bloqueado: usuariosTable.bloqueado,
      created_at: usuariosTable.created_at,
    });
    return res.status(201).json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/usuarios/:id", async (req, res) => {
  try {
    const [item] = await db.update(usuariosTable).set({ ...req.body, updated_at: new Date() })
      .where(eq(usuariosTable.id, parseInt(req.params.id))).returning({
        id: usuariosTable.id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
        telefone: usuariosTable.telefone,
        celular: usuariosTable.celular,
        bloqueado: usuariosTable.bloqueado,
        created_at: usuariosTable.created_at,
      });
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/usuarios/:id/permissoes", async (req, res) => {
  try {
    const items = await db.select({ permissao: permissoesTable.permissao })
      .from(permissoesTable).where(eq(permissoesTable.usuario_id, parseInt(req.params.id)));
    return res.json(items.map(i => i.permissao));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.put("/usuarios/:id/permissoes", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { permissoes } = req.body;
    await db.delete(permissoesTable).where(eq(permissoesTable.usuario_id, id));
    if (permissoes?.length > 0) {
      await db.insert(permissoesTable).values(permissoes.map((p: string) => ({ usuario_id: id, permissao: p })));
    }
    return res.json(permissoes);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
