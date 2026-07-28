import {Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {successResponse} from "../../../utils/response";
import {regrasConciliacaoService} from "./regras-conciliacao.service";
import {
    type CreateRegraConciliacaoBody,
    type UpdateRegraConciliacaoBody,
    createRegraConciliacaoBodySchema,
    listRegrasConciliacaoQuerySchema,
    regraConciliacaoIdParamSchema,
    updateRegraConciliacaoBodySchema,
} from "./schemas";

const router = Router();

router.get(
    "/regras-conciliacao",
    asyncHandler(async (req, res) => {
        const query = listRegrasConciliacaoQuerySchema.parse(req.query);
        const items = await regrasConciliacaoService.list(query);
        return successResponse(res, items);
    }),
);

router.post(
    "/regras-conciliacao",
    withPermission("financeiro:regras-conciliacao:criar"),
    validateBody(createRegraConciliacaoBodySchema),
    asyncHandler(async (req, res) => {
        const item = await regrasConciliacaoService.create(req.body as CreateRegraConciliacaoBody);
        return successResponse(res, item, null, 201);
    }),
);

router.put(
    "/regras-conciliacao/:id",
    withPermission("financeiro:regras-conciliacao:editar"),
    validateBody(updateRegraConciliacaoBodySchema),
    asyncHandler(async (req, res) => {
        const {id} = regraConciliacaoIdParamSchema.parse(req.params);
        const item = await regrasConciliacaoService.update(id, req.body as UpdateRegraConciliacaoBody);
        return successResponse(res, item);
    }),
);

router.delete(
    "/regras-conciliacao/:id",
    withPermission("financeiro:regras-conciliacao:deletar"),
    asyncHandler(async (req, res) => {
        const {id} = regraConciliacaoIdParamSchema.parse(req.params);
        const result = await regrasConciliacaoService.remove(id);
        return successResponse(res, result);
    }),
);

export default router;