import {Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {successResponse} from "../../../utils/response";
import {AppError} from "../../../utils/app-error";
import {PERM} from "../../../constants/permissoes";
import {hasPermission} from "../../../middlewares/withPermission";
import {lancamentosService} from "./lancamentos.service";
import {requireTenant} from "../../../lib/tenant-scope";
import {toCents} from "../../../utils/money";
import {retencoesAlteradas} from "../../../utils/retencoes";
import {identidadeAuditoria} from "../../../lib/api-token-identity";
import {decidirStatusNaEdicao} from "./status-manual";
import {camposTravadosAlterados, mensagemCamposTravados, origemQueTrava} from "./edicao-quitado";
import {
    type CreateLancamentoBody,
    type UpdateLancamentoBody,
    createLancamentoBodySchema,
    exportLancamentosQuerySchema,
    lancamentoIdParamSchema,
    listLancamentosQuerySchema,
    updateLancamentoBodySchema,
} from "./schemas";

const router = Router();

router.get(
    "/lancamentos",
    withPermission(PERM.LANCAMENTOS_LISTAR),
    asyncHandler(async (req, res) => {
        const query = listLancamentosQuerySchema.parse(req.query);
        const result = await lancamentosService.list(requireTenant(req).empresaId, query);
        return successResponse(res, result.items, result.meta);
    }),
);

// Antes de "/lancamentos/:id". Resumo (quantidade, em aberto e quitado por tipo) com os filtros da listagem.
router.get(
    "/lancamentos/resumo",
    withPermission(PERM.LANCAMENTOS_LISTAR),
    asyncHandler(async (req, res) => {
        const filtros = exportLancamentosQuerySchema.parse(req.query);
        const result = await lancamentosService.resumo(requireTenant(req).empresaId, filtros);
        return successResponse(res, result);
    }),
);

// Antes de "/lancamentos/:id". Mesmos filtros da listagem, sem paginação (teto de 10 mil linhas).
router.get(
    "/lancamentos/export",
    withPermission(PERM.LANCAMENTOS_LISTAR),
    asyncHandler(async (req, res) => {
        const filtros = exportLancamentosQuerySchema.parse(req.query);
        const result = await lancamentosService.exportar(requireTenant(req).empresaId, filtros);
        return successResponse(res, result.items, result.meta);
    }),
);

router.post(
    "/lancamentos",
    withPermission("financeiro:lancamentos:criar"),
    validateBody(createLancamentoBodySchema),
    asyncHandler(async (req, res) => {
        // Quem criou: o mesmo usuário que a auditoria registra (token de API fica null).
        const {usuario_id} = identidadeAuditoria(req);
        const item = await lancamentosService.create(requireTenant(req).empresaId, req.body as CreateLancamentoBody, usuario_id);
        return successResponse(res, item, null, 201);
    }),
);

router.get(
    "/lancamentos/:id",
    withPermission(PERM.LANCAMENTOS_LISTAR),
    asyncHandler(async (req, res) => {
        const {id} = lancamentoIdParamSchema.parse(req.params);
        const item = await lancamentosService.getById(requireTenant(req).empresaId, id);
        return successResponse(res, item);
    }),
);

router.put(
    "/lancamentos/:id",
    withPermission("financeiro:lancamentos:editar"),
    validateBody(updateLancamentoBodySchema),
    asyncHandler(async (req, res) => {
        const {id} = lancamentoIdParamSchema.parse(req.params);
        const body = req.body as UpdateLancamentoBody;
        const empresaId = requireTenant(req).empresaId;
        const atual = await lancamentosService.getById(empresaId, id);
        req.auditAntes = atual;

        // Status de quitação não se escolhe aqui (vem da conciliação/transferência);
        // reabrir/cancelar título quitado por elas é recusado.
        const decisao = decidirStatusNaEdicao({
            statusPedido: body.status,
            statusAtual: atual.status,
            quitadoAtualCents: toCents(atual.valor_quitado),
            temVinculoConciliacao: atual.tem_conciliacao,
            ehTransferencia: atual.transferencia_grupo_id != null,
        });
        if (!decisao.ok) {
            throw new AppError(409, "CONFLICT", decisao.mensagem);
        }

        // Título quitado: o que define o dinheiro (valor, tipo, conta, desconto,
        // juros, retenções) fica travado; campos descritivos seguem editáveis.
        const origemTrava = origemQueTrava({
            temVinculoConciliacao: atual.tem_conciliacao,
            ehTransferencia: atual.transferencia_grupo_id != null,
            quitadoCents: toCents(atual.valor_quitado),
            reabrindo: decisao.limparQuitacao,
        });
        const alteradosTravaveis = camposTravadosAlterados(atual, body);
        if (origemTrava && alteradosTravaveis.length > 0) {
            throw new AppError(409, "CONFLICT", mensagemCamposTravados(origemTrava, alteradosTravaveis));
        }

        // Alterar valor exige permissão dedicada (negada ao usuário comum).
        if (body.valor !== undefined) {
            const valorNovo = Number(body.valor);
            const valorAtual = Number(atual.valor);
            if (
                Number.isFinite(valorNovo) &&
                Number.isFinite(valorAtual) &&
                Math.round(valorNovo * 100) !== Math.round(valorAtual * 100)
            ) {
                if (!req.user?.superadmin && !hasPermission(req.user?.permissions, PERM.LANCAMENTOS_ALTERAR_VALOR)) {
                    throw new AppError(
                        403,
                        "FORBIDDEN",
                        `Acesso negado: permissão "${PERM.LANCAMENTOS_ALTERAR_VALOR}" necessária para alterar o valor.`,
                    );
                }
            }
        }

        // Retenções mudam o líquido (o que entra/sai do banco): mesma permissão
        // de alterar valor e bloqueio se o título já tem quitação registrada.
        if (retencoesAlteradas(atual, body)) {
            if (!req.user?.superadmin && !hasPermission(req.user?.permissions, PERM.LANCAMENTOS_ALTERAR_VALOR)) {
                throw new AppError(
                    403,
                    "FORBIDDEN",
                    `Acesso negado: permissão "${PERM.LANCAMENTOS_ALTERAR_VALOR}" necessária para alterar as retenções.`,
                );
            }
            if (toCents(atual.valor_quitado) > 0) {
                throw new AppError(
                    409,
                    "CONFLICT",
                    "Não é possível alterar as retenções de um lançamento que já tem quitação registrada. Desfaça a conciliação/baixa antes.",
                );
            }
        }

        // A conta de um título quitado é onde o dinheiro passou (saldo da conta e
        // conciliação): trocar a conta moveria o pagamento para outro banco.
        if (body.conta_id !== undefined && (body.conta_id ?? null) !== (atual.conta_id ?? null) && toCents(atual.valor_quitado) > 0) {
            throw new AppError(
                409,
                "CONFLICT",
                "Não é possível trocar a conta bancária de um lançamento que já tem pagamento registrado. Desfaça a conciliação/baixa antes.",
            );
        }

        const item = await lancamentosService.update(empresaId, id, body, {
            status: decisao.status,
            limparQuitacao: decisao.limparQuitacao,
            // Vínculo criado entre a leitura e a escrita também trava esses campos.
            conflitoSeVinculado:
                alteradosTravaveis.length > 0 ? mensagemCamposTravados("conciliacao", alteradosTravaveis) : undefined,
        });
        return successResponse(res, item);
    }),
);

router.delete(
    "/lancamentos/:id",
    withPermission("financeiro:lancamentos:deletar"),
    asyncHandler(async (req, res) => {
        const {id} = lancamentoIdParamSchema.parse(req.params);
        const result = await lancamentosService.remove(requireTenant(req).empresaId, id);
        return successResponse(res, result);
    }),
);

export default router;