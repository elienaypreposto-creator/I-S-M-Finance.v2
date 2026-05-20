import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
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
  withPermission("configuracoes:departamentos:criar"),
  asyncHandler(async (req, res) => {
    const payload = createDepartamentoBodySchema.parse(req.body);
    const item = await departamentosService.create(payload);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/departamentos/:id",
  withPermission("configuracoes:departamentos:editar"),
  asyncHandler(async (req, res) => {
    const { id } = departamentoIdParamSchema.parse(req.params);
    const payload = updateDepartamentoBodySchema.parse(req.body);
    const item = await departamentosService.update(id, payload);
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
