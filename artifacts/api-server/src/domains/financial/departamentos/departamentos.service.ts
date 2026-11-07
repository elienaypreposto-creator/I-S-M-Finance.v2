import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  centrosCustosTable,
  departamentosTable,
  lancamentosTable,
  parceirosTable,
  regrasConciliacaoTable,
} from "@workspace/db/schema";
import { AppError } from "../../../utils/app-error";
import { acharNomeDuplicado, limparNome } from "../../../utils/nomes";
import { tenantScope, tenantWhere, withEmpresaId } from "../../../lib/tenant-scope";
import type {
  CreateCentroCustoBody,
  CreateDepartamentoBody,
  ListCentrosCustosQuery,
  UpdateCentroCustoBody,
  UpdateDepartamentoBody,
} from "./schemas";

/** Recusa nome de departamento já usado na empresa (sem caixa/acento/espaços). */
async function garantirDepartamentoUnico(empresaId: number, nome: string, idIgnorar?: number) {
  const existentes = await db
    .select({ id: departamentosTable.id, nome: departamentosTable.nome })
    .from(departamentosTable)
    .where(tenantScope(departamentosTable, empresaId));
  const duplicado = acharNomeDuplicado(existentes, nome, idIgnorar);
  if (duplicado) {
    throw new AppError(409, "CONFLICT", `Já existe um departamento chamado "${duplicado.nome}".`);
  }
}

/** Recusa nome de centro de custo já usado no mesmo departamento. */
async function garantirCentroUnico(empresaId: number, departamentoId: number, nome: string, idIgnorar?: number) {
  const existentes = await db
    .select({ id: centrosCustosTable.id, nome: centrosCustosTable.nome })
    .from(centrosCustosTable)
    .where(tenantWhere(centrosCustosTable, empresaId, eq(centrosCustosTable.departamento_id, departamentoId)));
  const duplicado = acharNomeDuplicado(existentes, nome, idIgnorar);
  if (duplicado) {
    throw new AppError(409, "CONFLICT", `Já existe o centro de custo "${duplicado.nome}" neste departamento.`);
  }
}

export const departamentosService = {
  /** Centros de custo da empresa (opcionalmente de um departamento), por nome. */
  async listCentrosCustos(empresaId: number, query: ListCentrosCustosQuery) {
    return db
      .select({
        id: centrosCustosTable.id,
        nome: centrosCustosTable.nome,
        departamento_id: centrosCustosTable.departamento_id,
      })
      .from(centrosCustosTable)
      .where(
        tenantWhere(
          centrosCustosTable,
          empresaId,
          query.departamento_id ? eq(centrosCustosTable.departamento_id, query.departamento_id) : undefined,
        ),
      )
      .orderBy(centrosCustosTable.nome);
  },

  async createCentroCusto(empresaId: number, payload: CreateCentroCustoBody) {
    const nome = limparNome(payload.nome);
    const [departamento] = await db
      .select({ id: departamentosTable.id })
      .from(departamentosTable)
      .where(tenantWhere(departamentosTable, empresaId, eq(departamentosTable.id, payload.departamento_id)))
      .limit(1);
    if (!departamento) {
      throw new AppError(404, "NOT_FOUND", "Departamento não encontrado.");
    }
    await garantirCentroUnico(empresaId, payload.departamento_id, nome);

    const [item] = await db
      .insert(centrosCustosTable)
      .values(withEmpresaId({ nome, departamento_id: payload.departamento_id }, empresaId))
      .returning({
        id: centrosCustosTable.id,
        nome: centrosCustosTable.nome,
        departamento_id: centrosCustosTable.departamento_id,
      });
    return item;
  },

  async updateCentroCusto(empresaId: number, id: number, payload: UpdateCentroCustoBody) {
    const nome = limparNome(payload.nome);
    const [atual] = await db
      .select({ id: centrosCustosTable.id, departamento_id: centrosCustosTable.departamento_id })
      .from(centrosCustosTable)
      .where(tenantWhere(centrosCustosTable, empresaId, eq(centrosCustosTable.id, id)))
      .limit(1);
    if (!atual) {
      throw new AppError(404, "NOT_FOUND", "Centro de custo não encontrado.");
    }
    if (atual.departamento_id != null) {
      await garantirCentroUnico(empresaId, atual.departamento_id, nome, id);
    }

    const [item] = await db
      .update(centrosCustosTable)
      .set({ nome })
      .where(tenantWhere(centrosCustosTable, empresaId, eq(centrosCustosTable.id, id)))
      .returning({
        id: centrosCustosTable.id,
        nome: centrosCustosTable.nome,
        departamento_id: centrosCustosTable.departamento_id,
      });
    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Centro de custo não encontrado.");
    }
    return item;
  },

  async removeCentroCusto(empresaId: number, id: number) {
    const [lancRows, parceiroRows, regraRows] = await Promise.all([
      db
        .select({ id: lancamentosTable.id })
        .from(lancamentosTable)
        .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.centro_custo_id, id)))
        .limit(1),
      db
        .select({ id: parceirosTable.id })
        .from(parceirosTable)
        .where(tenantWhere(parceirosTable, empresaId, eq(parceirosTable.centro_custo_id, id)))
        .limit(1),
      db
        .select({ id: regrasConciliacaoTable.id })
        .from(regrasConciliacaoTable)
        .where(tenantWhere(regrasConciliacaoTable, empresaId, eq(regrasConciliacaoTable.centro_custo_id, id)))
        .limit(1),
    ]);

    if (lancRows[0]) {
      throw new AppError(
        400,
        "INTEGRITY_ERROR",
        "Não é possível excluir este centro de custo, pois existem lançamentos financeiros vinculados a ele.",
      );
    }
    if (parceiroRows[0]) {
      throw new AppError(
        400,
        "INTEGRITY_ERROR",
        "Não é possível excluir este centro de custo, pois existem parceiros vinculados a ele.",
      );
    }
    if (regraRows[0]) {
      throw new AppError(
        400,
        "INTEGRITY_ERROR",
        "Não é possível excluir este centro de custo, pois existem regras de conciliação que o utilizam.",
      );
    }

    const [item] = await db
      .delete(centrosCustosTable)
      .where(tenantWhere(centrosCustosTable, empresaId, eq(centrosCustosTable.id, id)))
      .returning({ id: centrosCustosTable.id });
    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Centro de custo não encontrado.");
    }
    return { deleted: true };
  },

  async list(empresaId: number) {
    return db
      .select()
      .from(departamentosTable)
      .where(tenantScope(departamentosTable, empresaId))
      .orderBy(departamentosTable.nome);
  },

  async create(empresaId: number, payload: CreateDepartamentoBody) {
    const nome = limparNome(payload.nome);
    await garantirDepartamentoUnico(empresaId, nome);
    const [item] = await db
      .insert(departamentosTable)
      .values(withEmpresaId({ nome }, empresaId))
      .returning();
    return item;
  },

  async update(empresaId: number, id: number, payload: UpdateDepartamentoBody) {
    const nome = limparNome(payload.nome);
    await garantirDepartamentoUnico(empresaId, nome, id);
    const [item] = await db
      .update(departamentosTable)
      .set({ nome })
      .where(tenantWhere(departamentosTable, empresaId, eq(departamentosTable.id, id)))
      .returning();

    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Departamento não encontrado.");
    }

    return item;
  },

  async remove(empresaId: number, id: number) {
    const [lancRows, parceiroRows, centroRows, regraRows] = await Promise.all([
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
      db
        .select({ id: centrosCustosTable.id })
        .from(centrosCustosTable)
        .where(tenantWhere(centrosCustosTable, empresaId, eq(centrosCustosTable.departamento_id, id)))
        .limit(1),
      db
        .select({ id: regrasConciliacaoTable.id })
        .from(regrasConciliacaoTable)
        .where(tenantWhere(regrasConciliacaoTable, empresaId, eq(regrasConciliacaoTable.departamento_id, id)))
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

    if (centroRows[0]) {
      throw new AppError(
        400,
        "INTEGRITY_ERROR",
        "Não é possível excluir este departamento, pois ele tem centros de custo. Remova os centros de custo antes.",
      );
    }

    if (regraRows[0]) {
      throw new AppError(
        400,
        "INTEGRITY_ERROR",
        "Não é possível excluir este departamento, pois existem regras de conciliação que o utilizam.",
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
