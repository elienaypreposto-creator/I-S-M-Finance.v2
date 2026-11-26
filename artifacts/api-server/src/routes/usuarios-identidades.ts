/**
 * Vínculo do usuário com a identidade dele no GovADM (login vindo do GovADM, Fase 1).
 *
 * GET    /usuarios/:id/identidades-externas                - Lista os vínculos do usuário
 * POST   /usuarios/:id/identidades-externas                - Cria vínculo (provedor fixo "govadm")
 * DELETE /usuarios/:id/identidades-externas/:identidadeId  - Remove vínculo
 *
 * Mesma permissão da edição de usuário (admin:usuarios:editar) e mesmo escopo: o alvo
 * precisa ter vínculo ativo com a empresa da sessão (404 caso contrário, como em PUT /usuarios/:id).
 * Superadmin não pode ser vinculado (o acesso irrestrito só entra por senha).
 */

import {Router} from "express";
import {z} from "zod";
import {and, asc, eq, or} from "drizzle-orm";
import {db} from "@workspace/db";
import {usuarioIdentidadesExternasTable, usuariosTable} from "@workspace/db/schema";
import {requireTenant} from "../lib/tenant-scope";
import {withPermission} from "../middlewares/withPermission";
import {validateBody} from "../middlewares/validate";
import {errorResponse, successResponse} from "../utils/response";
import {PERM} from "../constants/permissoes";
import {targetPertenceAEmpresa} from "./usuarios";

const IDENTIFICADOR_RE = /^[A-Za-z0-9_.:-]+$/;

const comoTexto = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? String(v) : v);

const criarIdentidadeBodySchema = z.object({
    sujeito_externo: z.preprocess(
        comoTexto,
        z.string().trim().min(1, "Informe o id do usuário no GovADM.").max(64)
            .regex(/^[A-Za-z0-9_.-]+$/, "Id do usuário no GovADM inválido."),
    ),
    emissor: z.string().trim().min(1).max(100).regex(IDENTIFICADOR_RE, "Emissor inválido.").optional(),
    empresa_id_padrao: z.number().int().positive().nullable().optional(),
});
type CriarIdentidadeBody = z.infer<typeof criarIdentidadeBodySchema>;

const COLUNAS_PUBLICAS = {
    id: usuarioIdentidadesExternasTable.id,
    provedor: usuarioIdentidadesExternasTable.provedor,
    emissor: usuarioIdentidadesExternasTable.emissor,
    sujeito_externo: usuarioIdentidadesExternasTable.sujeito_externo,
    empresa_id_padrao: usuarioIdentidadesExternasTable.empresa_id_padrao,
    ativo: usuarioIdentidadesExternasTable.ativo,
    created_at: usuarioIdentidadesExternasTable.created_at,
    ultimo_uso_em: usuarioIdentidadesExternasTable.ultimo_uso_em,
} as const;

function idDoParam(raw: unknown): number | null {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function violacaoDeUnico(e: unknown): boolean {
    const code = (x: unknown) => (typeof x === "object" && x !== null && "code" in x ? String((x as {code: unknown}).code) : "");
    return code(e) === "23505" || code((e as {cause?: unknown} | null)?.cause) === "23505";
}

const router = Router();

router.get(
    "/usuarios/:id/identidades-externas",
    withPermission(PERM.ADMIN_USUARIOS_EDITAR),
    async (req, res) => {
        try {
            const id = idDoParam(req.params.id);
            if (!id) return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");

            const {empresaId} = requireTenant(req);
            if (!(await targetPertenceAEmpresa(id, empresaId))) {
                return errorResponse(res, 404, "NOT_FOUND", "Usuário não encontrado.");
            }

            const itens = await db
                .select(COLUNAS_PUBLICAS)
                .from(usuarioIdentidadesExternasTable)
                .where(eq(usuarioIdentidadesExternasTable.usuario_id, id))
                .orderBy(asc(usuarioIdentidadesExternasTable.id));

            return successResponse(res, itens);
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar vínculos externos.", e);
        }
    },
);

router.post(
    "/usuarios/:id/identidades-externas",
    withPermission(PERM.ADMIN_USUARIOS_EDITAR),
    validateBody(criarIdentidadeBodySchema),
    async (req, res) => {
        try {
            const id = idDoParam(req.params.id);
            if (!id) return errorResponse(res, 400, "VALIDATION_ERROR", "ID de usuário inválido.");

            const {empresaId} = requireTenant(req);
            if (!(await targetPertenceAEmpresa(id, empresaId))) {
                return errorResponse(res, 404, "NOT_FOUND", "Usuário não encontrado.");
            }

            const body = req.body as CriarIdentidadeBody;
            const emissor = body.emissor ?? process.env.GOVADM_EMISSOR?.trim();
            if (!emissor) {
                return errorResponse(res, 400, "VALIDATION_ERROR", "Informe o emissor (GOVADM_EMISSOR não configurado).");
            }

            const [alvo] = await db
                .select({superadmin: usuariosTable.superadmin})
                .from(usuariosTable)
                .where(eq(usuariosTable.id, id))
                .limit(1);
            if (!alvo) return errorResponse(res, 404, "NOT_FOUND", "Usuário não encontrado.");
            if (alvo.superadmin) {
                return errorResponse(
                    res,
                    400,
                    "SUPERADMIN_NAO_VINCULAVEL",
                    "Superadmin não pode ser vinculado ao GovADM: o acesso dele é só por senha.",
                );
            }

            // Empresa padrão: a empresa da sessão (superadmin: qualquer uma com vínculo ativo do alvo).
            const padrao = body.empresa_id_padrao ?? null;
            if (padrao !== null) {
                const permitida = padrao === empresaId || req.user!.superadmin;
                if (!permitida || !(await targetPertenceAEmpresa(id, padrao))) {
                    return errorResponse(
                        res,
                        400,
                        "EMPRESA_PADRAO_INVALIDA",
                        "A empresa padrão precisa ser a empresa atual, com vínculo ativo do usuário.",
                    );
                }
            }

            // Checagem prévia para o caso comum; o índice único continua sendo a garantia (corrida).
            const [conflito] = await db
                .select({id: usuarioIdentidadesExternasTable.id})
                .from(usuarioIdentidadesExternasTable)
                .where(and(
                    eq(usuarioIdentidadesExternasTable.provedor, "govadm"),
                    eq(usuarioIdentidadesExternasTable.emissor, emissor),
                    or(
                        eq(usuarioIdentidadesExternasTable.usuario_id, id),
                        eq(usuarioIdentidadesExternasTable.sujeito_externo, body.sujeito_externo),
                    ),
                ))
                .limit(1);
            if (conflito) return respostaDuplicado(res);

            const [item] = await db
                .insert(usuarioIdentidadesExternasTable)
                .values({
                    provedor: "govadm",
                    emissor,
                    sujeito_externo: body.sujeito_externo,
                    usuario_id: id,
                    empresa_id_padrao: padrao,
                    ativo: true,
                    criado_por: req.user!.id,
                })
                .returning(COLUNAS_PUBLICAS);

            return successResponse(res, item, null, 201);
        } catch (e: unknown) {
            if (violacaoDeUnico(e)) return respostaDuplicado(res);
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar vínculo externo.", e);
        }
    },
);

function respostaDuplicado(res: Parameters<typeof errorResponse>[0]) {
    return errorResponse(
        res,
        409,
        "VINCULO_DUPLICADO",
        "Este usuário já tem vínculo com o GovADM, ou este id do GovADM já está vinculado a outro usuário.",
    );
}

router.delete(
    "/usuarios/:id/identidades-externas/:identidadeId",
    withPermission(PERM.ADMIN_USUARIOS_EDITAR),
    async (req, res) => {
        try {
            const id = idDoParam(req.params.id);
            const identidadeId = idDoParam(req.params.identidadeId);
            if (!id || !identidadeId) return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");

            const {empresaId} = requireTenant(req);
            if (!(await targetPertenceAEmpresa(id, empresaId))) {
                return errorResponse(res, 404, "NOT_FOUND", "Usuário não encontrado.");
            }

            const [removido] = await db
                .delete(usuarioIdentidadesExternasTable)
                .where(and(
                    eq(usuarioIdentidadesExternasTable.id, identidadeId),
                    eq(usuarioIdentidadesExternasTable.usuario_id, id),
                ))
                .returning(COLUNAS_PUBLICAS);

            if (!removido) return errorResponse(res, 404, "NOT_FOUND", "Vínculo não encontrado.");

            req.auditAntes = removido;
            return successResponse(res, {id: removido.id}, {message: "Vínculo removido."});
        } catch (e: unknown) {
            return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao remover vínculo externo.", e);
        }
    },
);

export default router;
