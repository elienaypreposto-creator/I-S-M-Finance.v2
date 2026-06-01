import {Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {successResponse} from "../../../utils/response";
import {lancamentosService} from "./lancamentos.service";
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
        const result = await lancamentosService.list(query);
        return successResponse(res, result.items, result.meta);
    }),
);

router.post(
    "/lancamentos",
    withPermission("financeiro:lancamentos:criar"),
    validateBody(createLancamentoBodySchema),
    asyncHandler(async (req, res) => {
        const item = await lancamentosService.create(req.body as CreateLancamentoBody);
        return successResponse(res, item, null, 201);
    }),
);

router.get(
    "/lancamentos/:id",
    asyncHandler(async (req, res) => {
        const {id} = lancamentoIdParamSchema.parse(req.params);
        const item = await lancamentosService.getById(id);
        return successResponse(res, item);
    }),
);

router.put(
    "/lancamentos/:id",
    withPermission("financeiro:lancamentos:editar"),
    validateBody(updateLancamentoBodySchema),
    asyncHandler(async (req, res) => {
        const {id} = lancamentoIdParamSchema.parse(req.params);
        const item = await lancamentosService.update(id, req.body as UpdateLancamentoBody);
        return successResponse(res, item);
    }),
);

router.delete(
    "/lancamentos/:id",
    withPermission("financeiro:lancamentos:deletar"),
    asyncHandler(async (req, res) => {
        const {id} = lancamentoIdParamSchema.parse(req.params);
        const result = await lancamentosService.remove(id);
        return successResponse(res, result);
    }),
);

export default router;

