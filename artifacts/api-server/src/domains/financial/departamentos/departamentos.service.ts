import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { departamentosTable, lancamentosTable, parceirosTable } from "@workspace/db/schema";
import { AppError } from "../../../utils/app-error";
import { tenantScope, tenantWhere, withEmpresaId } from "../../../lib/tenant-scope";
import type { CreateDepartamentoBody, UpdateDepartamentoBody } from "./schemas";

export const departamentosService = {
  async list(empresaId: number) {
    return db
      .select()
      .from(departamentosTable)
      .where(tenantScope(departamentosTable, empresaId))
      .orderBy(departamentosTable.nome);
  },

  async create(empresaId: number, payload: CreateDepartamentoBody) {
    const [item] = await db
      .insert(departamentosTable)
      .values(withEmpresaId({ nome: payload.nome }, empresaId))
      .returning();
    return item;
  },

  async update(empresaId: number, id: number, payload: UpdateDepartamentoBody) {
    const [item] = await db
      .update(departamentosTable)
      .set({ nome: payload.nome })
      .where(tenantWhere(departamentosTable, empresaId, eq(departamentosTable.id, id)))
      .returning();

    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Departamento não encontrado.");
    }

    return item;
  },

  async remove(empresaId: number, id: number) {
    const [lancRows, parceiroRows] = await Promise.all([
      db
        .select({ id: lancamentosTable.id })
        .from(lancamentosTable)
        .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.departamento_id, id)))
        .limit(1),
      db
        .select({ id: parceirosTable.id })
        .from(parceirosTable)
        .where(tenantWhere(parceirosTable, empresaId, eq(parceirosTable.departamento_id, id)))
        .limit(1),
    ]);

    const lancVinculo = lancRows[0];
    const parceiroVinculo = parceiroRows[0];

    if (lancVinculo) {
      throw new AppError(
        400,
        "INTEGRITY_ERROR",
        "Não é possível excluir este departamento, pois existem lançamentos financeiros vinculados a ele.",
      );
    }

    if (parceiroVinculo) {
      throw new AppError(
        400,
        "INTEGRITY_ERROR",
        "Não é possível excluir este departamento, pois existem parceiros vinculados a ele.",
      );
    }

    const [item] = await db
      .delete(departamentosTable)
      .where(tenantWhere(departamentosTable, empresaId, eq(departamentosTable.id, id)))
      .returning({ id: departamentosTable.id });
    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Departamento não encontrado.");
    }
    return { deleted: true };
  },
};
