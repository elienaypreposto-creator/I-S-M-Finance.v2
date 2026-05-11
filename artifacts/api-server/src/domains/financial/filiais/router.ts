import { Router } from "express";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { filiaisService } from "./filiais.service";
import { createFilialBodySchema, filialIdParamSchema, updateFilialBodySchema } from "./schemas";

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
  asyncHandler(async (req, res) => {
    const payload = createFilialBodySchema.parse(req.body);
    const item = await filiaisService.create(payload);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/filiais/:id",
  asyncHandler(async (req, res) => {
    const { id } = filialIdParamSchema.parse(req.params);
    const payload = updateFilialBodySchema.parse(req.body);
    const item = await filiaisService.update(id, payload);
    return successResponse(res, item);
  }),
);

router.delete(
  "/filiais/:id",
  asyncHandler(async (req, res) => {
    const { id } = filialIdParamSchema.parse(req.params);
    const result = await filiaisService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;
