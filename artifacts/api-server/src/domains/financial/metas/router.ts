import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { metasService } from "./metas.service";
import { listMetasQuerySchema, upsertMetaBodySchema } from "./schemas";

const router = Router();

router.get(
  "/metas",
  asyncHandler(async (req, res) => {
    const query = listMetasQuerySchema.parse(req.query);
    const items = await metasService.listByAno(query);
    return successResponse(res, items);
  }),
);

router.post(
  "/metas",
  withPermission("financeiro:metas:editar"),
  asyncHandler(async (req, res) => {
    const payload = upsertMetaBodySchema.parse(req.body);
    const item = await metasService.upsert(payload);
    return successResponse(res, item);
  }),
);

export default router;
