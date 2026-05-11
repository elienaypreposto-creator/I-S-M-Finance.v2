import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { filiaisTable } from "@workspace/db/schema";
import { AppError } from "../../../utils/app-error";
import type { CreateFilialBody, UpdateFilialBody } from "./schemas";

export const filiaisService = {
  async list() {
    return db.select().from(filiaisTable).orderBy(filiaisTable.nome);
  },

  async create(payload: CreateFilialBody) {
    const [item] = await db.insert(filiaisTable).values({ nome: payload.nome }).returning();
    return item;
  },

  async update(id: number, payload: UpdateFilialBody) {
    const [item] = await db
      .update(filiaisTable)
      .set({ nome: payload.nome })
      .where(eq(filiaisTable.id, id))
      .returning();

    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Filial não encontrada.");
    }

    return item;
  },

  async remove(id: number) {
    await db.delete(filiaisTable).where(eq(filiaisTable.id, id));
    return { deleted: true };
  },
};
