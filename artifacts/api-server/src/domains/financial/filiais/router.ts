import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { validateBody } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { filiaisService } from "./filiais.service";
import {
  type CreateFilialBody,
  type UpdateFilialBody,
  createFilialBodySchema,
  filialIdParamSchema,
  updateFilialBodySchema,
} from "./schemas";

const router = Router();

router.get(
  "/filiais",
  asyncHandler(async (_req, res) => {
    const items = await filiaisService.list();
    return successResponse(res, items);
  }),
);

router.post(
  "/filiais",
  withPermission("configuracoes:filiais:criar"),
  validateBody(createFilialBodySchema),
  asyncHandler(async (req, res) => {
    const item = await filiaisService.create(req.body as CreateFilialBody);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/filiais/:id",
  withPermission("configuracoes:filiais:editar"),
  validateBody(updateFilialBodySchema),
  asyncHandler(async (req, res) => {
    const { id } = filialIdParamSchema.parse(req.params);
    const item = await filiaisService.update(id, req.body as UpdateFilialBody);
    return successResponse(res, item);
  }),
);

router.delete(
  "/filiais/:id",
  withPermission("configuracoes:filiais:deletar"),
  asyncHandler(async (req, res) => {
    const { id } = filialIdParamSchema.parse(req.params);
    const result = await filiaisService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;
