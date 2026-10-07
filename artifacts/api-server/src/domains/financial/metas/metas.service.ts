import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { metasTable } from "@workspace/db/schema";
import { tenantWhere, withEmpresaId } from "../../../lib/tenant-scope";
import type { ListMetasQuery, UpsertMetaBody } from "./schemas";

export const metasService = {
  async listByAno(empresaId: number, query: ListMetasQuery) {
    const { ano } = query;
    return db.select().from(metasTable).where(tenantWhere(metasTable, empresaId, eq(metasTable.ano, ano)));
  },

  async upsert(empresaId: number, payload: UpsertMetaBody) {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(metasTable)
        .where(
          tenantWhere(
            metasTable,
            empresaId,
            and(
              eq(metasTable.plano_conta_id, payload.plano_conta_id),
              eq(metasTable.ano, payload.ano),
              eq(metasTable.mes, payload.mes),
            ),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(metasTable)
          .set({
            valor_projetado: payload.valor_projetado,
            updated_at: new Date(),
          })
          .where(tenantWhere(metasTable, empresaId, eq(metasTable.id, existing.id)))
          .returning();
        return updated;
      }

      const [created] = await tx
        .insert(metasTable)
        .values(
          withEmpresaId(
            {
              plano_conta_id: payload.plano_conta_id,
              ano: payload.ano,
              mes: payload.mes,
              valor_projetado: payload.valor_projetado,
            },
            empresaId,
          ),
        )
        .returning();

      return created;
    });
  },
};
