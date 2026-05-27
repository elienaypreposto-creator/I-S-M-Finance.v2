import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { planoContasService } from "./plano-contas.service";
import {
  createPlanoContaBodySchema,
  planoContaIdParamSchema,
  updatePlanoContaBodySchema,
} from "./schemas";

const router = Router();

router.get(
  "/plano-contas",
  asyncHandler(async (_req, res) => {
    const items = await planoContasService.list();
    return successResponse(res, items);
  }),
);

router.post(
  "/plano-contas",
  withPermission("configuracoes:plano-contas:criar"),
  asyncHandler(async (req, res) => {
    const payload = createPlanoContaBodySchema.parse(req.body);
    const item = await planoContasService.create(payload);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/plano-contas/:id",
  withPermission("configuracoes:plano-contas:editar"),
  asyncHandler(async (req, res) => {
    const { id } = planoContaIdParamSchema.parse(req.params);
    const payload = updatePlanoContaBodySchema.parse(req.body);
    const item = await planoContasService.update(id, payload);
    return successResponse(res, item);
  }),
);

router.delete(
  "/plano-contas/:id",
  withPermission("configuracoes:plano-contas:deletar"),
  asyncHandler(async (req, res) => {
    const { id } = planoContaIdParamSchema.parse(req.params);
    const result = await planoContasService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;
