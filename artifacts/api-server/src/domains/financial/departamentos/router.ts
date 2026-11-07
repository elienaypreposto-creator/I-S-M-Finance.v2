import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { validateBody } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { departamentosService } from "./departamentos.service";
import { requireTenant } from "../../../lib/tenant-scope";
import {
  type CreateCentroCustoBody,
  type CreateDepartamentoBody,
  type UpdateCentroCustoBody,
  type UpdateDepartamentoBody,
  centroCustoIdParamSchema,
  createCentroCustoBodySchema,
  createDepartamentoBodySchema,
  departamentoIdParamSchema,
  listCentrosCustosQuerySchema,
  updateCentroCustoBodySchema,
  updateDepartamentoBodySchema,
} from "./schemas";

const router = Router();

router.get(
  "/departamentos",
  asyncHandler(async (req, res) => {
    const items = await departamentosService.list(requireTenant(req).empresaId);
    return successResponse(res, items);
  }),
);

router.get(
  "/centros-custos",
  asyncHandler(async (req, res) => {
    const query = listCentrosCustosQuerySchema.parse(req.query);
    const items = await departamentosService.listCentrosCustos(requireTenant(req).empresaId, query);
    return successResponse(res, items);
  }),
);

// Centros de custo são parte do cadastro de departamentos: mesmas permissões.
router.post(
  "/centros-custos",
  withPermission("configuracoes:departamentos:criar"),
  validateBody(createCentroCustoBodySchema),
  asyncHandler(async (req, res) => {
    const item = await departamentosService.createCentroCusto(
      requireTenant(req).empresaId,
      req.body as CreateCentroCustoBody,
    );
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/centros-custos/:id",
  withPermission("configuracoes:departamentos:editar"),
  validateBody(updateCentroCustoBodySchema),
  asyncHandler(async (req, res) => {
    const { id } = centroCustoIdParamSchema.parse(req.params);
    const item = await departamentosService.updateCentroCusto(
      requireTenant(req).empresaId,
      id,
      req.body as UpdateCentroCustoBody,
    );
    return successResponse(res, item);
  }),
);

router.delete(
  "/centros-custos/:id",
  withPermission("configuracoes:departamentos:deletar"),
  asyncHandler(async (req, res) => {
    const { id } = centroCustoIdParamSchema.parse(req.params);
    const result = await departamentosService.removeCentroCusto(requireTenant(req).empresaId, id);
    return successResponse(res, result);
  }),
);

router.post(
  "/departamentos",
  withPermission("configuracoes:departamentos:criar"),
  validateBody(createDepartamentoBodySchema),
  asyncHandler(async (req, res) => {
    const item = await departamentosService.create(requireTenant(req).empresaId, req.body as CreateDepartamentoBody);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/departamentos/:id",
  withPermission("configuracoes:departamentos:editar"),
  validateBody(updateDepartamentoBodySchema),
  asyncHandler(async (req, res) => {
    const { id } = departamentoIdParamSchema.parse(req.params);
    const item = await departamentosService.update(requireTenant(req).empresaId, id, req.body as UpdateDepartamentoBody);
    return successResponse(res, item);
  }),
);

router.delete(
  "/departamentos/:id",
  withPermission("configuracoes:departamentos:deletar"),
  asyncHandler(async (req, res) => {
    const { id } = departamentoIdParamSchema.parse(req.params);
    const result = await departamentosService.remove(requireTenant(req).empresaId, id);
    return successResponse(res, result);
  }),
);

export default router;
