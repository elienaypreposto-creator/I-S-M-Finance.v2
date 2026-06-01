import {Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {successResponse} from "../../../utils/response";
import {parceirosService} from "./parceiros.service";
import {
    type CreateParceiroBody,
    type UpdateParceiroBody,
    createParceiroBodySchema,
    listParceirosQuerySchema,
    parceiroIdParamSchema,
    updateParceiroBodySchema,
} from "./schemas";

const router = Router();

router.get(
    "/parceiros",
    asyncHandler(async (req, res) => {
        const query = listParceirosQuerySchema.parse(req.query);
        const result = await parceirosService.list(query);
        return successResponse(res, result.items, result.meta);
    }),
);

router.post(
    "/parceiros",
    withPermission("financeiro:parceiros:criar"),
    validateBody(createParceiroBodySchema),
    asyncHandler(async (req, res) => {
        const item = await parceirosService.create(req.body as CreateParceiroBody);
        return successResponse(res, item, null, 201);
    }),
);

router.get(
    "/parceiros/:id",
    asyncHandler(async (req, res) => {
        const {id} = parceiroIdParamSchema.parse(req.params);
        const item = await parceirosService.getById(id);
        return successResponse(res, item);
    }),
);

router.put(
    "/parceiros/:id",
    withPermission("financeiro:parceiros:editar"),
    validateBody(updateParceiroBodySchema),
    asyncHandler(async (req, res) => {
        const {id} = parceiroIdParamSchema.parse(req.params);
        const item = await parceirosService.update(id, req.body as UpdateParceiroBody);
        return successResponse(res, item);
    }),
);

router.delete(
    "/parceiros/:id",
    withPermission("financeiro:parceiros:deletar"),
    asyncHandler(async (req, res) => {
        const {id} = parceiroIdParamSchema.parse(req.params);
        const result = await parceirosService.remove(id);
        return successResponse(res, result);
    }),
);

export default router;

