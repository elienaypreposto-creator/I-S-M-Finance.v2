import {Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {AppError} from "../../../utils/app-error";
import {successResponse} from "../../../utils/response";
import {contasBancariasService} from "./contas-bancarias.service";
import {
    type CreateContaBancariaBody,
    type UpdateContaBancariaBody,
    contaBancariaIdParamSchema,
    createContaBancariaBodySchema,
    updateContaBancariaBodySchema,
} from "./schemas";

const router = Router();

router.get(
    "/contas-bancarias",
    asyncHandler(async (_req, res) => {
        const items = await contasBancariasService.list();
        return successResponse(res, items);
    }),
);

/** DEF-03: saldo posicional ?data=YYYY-MM-DD */
router.get(
    "/contas-bancarias/:id/saldo",
    asyncHandler(async (req, res) => {
        const {id} = contaBancariaIdParamSchema.parse(req.params);
        const data = String(req.query.data ?? "");
        if (!data) {
            throw new AppError(400, "VALIDATION_ERROR", "Parâmetro obrigatório: data (YYYY-MM-DD).");
        }
        const item = await contasBancariasService.saldoNaData(id, data);
        return successResponse(res, item);
    }),
);

router.post(
    "/contas-bancarias",
    withPermission("configuracoes:contas-bancarias:criar"),
    validateBody(createContaBancariaBodySchema),
    asyncHandler(async (req, res) => {
        const item = await contasBancariasService.create(req.body as CreateContaBancariaBody);
        return successResponse(res, item, null, 201);
    }),
);

router.put(
    "/contas-bancarias/:id",
    withPermission("configuracoes:contas-bancarias:editar"),
    validateBody(updateContaBancariaBodySchema),
    asyncHandler(async (req, res) => {
        const {id} = contaBancariaIdParamSchema.parse(req.params);
        const item = await contasBancariasService.update(id, req.body as UpdateContaBancariaBody);
        return successResponse(res, item);
    }),
);

router.delete(
    "/contas-bancarias/:id",
    withPermission("configuracoes:contas-bancarias:deletar"),
    asyncHandler(async (req, res) => {
        const {id} = contaBancariaIdParamSchema.parse(req.params);
        const result = await contasBancariasService.remove(id);
        return successResponse(res, result);
    }),
);

export default router;
