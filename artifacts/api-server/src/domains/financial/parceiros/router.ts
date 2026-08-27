import {type Request, type Response, Router} from "express";
import {withPermission} from "../../../middlewares/withPermission";
import {validateBody} from "../../../middlewares/validate";
import {asyncHandler} from "../../../utils/async-handler";
import {errorResponse, successResponse} from "../../../utils/response";
import {AppError} from "../../../utils/app-error";
import {parceirosService} from "./parceiros.service";
import {
    type CreateParceiroBody,
    type UpdateParceiroBody,
    createParceiroBodySchema,
    listParceirosQuerySchema,
    parceiroIdParamSchema,
    updateParceiroBodySchema,
} from "./schemas";

const router = Router();

function isAppError(e: unknown): e is AppError {
    return (
        e instanceof Error &&
        e.name === "AppError" &&
        typeof (e as AppError).statusCode === "number" &&
        typeof (e as AppError).code === "string"
    );
}

/** Centraliza a tradução de AppError -> errorResponse para este router. */
function handleServiceError(e: unknown, res: Response): Response {
    if (isAppError(e)) {
        return errorResponse(res, e.statusCode, e.code, e.message);
    }
    console.error("[parceiros] Erro inesperado:", e);
    return errorResponse(res, 500, "INTERNAL_ERROR", "Erro interno do servidor.");
}

router.get(
    "/parceiros",
    asyncHandler(async (req, res) => {
        const query = listParceirosQuerySchema.parse(req.query);
        const result = await parceirosService.list(query);
        return successResponse(res, result.items, result.meta);
    }),
);

router.post(
    "/parceiros",
    withPermission("financeiro:parceiros:criar"),
    validateBody(createParceiroBodySchema),
    async (req: Request, res: Response) => {
        try {
            const item = await parceirosService.create(req.body as CreateParceiroBody);
            return successResponse(res, item, null, 201);
        } catch (e: unknown) {
            return handleServiceError(e, res);
        }
    },
);

router.get(
    "/parceiros/:id",
    asyncHandler(async (req, res) => {
        const {id} = parceiroIdParamSchema.parse(req.params);
        const item = await parceirosService.getById(id);
        return successResponse(res, item);
    }),
);

router.put(
    "/parceiros/:id",
    withPermission("financeiro:parceiros:editar"),
    validateBody(updateParceiroBodySchema),
    async (req: Request, res: Response) => {
        try {
            const {id} = parceiroIdParamSchema.parse(req.params);
            const item = await parceirosService.update(id, req.body as UpdateParceiroBody);
            return successResponse(res, item);
        } catch (e: unknown) {
            return handleServiceError(e, res);
        }
    },
);

router.delete(
    "/parceiros/:id",
    withPermission("financeiro:parceiros:deletar"),
    asyncHandler(async (req, res) => {
        const {id} = parceiroIdParamSchema.parse(req.params);
        const result = await parceirosService.remove(id);
        return successResponse(res, result);
    }),
);

export default router;

