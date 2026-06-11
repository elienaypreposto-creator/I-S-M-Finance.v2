import { Router } from "express";
import { withPermission } from "../../../middlewares/withPermission";
import { validateBody } from "../../../middlewares/validate";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { planoContasService } from "./plano-contas.service";
import {
  type CreatePlanoContaBody,
  type UpdatePlanoContaBody,
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
  validateBody(createPlanoContaBodySchema),
  asyncHandler(async (req, res) => {
    const item = await planoContasService.create(req.body as CreatePlanoContaBody);
    return successResponse(res, item, null, 201);
  }),
);

router.put(
  "/plano-contas/:id",
  withPermission("configuracoes:plano-contas:editar"),
  validateBody(updatePlanoContaBodySchema),
  asyncHandler(async (req, res) => {
    const { id } = planoContaIdParamSchema.parse(req.params);
    const item = await planoContasService.update(id, req.body as UpdatePlanoContaBody);
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
