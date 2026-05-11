import { Router } from "express";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { departamentosService } from "./departamentos.service";
import {
  createDepartamentoBodySchema,
  departamentoIdParamSchema,
  updateDepartamentoBodySchema,
} from "./schemas";

const router = Router();

router.get(
  "/departamentos",
  asyncHandler(async (_req, res) => {
    const items = await departamentosService.list();
    return successResponse(res, items);
  }),
);

router.post(
  "/departamentos",
  asyncHandler(async (req, res) => {
    const payload = createDepartamentoBodySchema.parse(req.body);
    const item = await departamentosService.create(payload);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/departamentos/:id",
  asyncHandler(async (req, res) => {
    const { id } = departamentoIdParamSchema.parse(req.params);
    const payload = updateDepartamentoBodySchema.parse(req.body);
    const item = await departamentosService.update(id, payload);
    return successResponse(res, item);
  }),
);

router.delete(
  "/departamentos/:id",
  asyncHandler(async (req, res) => {
    const { id } = departamentoIdParamSchema.parse(req.params);
    const result = await departamentosService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;
