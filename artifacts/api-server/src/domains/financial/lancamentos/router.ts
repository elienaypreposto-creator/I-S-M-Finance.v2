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
import {
    type CreateLancamentoBody,
    type UpdateLancamentoBody,
    createLancamentoBodySchema,
    lancamentoIdParamSchema,
    listLancamentosQuerySchema,
    updateLancamentoBodySchema,
} from "./schemas";

const router = Router();

router.get(
    "/lancamentos",
    asyncHandler(async (req, res) => {
        const query = listLancamentosQuerySchema.parse(req.query);
        const result = await lancamentosService.list(requireTenant(req).empresaId, query);
        return successResponse(res, result.items, result.meta);
    }),
);

router.post(
    "/lancamentos",
    withPermission("financeiro:lancamentos:criar"),
    validateBody(createLancamentoBodySchema),
    asyncHandler(async (req, res) => {
        const item = await lancamentosService.create(requireTenant(req).empresaId, req.body as CreateLancamentoBody);
        return successResponse(res, item, null, 201);
    }),
);

router.get(
    "/lancamentos/:id",
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

        // FEAT-09: alterar valor exige permissão dedicada (negada ao usuário comum).
        if (body.valor !== undefined) {
            const atual = await lancamentosService.getById(requireTenant(req).empresaId, id);
            const valorNovo = Number(body.valor);
            const valorAtual = Number(atual.valor);
            if (
                Number.isFinite(valorNovo) &&
                Number.isFinite(valorAtual) &&
                Math.round(valorNovo * 100) !== Math.round(valorAtual * 100)
            ) {
                const perms = req.user?.permissions ?? [];
                if (!hasPermission(perms, PERM.LANCAMENTOS_ALTERAR_VALOR)) {
                    throw new AppError(
                        403,
                        "FORBIDDEN",
                        `Acesso negado: permissão "${PERM.LANCAMENTOS_ALTERAR_VALOR}" necessária para alterar o valor.`,
                    );
                }
            }
        }

        const item = await lancamentosService.update(requireTenant(req).empresaId, id, body);
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