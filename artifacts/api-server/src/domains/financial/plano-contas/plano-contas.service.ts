import {count, eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {lancamentosTable, metasTable, planoContasTable} from "@workspace/db/schema";
import {AppError} from "../../../utils/app-error";
import {tenantScope, tenantWhere, withEmpresaId} from "../../../lib/tenant-scope";
import {limparNome} from "../../../utils/nomes";
import {acharPlanoDuplicado, categoriaExistente, grupoDreCompativel} from "./plano-contas-regras";
import type {CreatePlanoContaBody, UpdatePlanoContaBody} from "./schemas";

const ROTULO_TIPO: Record<string, string> = {receita: "Receita", custo: "Custo", despesa: "Despesa"};

/** Recusa linha da DRE incoerente com o tipo e conta repetida (sem caixa/acento/espaços). */
async function validarCadastro(
    empresaId: number,
    alvo: { id?: number; tipo: string; categoria: string; subcategoria: string | null; grupo_dre: string | null },
) {
    if (!grupoDreCompativel(alvo.tipo, alvo.grupo_dre)) {
        throw new AppError(
            400,
            "VALIDATION_ERROR",
            `A linha da DRE escolhida não combina com o tipo ${ROTULO_TIPO[alvo.tipo.toLowerCase()] ?? alvo.tipo}. ` +
            "Receita só entra em Receita bruta ou Fora da DRE; custo e despesa não entram em Receita bruta.",
        );
    }

    const existentes = await db
        .select({
            id: planoContasTable.id,
            tipo: planoContasTable.tipo,
            categoria: planoContasTable.categoria,
            subcategoria: planoContasTable.subcategoria,
        })
        .from(planoContasTable)
        .where(tenantScope(planoContasTable, empresaId));
    const duplicado = acharPlanoDuplicado(existentes, alvo);
    if (duplicado) {
        const nome = duplicado.subcategoria ? `${duplicado.categoria} / ${duplicado.subcategoria}` : duplicado.categoria;
        throw new AppError(409, "CONFLICT", `Já existe "${nome}" neste tipo do plano de contas.`);
    }
    return existentes;
}

export const planoContasService = {
    async list(empresaId: number) {
        return db
            .select()
            .from(planoContasTable)
            .where(tenantScope(planoContasTable, empresaId))
            .orderBy(planoContasTable.tipo, planoContasTable.categoria);
    },

    async create(empresaId: number, payload: CreatePlanoContaBody) {
        const tipo = payload.tipo;
        const categoriaDigitada = limparNome(payload.categoria);
        const subcategoria = limparNome(payload.subcategoria) || null;
        const existentes = await validarCadastro(empresaId, {
            tipo,
            categoria: categoriaDigitada,
            subcategoria,
            grupo_dre: payload.grupo_dre ?? null,
        });
        // Conta nova cai no grupo existente com a grafia já cadastrada ("saude" → "Saúde").
        const categoria = categoriaExistente(existentes, tipo, categoriaDigitada) ?? categoriaDigitada;

        const [item] = await db
            .insert(planoContasTable)
            .values(
                withEmpresaId(
                    {
                        tipo,
                        categoria,
                        subcategoria,
                        codigo: payload.codigo ?? null,
                        grupo_dre: payload.grupo_dre ?? null,
                        ativo: payload.ativo ?? true,
                    },
                    empresaId,
                ),
            )
            .returning();

        return item;
    },

    async update(empresaId: number, id: number, payload: UpdatePlanoContaBody) {
        const [atual] = await db
            .select()
            .from(planoContasTable)
            .where(tenantWhere(planoContasTable, empresaId, eq(planoContasTable.id, id)))
            .limit(1);
        if (!atual) {
            throw new AppError(404, "NOT_FOUND", "Plano de contas não encontrado.");
        }

        // A linha da DRE é só classificação de relatório: pode mudar com a conta em uso.
        // Tipo, categoria, subcategoria, código e ativo continuam travados.
        const normalizar = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v ?? null);
        const mudaCadastro = (Object.keys(payload) as (keyof UpdatePlanoContaBody)[]).some(
            (campo) =>
                campo !== "grupo_dre" &&
                payload[campo] !== undefined &&
                normalizar(payload[campo]) !== normalizar(atual[campo]),
        );

        if (mudaCadastro) {
            const [[{lancamentos}], [{metas}]] = await Promise.all([
                db
                    .select({lancamentos: count()})
                    .from(lancamentosTable)
                    .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.plano_conta_id, id))),
                db
                    .select({metas: count()})
                    .from(metasTable)
                    .where(tenantWhere(metasTable, empresaId, eq(metasTable.plano_conta_id, id))),
            ]);

            if (Number(lancamentos) > 0 || Number(metas) > 0) {
                throw new AppError(
                    409,
                    "CONFLICT",
                    "Não é possível editar este cadastro, pois já existem lançamentos ou conciliações registrados utilizando-o. Só a linha da DRE pode ser alterada.",
                );
            }
        }

        const alteracoes: UpdatePlanoContaBody = {...payload};
        if (alteracoes.categoria !== undefined) alteracoes.categoria = limparNome(alteracoes.categoria);
        if (alteracoes.subcategoria !== undefined) alteracoes.subcategoria = limparNome(alteracoes.subcategoria) || null;

        // Valida o cadastro como fica depois da edição (campos ausentes mantêm o atual).
        await validarCadastro(empresaId, {
            id,
            tipo: alteracoes.tipo ?? atual.tipo,
            categoria: alteracoes.categoria ?? atual.categoria,
            subcategoria: alteracoes.subcategoria !== undefined ? alteracoes.subcategoria : atual.subcategoria,
            grupo_dre: alteracoes.grupo_dre !== undefined ? alteracoes.grupo_dre : atual.grupo_dre,
        });

        const [item] = await db
            .update(planoContasTable)
            .set({...alteracoes, updated_at: new Date()})
            .where(tenantWhere(planoContasTable, empresaId, eq(planoContasTable.id, id)))
            .returning();

        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Plano de contas não encontrado.");
        }

        return item;
    },

    async remove(empresaId: number, id: number) {
        const [[{lancamentos}], [{metas}]] = await Promise.all([
            db
                .select({lancamentos: count()})
                .from(lancamentosTable)
                .where(tenantWhere(lancamentosTable, empresaId, eq(lancamentosTable.plano_conta_id, id))),
            db
                .select({metas: count()})
                .from(metasTable)
                .where(tenantWhere(metasTable, empresaId, eq(metasTable.plano_conta_id, id))),
        ]);

        if (Number(lancamentos) > 0 || Number(metas) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível excluir esta conta/categoria, pois existem lançamentos ou metas orçamentárias vinculadas a ela.",
            );
        }

        const [item] = await db
            .delete(planoContasTable)
            .where(tenantWhere(planoContasTable, empresaId, eq(planoContasTable.id, id)))
            .returning({id: planoContasTable.id});
        if (!item) {
            throw new AppError(404, "NOT_FOUND", "Plano de contas não encontrado.");
        }
        return {deleted: true};
    },
};
