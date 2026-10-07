import {Router} from "express";
import {and, desc, eq, sql} from "drizzle-orm";
import {db} from "@workspace/db";
import {
    contasBancariasTable,
    lancamentosTable,
    parceirosTable,
    filiaisTable,
    planoContasTable,
    departamentosTable,
    centrosCustosTable,
} from "@workspace/db/schema";
import {v1AuthMiddleware} from "../middlewares/v1Auth";
import {withTenantTxMiddleware} from "../middlewares/tenant-tx";
import {withScope} from "../middlewares/withScope";
import {errorResponse, successResponse} from "../utils/response";
import {fromCents, valorEfetivoCents} from "../utils/money";
import {tenantScope, tenantWhere} from "../lib/tenant-scope";

const router = Router();

const DEFAULT_LIMIT = 10000;

const parseLimit = (value: unknown) =>
    Math.min(Number(value ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 50000);

const parseOffset = (value: unknown) =>
    Number(value ?? 0) || 0;

function mapLancamentoV1(i: {
    valor: unknown;
    valor_quitado: unknown;
    juros: unknown;
    multa: unknown;
    desconto: unknown;
    acrescimo: unknown;
    [key: string]: unknown;
}) {
    const juros = Number(i.juros ?? 0);
    const multa = Number(i.multa ?? 0);
    const desconto = Number(i.desconto ?? 0);

    return {
        ...i,
        valor: Number(i.valor ?? 0),
        valor_quitado: Number(i.valor_quitado ?? 0),
        juros,
        multa,
        desconto,

        /** valor + juros + multa - desconto */
        valor_efetivo: fromCents(
            valorEfetivoCents({
                valor: i.valor,
                juros: i.juros,
                multa: i.multa,
                desconto: i.desconto,
            }),
        ),

        /** @deprecated use `juros`. Espelha juros para clientes legados. */
        acrescimo: juros,
    };
}

router.use(v1AuthMiddleware);
router.use(withTenantTxMiddleware);

/**
 * Bancos
 */
router.get("/bancos", withScope("v1:bancos:ler"), async (req, res) => {
    try {
        const empresaId = req.tenant!.empresaId;

        const items = await db
            .select()
            .from(contasBancariasTable)
            .where(tenantScope(contasBancariasTable, empresaId))
            .where(eq(contasBancariasTable.empresa_id, empresaId))
            .orderBy(contasBancariasTable.nome);

        return successResponse(
            res,
            items.map((i) => ({
                ...i,
                saldo_inicial: Number(i.saldo_inicial ?? 0),
            })),
        );
    } catch (e) {
        return errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "Erro ao listar bancos (v1).",
            e,
        );
    }
});

/**
 * Contas a pagar
 */
router.get("/contasPagar", withScope("v1:lancamentos:ler"), async (req, res) => {
    try {
        const empresaId = req.tenant!.empresaId;
        const limit = parseLimit(req.query.limit);
        const offset = parseOffset(req.query.offset);

        const items = await db
            .select({
                id: lancamentosTable.id,
                tipo: lancamentosTable.tipo,
                vencimento: lancamentosTable.vencimento,
                competencia: lancamentosTable.competencia,
                data_quitacao: lancamentosTable.data_quitacao,
                descricao: lancamentosTable.descricao,
                valor: lancamentosTable.valor,
                status: lancamentosTable.status,
                valor_quitado: lancamentosTable.valor_quitado,
                juros: lancamentosTable.juros,
                multa: lancamentosTable.multa,
                desconto: lancamentosTable.desconto,
                acrescimo: lancamentosTable.acrescimo,
                riscos: lancamentosTable.riscos,
                transferencia_grupo_id: lancamentosTable.transferencia_grupo_id,

                parceiro_id: parceirosTable.id,
                parceiro_nome: parceirosTable.nome,
                parceiro_documento: parceirosTable.cpf_cnpj,

                conta_id: contasBancariasTable.id,
                conta_nome: contasBancariasTable.nome,

                plano_conta_id: planoContasTable.id,
                plano_categoria: planoContasTable.categoria,
                plano_subcategoria: planoContasTable.subcategoria,

                departamento_id: departamentosTable.id,
                departamento_nome: departamentosTable.nome,

                centro_custo_id: centrosCustosTable.id,
                centro_custo_nome: centrosCustosTable.nome,

                created_at: lancamentosTable.created_at,
                updated_at: lancamentosTable.updated_at,
            })
            .from(lancamentosTable)
            .leftJoin(
                parceirosTable,
                eq(lancamentosTable.parceiro_id, parceirosTable.id),
            )
            .leftJoin(
                contasBancariasTable,
                eq(lancamentosTable.conta_id, contasBancariasTable.id),
            )
            .leftJoin(
                planoContasTable,
                eq(lancamentosTable.plano_conta_id, planoContasTable.id),
            )
            .leftJoin(
                departamentosTable,
                eq(lancamentosTable.departamento_id, departamentosTable.id),
            )
            .leftJoin(
                centrosCustosTable,
                eq(lancamentosTable.centro_custo_id, centrosCustosTable.id),
            )
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    eq(lancamentosTable.tipo, "CP"),
                ),
            )
            .where(
                and(
                    eq(lancamentosTable.tipo, "CP"),
                    eq(lancamentosTable.empresa_id, empresaId),
                ),
            )
            .orderBy(desc(lancamentosTable.updated_at))
            .limit(limit)
            .offset(offset);

        return successResponse(
            res,
            items.map(mapLancamentoV1),
            {
                limit,
                offset,
                nextOffset: offset + items.length,
            },
        );
    } catch (e) {
        return errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "Erro ao listar contas a pagar (v1).",
            e,
        );
    }
});

/**
 * Contas a receber
 */
router.get("/contasReceber", withScope("v1:lancamentos:ler"), async (req, res) => {
    try {
        const empresaId = req.tenant!.empresaId;
        const limit = parseLimit(req.query.limit);
        const offset = parseOffset(req.query.offset);

        const items = await db
            .select({
                id: lancamentosTable.id,
                tipo: lancamentosTable.tipo,
                vencimento: lancamentosTable.vencimento,
                competencia: lancamentosTable.competencia,
                data_quitacao: lancamentosTable.data_quitacao,
                descricao: lancamentosTable.descricao,
                valor: lancamentosTable.valor,
                status: lancamentosTable.status,
                valor_quitado: lancamentosTable.valor_quitado,
                juros: lancamentosTable.juros,
                multa: lancamentosTable.multa,
                desconto: lancamentosTable.desconto,
                acrescimo: lancamentosTable.acrescimo,
                riscos: lancamentosTable.riscos,
                transferencia_grupo_id: lancamentosTable.transferencia_grupo_id,

                parceiro_id: parceirosTable.id,
                parceiro_nome: parceirosTable.nome,
                parceiro_documento: parceirosTable.cpf_cnpj,

                conta_id: contasBancariasTable.id,
                conta_nome: contasBancariasTable.nome,

                plano_conta_id: planoContasTable.id,
                plano_categoria: planoContasTable.categoria,
                plano_subcategoria: planoContasTable.subcategoria,

                departamento_id: departamentosTable.id,
                departamento_nome: departamentosTable.nome,

                centro_custo_id: centrosCustosTable.id,
                centro_custo_nome: centrosCustosTable.nome,

                created_at: lancamentosTable.created_at,
                updated_at: lancamentosTable.updated_at,
            })
            .from(lancamentosTable)
            .leftJoin(
                parceirosTable,
                eq(lancamentosTable.parceiro_id, parceirosTable.id),
            )
            .leftJoin(
                contasBancariasTable,
                eq(lancamentosTable.conta_id, contasBancariasTable.id),
            )
            .leftJoin(
                planoContasTable,
                eq(lancamentosTable.plano_conta_id, planoContasTable.id),
            )
            .leftJoin(
                departamentosTable,
                eq(lancamentosTable.departamento_id, departamentosTable.id),
            )
            .leftJoin(
                centrosCustosTable,
                eq(lancamentosTable.centro_custo_id, centrosCustosTable.id),
            )
            .where(
                tenantWhere(
                    lancamentosTable,
                    empresaId,
                    eq(lancamentosTable.tipo, "CR"),
                ),
            )
            .where(
                and(
                    eq(lancamentosTable.tipo, "CR"),
                    eq(lancamentosTable.empresa_id, empresaId),
                ),
            )
            .orderBy(desc(lancamentosTable.updated_at))
            .limit(limit)
            .offset(offset);

        return successResponse(
            res,
            items.map(mapLancamentoV1),
            {
                limit,
                offset,
                nextOffset: offset + items.length,
            },
        );
    } catch (e) {
        return errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "Erro ao listar contas a receber (v1).",
            e,
        );
    }
});

/**
 * Pessoas / parceiros
 */
router.get("/pessoas", withScope("v1:parceiros:ler"), async (req, res) => {
    try {
        const empresaId = req.tenant!.empresaId;

        const items = await db
            .select()
            .from(parceirosTable)
            .where(tenantScope(parceirosTable, empresaId))
            .where(eq(parceirosTable.empresa_id, empresaId))
            .orderBy(parceirosTable.nome);

        return successResponse(res, items, {
            total: items.length,
        });
    } catch (e) {
        return errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "Erro ao listar pessoas/parceiros (v1).",
            e,
        );
    }
});

/**
 * Filiais
 */
router.get("/filiais", withScope("v1:filiais:ler"), async (req, res) => {
    try {
        const empresaId = req.tenant!.empresaId;

        const items = await db
            .select()
            .from(filiaisTable)
            .where(tenantScope(filiaisTable, empresaId))
            .where(eq(filiaisTable.empresa_id, empresaId))
            .orderBy(filiaisTable.nome);

        return successResponse(res, items);
    } catch (e) {
        return errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "Erro ao listar filiais (v1).",
            e,
        );
    }
});

/**
 * Plano de contas
 */
router.get("/planoContas", withScope("v1:planoContas:ler"), async (req, res) => {
    try {
        const empresaId = req.tenant!.empresaId;

        const items = await db
            .select()
            .from(planoContasTable)
            .where(tenantScope(planoContasTable, empresaId))
            .where(eq(planoContasTable.empresa_id, empresaId))
            .orderBy(
                planoContasTable.categoria,
                planoContasTable.subcategoria,
            );

        return successResponse(res, items);
    } catch (e) {
        return errorResponse(
            res,
            500,
            "INTERNAL_ERROR",
            "Erro ao listar plano de contas (v1).",
            e,
        );
    }
});

/**
 * Categorias do plano de contas
 */
router.get(
    "/categoriaPlanoConta",
    withScope("v1:planoContas:ler"),
    async (req, res) => {
        try {
            const empresaId = req.tenant!.empresaId;

            const items = await db
                .select({
                    categoria: planoContasTable.categoria,
                    total_contas: sql<number>`count(*)`,
                })
                .from(planoContasTable)
                .where(tenantScope(planoContasTable, empresaId))
                .where(eq(planoContasTable.empresa_id, empresaId))
                .groupBy(planoContasTable.categoria)
                .orderBy(planoContasTable.categoria);

            return successResponse(
                res,
                items.map((i) => ({
                    categoria: i.categoria,
                    total_contas: Number(i.total_contas ?? 0),
                })),
            );
        } catch (e) {
            return errorResponse(
                res,
                500,
                "INTERNAL_ERROR",
                "Erro ao listar categorias do plano de contas (v1).",
                e,
            );
        }
    },
);

const TIPO_DOCUMENTOS = [
    {id: 1, nome: "Nota Fiscal"},
    {id: 2, nome: "Recibo"},
    {id: 3, nome: "Contrato"},
    {id: 4, nome: "Boleto"},
    {id: 5, nome: "PIX"},
    {id: 6, nome: "TED"},
    {id: 7, nome: "DOC"},
] as const;

// Dado estático, sem consulta a tabela por empresa — mantém só a
// exigência de token válido (sem escopo extra).
router.get("/tipoDocumentos", (_req, res) =>
    successResponse(res, TIPO_DOCUMENTOS),
);

export default router;