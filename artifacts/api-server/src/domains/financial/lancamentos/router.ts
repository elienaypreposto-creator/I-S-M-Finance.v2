import { Router } from "express";
import { requirePermission } from "../../../middlewares/auth";
import { asyncHandler } from "../../../utils/async-handler";
import { successResponse } from "../../../utils/response";
import { lancamentosService } from "./lancamentos.service";
import {
  createLancamentoBodySchema,
  lancamentoIdParamSchema,
  listLancamentosQuerySchema,
  updateLancamentoBodySchema,
} from "./schemas";

const router = Router();

router.get(
  "/lancamentos",
  asyncHandler(async (req, res) => {
    const query = listLancamentosQuerySchema.parse(req.query);
    const result = await lancamentosService.list(query);
    return successResponse(res, result.items, result.meta);
  }),
);

router.post(
  "/lancamentos",
  asyncHandler(async (req, res) => {
    const payload = createLancamentoBodySchema.parse(req.body);
    const item = await lancamentosService.create(payload);
    return successResponse(res, item, null, 201);
  }),
);

router.get(
  "/lancamentos/:id",
  asyncHandler(async (req, res) => {
    const { id } = lancamentoIdParamSchema.parse(req.params);
    const item = await lancamentosService.getById(id);
    return successResponse(res, item);
  }),
);

router.put(
  "/lancamentos/:id",
  asyncHandler(async (req, res) => {
    const { id } = lancamentoIdParamSchema.parse(req.params);
    const payload = updateLancamentoBodySchema.parse(req.body);
    const item = await lancamentosService.update(id, payload);
    return successResponse(res, item);
  }),
);

router.delete(
  "/lancamentos/:id",
  requirePermission("Baixa de Contas a Pagar"),
  asyncHandler(async (req, res) => {
    const { id } = lancamentoIdParamSchema.parse(req.params);
    const result = await lancamentosService.remove(id);
    return successResponse(res, result);
  }),
);

export default router;

