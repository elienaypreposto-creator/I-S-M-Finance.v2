import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { departamentosTable, lancamentosTable, parceirosTable } from "@workspace/db/schema";
import { AppError } from "../../../utils/app-error";
import type { CreateDepartamentoBody, UpdateDepartamentoBody } from "./schemas";

export const departamentosService = {
  async list() {
    return db.select().from(departamentosTable).orderBy(departamentosTable.nome);
  },

  async create(payload: CreateDepartamentoBody) {
    const [item] = await db.insert(departamentosTable).values({ nome: payload.nome }).returning();
    return item;
  },

  async update(id: number, payload: UpdateDepartamentoBody) {
    const [item] = await db
      .update(departamentosTable)
      .set({ nome: payload.nome })
      .where(eq(departamentosTable.id, id))
      .returning();

    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Departamento não encontrado.");
    }

    return item;
  },

  async remove(id: number) {
    const [lancRows, parceiroRows] = await Promise.all([
      db
        .select({ id: lancamentosTable.id })
        .from(lancamentosTable)
        .where(eq(lancamentosTable.departamento_id, id))
        .limit(1),
      db
        .select({ id: parceirosTable.id })
        .from(parceirosTable)
        .where(eq(parceirosTable.departamento_id, id))
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

    await db.delete(departamentosTable).where(eq(departamentosTable.id, id));
    return { deleted: true };
  },
};
