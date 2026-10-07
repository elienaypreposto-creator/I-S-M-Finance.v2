import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { filiaisTable } from "@workspace/db/schema";
import { AppError } from "../../../utils/app-error";
import { tenantScope, tenantWhere, withEmpresaId } from "../../../lib/tenant-scope";
import type { CreateFilialBody, UpdateFilialBody } from "./schemas";

export const filiaisService = {
  async list(empresaId: number) {
    return db.select().from(filiaisTable).where(tenantScope(filiaisTable, empresaId)).orderBy(filiaisTable.nome);
  },

  async create(empresaId: number, payload: CreateFilialBody) {
    const [item] = await db
      .insert(filiaisTable)
      .values(withEmpresaId({ nome: payload.nome }, empresaId))
      .returning();
    return item;
  },

  async update(empresaId: number, id: number, payload: UpdateFilialBody) {
    const [item] = await db
      .update(filiaisTable)
      .set({ nome: payload.nome })
      .where(tenantWhere(filiaisTable, empresaId, eq(filiaisTable.id, id)))
      .returning();

    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Filial não encontrada.");
    }

    return item;
  },

  async remove(empresaId: number, id: number) {
    const [item] = await db
      .delete(filiaisTable)
      .where(tenantWhere(filiaisTable, empresaId, eq(filiaisTable.id, id)))
      .returning({ id: filiaisTable.id });
    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Filial não encontrada.");
    }
    return { deleted: true };
  },
};
