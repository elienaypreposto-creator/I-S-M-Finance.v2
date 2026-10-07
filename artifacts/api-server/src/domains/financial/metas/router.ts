import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { validateBody } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { metasService } from "./metas.service";
import { requireTenant } from "../../../lib/tenant-scope";
import { type UpsertMetaBody, listMetasQuerySchema, upsertMetaBodySchema } from "./schemas";

const router = Router();

router.get(
  "/metas",
  asyncHandler(async (req, res) => {
    const query = listMetasQuerySchema.parse(req.query);
    const items = await metasService.listByAno(requireTenant(req).empresaId, query);
    return successResponse(res, items);
  }),
);

router.post(
  "/metas",
  withPermission("financeiro:metas:editar"),
  validateBody(upsertMetaBodySchema),
  asyncHandler(async (req, res) => {
    const item = await metasService.upsert(requireTenant(req).empresaId, req.body as UpsertMetaBody);
    return successResponse(res, item);
  }),
);

export default router;
