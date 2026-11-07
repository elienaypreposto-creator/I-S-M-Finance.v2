import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { filiaisTable } from "@workspace/db/schema";
import { AppError } from "../../../utils/app-error";
import { acharNomeDuplicado, limparNome } from "../../../utils/nomes";
import { tenantScope, tenantWhere, withEmpresaId } from "../../../lib/tenant-scope";
import type { CreateFilialBody, UpdateFilialBody } from "./schemas";

/** Recusa nome de filial já usado na empresa (sem caixa/acento/espaços). */
async function garantirFilialUnica(empresaId: number, nome: string, idIgnorar?: number) {
  const existentes = await db
    .select({ id: filiaisTable.id, nome: filiaisTable.nome })
    .from(filiaisTable)
    .where(tenantScope(filiaisTable, empresaId));
  const duplicada = acharNomeDuplicado(existentes, nome, idIgnorar);
  if (duplicada) {
    throw new AppError(409, "CONFLICT", `Já existe uma filial chamada "${duplicada.nome}".`);
  }
}

export const filiaisService = {
  async list(empresaId: number) {
    // Ordem alfabética sem diferenciar maiúsculas.
    return db
      .select()
      .from(filiaisTable)
      .where(tenantScope(filiaisTable, empresaId))
      .orderBy(sql`lower(${filiaisTable.nome})`, filiaisTable.id);
  },

  async create(empresaId: number, payload: CreateFilialBody) {
    const nome = limparNome(payload.nome);
    await garantirFilialUnica(empresaId, nome);
    const [item] = await db
      .insert(filiaisTable)
      .values(withEmpresaId({ nome }, empresaId))
      .returning();
    return item;
  },

  async update(empresaId: number, id: number, payload: UpdateFilialBody) {
    const nome = limparNome(payload.nome);
    await garantirFilialUnica(empresaId, nome, id);
    const [item] = await db
      .update(filiaisTable)
      .set({ nome })
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
