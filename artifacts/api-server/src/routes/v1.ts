import { Router } from "express";
import { db } from "@workspace/db";
import { contasBancariasTable, lancamentosTable, parceirosTable, filiaisTable, planoContasTable, tokensApiTable } from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// Bearer token authentication middleware
const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  const token_hash = crypto.createHash("sha256").update(token).digest("hex");

  const [found] = await db.select().from(tokensApiTable)
    .where(and(eq(tokensApiTable.token_hash, token_hash), eq(tokensApiTable.ativo, true)));

  if (!found) return res.status(401).json({ error: "Invalid or expired token" });
  next();
};

router.get("/bancos", authenticate, async (_req, res) => {
  try {
    const items = await db.select().from(contasBancariasTable);
    return res.json(items.map(i => ({ ...i, saldo_inicial: Number(i.saldo_inicial ?? 0) })));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/contasPagar", authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = (page - 1) * limit;

    const [totalResult] = await db.select({ count: count() }).from(lancamentosTable).where(eq(lancamentosTable.tipo, "CP"));
    const items = await db.select().from(lancamentosTable).where(eq(lancamentosTable.tipo, "CP")).limit(limit).offset(offset);
    return res.json({ data: items.map(i => ({ ...i, valor: Number(i.valor) })), total: totalResult.count, page, limit });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/contasReceber", authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = (page - 1) * limit;

    const [totalResult] = await db.select({ count: count() }).from(lancamentosTable).where(eq(lancamentosTable.tipo, "CR"));
    const items = await db.select().from(lancamentosTable).where(eq(lancamentosTable.tipo, "CR")).limit(limit).offset(offset);
    return res.json({ data: items.map(i => ({ ...i, valor: Number(i.valor) })), total: totalResult.count, page, limit });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/pessoas", authenticate, async (req, res) => {
  try {
    const [totalResult] = await db.select({ count: count() }).from(parceirosTable);
    const items = await db.select().from(parceirosTable);
    return res.json({ data: items, total: totalResult.count, page: 1, limit: 9999 });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/filiais", authenticate, async (_req, res) => {
  try {
    const items = await db.select().from(filiaisTable);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/planoContas", authenticate, async (_req, res) => {
  try {
    const items = await db.select().from(planoContasTable);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/categoriaPlanoConta", authenticate, async (_req, res) => {
  try {
    const items = await db.select().from(planoContasTable);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

router.get("/tipoDocumentos", authenticate, async (_req, res) => {
  try {
    const tipos = [
      { id: 1, nome: "Nota Fiscal" },
      { id: 2, nome: "Recibo" },
      { id: 3, nome: "Contrato" },
      { id: 4, nome: "Boleto" },
      { id: 5, nome: "PIX" },
      { id: 6, nome: "TED" },
      { id: 7, nome: "DOC" },
    ];
    return res.json(tipos);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
