import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { contasBancariasService } from "./contas-bancarias.service";
import {
  contaBancariaIdParamSchema,
  createContaBancariaBodySchema,
  updateContaBancariaBodySchema,
} from "./schemas";

const router = Router();

router.get(
  "/contas-bancarias",
  asyncHandler(async (_req, res) => {
    const items = await contasBancariasService.list();
    return successResponse(res, items);
  }),
);

router.post(
  "/contas-bancarias",
  withPermission("configuracoes:contas-bancarias:criar"),
  asyncHandler(async (req, res) => {
    const payload = createContaBancariaBodySchema.parse(req.body);
    const item = await contasBancariasService.create(payload);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/contas-bancarias/:id",
  withPermission("configuracoes:contas-bancarias:editar"),
  asyncHandler(async (req, res) => {
    const { id } = contaBancariaIdParamSchema.parse(req.params);
    const payload = updateContaBancariaBodySchema.parse(req.body);
    const item = await contasBancariasService.update(id, payload);
    return successResponse(res, item);
  }),
);

router.delete(
  "/contas-bancarias/:id",
  withPermission("configuracoes:contas-bancarias:deletar"),
  asyncHandler(async (req, res) => {
    const { id } = contaBancariaIdParamSchema.parse(req.params);
    const result = await contasBancariasService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;
