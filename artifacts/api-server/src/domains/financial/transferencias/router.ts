import {Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {successResponse} from "../../../utils/response";
import {
    deleteTransfer,
    executeTransfer,
    listTransferencias,
    updateTransfer,
} from "./transferencias.service";
import {requireTenant} from "../../../lib/tenant-scope";
import {
    createTransferenciaBodySchema,
    updateTransferenciaBodySchema,
    type CreateTransferenciaBody,
    type UpdateTransferenciaBody,
} from "./schemas";

const router = Router();

router.get(
    "/transferencias",
    withPermission("financeiro:transferencias:criar"),
    asyncHandler(async (req, res) => {
        const items = await listTransferencias(requireTenant(req).empresaId);
        return successResponse(res, items, {total: items.length});
    }),
);

router.post(
    "/transferencias",
    withPermission("financeiro:transferencias:criar"),
    validateBody(createTransferenciaBodySchema),
    asyncHandler(async (req, res) => {
        const result = await executeTransfer(requireTenant(req).empresaId, req.body as CreateTransferenciaBody);
        return successResponse(res, result, null, 201);
    }),
);

router.put(
    "/transferencias/:grupo_id",
    withPermission("admin:transferencias:editar"),
    validateBody(updateTransferenciaBodySchema),
    asyncHandler(async (req, res) => {
        const result = await updateTransfer(
            requireTenant(req).empresaId,
            String(req.params.grupo_id),
            req.body as UpdateTransferenciaBody,
        );
        return successResponse(res, result);
    }),
);

router.delete(
    "/transferencias/:grupo_id",
    withPermission("admin:transferencias:deletar"),
    asyncHandler(async (req, res) => {
        const result = await deleteTransfer(requireTenant(req).empresaId, String(req.params.grupo_id));
        return successResponse(res, result);
    }),
);

export default router;
