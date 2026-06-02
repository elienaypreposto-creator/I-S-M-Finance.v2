import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { validateBody } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { departamentosService } from "./departamentos.service";
import {
  type CreateDepartamentoBody,
  type UpdateDepartamentoBody,
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
  withPermission("configuracoes:departamentos:criar"),
  validateBody(createDepartamentoBodySchema),
  asyncHandler(async (req, res) => {
    const item = await departamentosService.create(req.body as CreateDepartamentoBody);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/departamentos/:id",
  withPermission("configuracoes:departamentos:editar"),
  validateBody(updateDepartamentoBodySchema),
  asyncHandler(async (req, res) => {
    const { id } = departamentoIdParamSchema.parse(req.params);
    const item = await departamentosService.update(id, req.body as UpdateDepartamentoBody);
    return successResponse(res, item);
  }),
);

router.delete(
  "/departamentos/:id",
  withPermission("configuracoes:departamentos:deletar"),
  asyncHandler(async (req, res) => {
    const { id } = departamentoIdParamSchema.parse(req.params);
    const result = await departamentosService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;
