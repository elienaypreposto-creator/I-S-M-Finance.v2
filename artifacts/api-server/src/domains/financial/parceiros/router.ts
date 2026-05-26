import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { parceirosService } from "./parceiros.service";
import {
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
  asyncHandler(async (req, res) => {
    const payload = createParceiroBodySchema.parse(req.body);
    const item = await parceirosService.create(payload);
    return successResponse(res, item, null, 201);
  }),
);

router.get(
  "/parceiros/:id",
  asyncHandler(async (req, res) => {
    const { id } = parceiroIdParamSchema.parse(req.params);
    const item = await parceirosService.getById(id);
    return successResponse(res, item);
  }),
);

router.put(
  "/parceiros/:id",
  withPermission("financeiro:parceiros:editar"),
  asyncHandler(async (req, res) => {
    const { id } = parceiroIdParamSchema.parse(req.params);
    const payload = updateParceiroBodySchema.parse(req.body);
    const item = await parceirosService.update(id, payload);
    return successResponse(res, item);
  }),
);

router.delete(
  "/parceiros/:id",
  withPermission("financeiro:parceiros:deletar"),
  asyncHandler(async (req, res) => {
    const { id } = parceiroIdParamSchema.parse(req.params);
    const result = await parceirosService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;

