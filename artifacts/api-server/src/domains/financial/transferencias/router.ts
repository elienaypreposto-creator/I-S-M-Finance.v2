import {Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {successResponse} from "../../../utils/response";
import {executeTransfer} from "./transferencias.service";
import {createTransferenciaBodySchema, type CreateTransferenciaBody} from "./schemas";

const router = Router();

router.post(
    "/transferencias",
    withPermission("financeiro:transferencias:criar"),
    validateBody(createTransferenciaBodySchema),
    asyncHandler(async (req, res) => {
        const result = await executeTransfer(req.body as CreateTransferenciaBody);
        return successResponse(res, result, null, 201);
    }),
);

export default router;
