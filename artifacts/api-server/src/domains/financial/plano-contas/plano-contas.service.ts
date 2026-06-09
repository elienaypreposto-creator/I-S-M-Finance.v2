import { count, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { lancamentosTable, metasTable, planoContasTable } from "@workspace/db/schema";
import { AppError } from "../../../utils/app-error";
import type { CreatePlanoContaBody, UpdatePlanoContaBody } from "./schemas";

export const planoContasService = {
  async list() {
    return db.select().from(planoContasTable).orderBy(planoContasTable.tipo, planoContasTable.categoria);
  },

  async create(payload: CreatePlanoContaBody) {
    const [item] = await db
      .insert(planoContasTable)
      .values({
        tipo: payload.tipo,
        categoria: payload.categoria,
        subcategoria: payload.subcategoria ?? null,
        codigo: payload.codigo ?? null,
        ativo: payload.ativo ?? true,
      })
      .returning();

    return item;
  },

  async update(id: number, payload: UpdatePlanoContaBody) {
    const [item] = await db
      .update(planoContasTable)
      .set({ ...payload, updated_at: new Date() })
      .where(eq(planoContasTable.id, id))
      .returning();

    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Plano de contas não encontrado.");
    }

    return item;
  },

  async remove(id: number) {
    const [[{ lancamentos }], [{ metas }]] = await Promise.all([
      db
        .select({ lancamentos: count() })
        .from(lancamentosTable)
        .where(eq(lancamentosTable.plano_conta_id, id)),
      db
        .select({ metas: count() })
        .from(metasTable)
        .where(eq(metasTable.plano_conta_id, id)),
    ]);

    if (Number(lancamentos) > 0 || Number(metas) > 0) {
      throw new AppError(
        409,
        "CONFLICT",
        "Não é possível excluir esta conta/categoria, pois existem lançamentos ou metas orçamentárias vinculadas.",
      );
    }

    await db.delete(planoContasTable).where(eq(planoContasTable.id, id));
    return { deleted: true };
  },
};
