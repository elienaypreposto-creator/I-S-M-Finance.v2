import {Router} from "express";
import {z} from "zod";
import {and, desc, eq, ne} from "drizzle-orm";
import {db} from "@workspace/db";
import {empresasTable} from "@workspace/db/schema";
import {withPermission} from "../middlewares/withPermission";
import {PERM} from "../constants/permissoes";
import {validateBody} from "../middlewares/validate";
import {errorResponse, successResponse} from "../utils/response";

const router = Router();

const createEmpresaBodySchema = z.object({
    razao_social: z.string().trim().min(2).max(180),
    nome_fantasia: z.string().trim().max(180).optional().nullable(),
    cnpj: z.string().trim().max(18).optional().nullable(),
    slug: z.string().trim().min(2).max(80).optional(),
    ativa: z.boolean().optional(),
});

const updateEmpresaBodySchema = z.object({
    razao_social: z.string().trim().min(2).max(180).optional(),
    nome_fantasia: z.string().trim().max(180).optional().nullable(),
    cnpj: z.string().trim().max(18).optional().nullable(),
    slug: z.string().trim().min(2).max(80).optional(),
    ativa: z.boolean().optional(),
});

type CreateEmpresaBody = z.infer<typeof createEmpresaBodySchema>;
type UpdateEmpresaBody = z.infer<typeof updateEmpresaBodySchema>;

function slugify(raw: string): string {
    const base = raw
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return base || "empresa";
}

async function uniqueSlug(desired: string, exceptId?: number): Promise<string> {
    let candidate = desired;
    for (let i = 0; i < 50; i++) {
        const [hit] = await db
            .select({id: empresasTable.id})
            .from(empresasTable)
            .where(
                exceptId
                    ? and(eq(empresasTable.slug, candidate), ne(empresasTable.id, exceptId))
                    : eq(empresasTable.slug, candidate),
            )
            .limit(1);
        if (!hit) return candidate;
        candidate = `${desired.slice(0, 50)}-${i + 2}`;
    }
    return `${desired}-${Date.now()}`;
}

router.get("/empresas", withPermission(PERM.ADMIN_EMPRESAS_LISTAR), async (req, res) => {
    try {
        const items = await db.select().from(empresasTable).orderBy(desc(empresasTable.id));
        return successResponse(res, items);
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao listar empresas.", e);
    }
});

router.post("/empresas", withPermission(PERM.ADMIN_EMPRESAS_CRIAR), validateBody(createEmpresaBodySchema), async (req, res) => {
    try {
        const body = req.body as CreateEmpresaBody;
        const slug = await uniqueSlug(slugify(body.slug || body.razao_social));
        const cnpj = body.cnpj?.replace(/\D/g, "") || null;

        if (cnpj) {
            const [dup] = await db
                .select({id: empresasTable.id})
                .from(empresasTable)
                .where(eq(empresasTable.cnpj, cnpj))
                .limit(1);
            if (dup) {
                return errorResponse(res, 422, "CNPJ_DUPLICADO", "Já existe uma empresa com este CNPJ.");
            }
        }

        const [item] = await db
            .insert(empresasTable)
            .values({
                razao_social: body.razao_social,
                nome_fantasia: body.nome_fantasia?.trim() || null,
                cnpj,
                slug,
                ativa: body.ativa ?? true,
            })
            .returning();

        return successResponse(res, item, null, 201);
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao criar empresa.", e);
    }
});

router.patch("/empresas/:id", withPermission(PERM.ADMIN_EMPRESAS_EDITAR), validateBody(updateEmpresaBodySchema), async (req, res) => {
    try {
        const id = parseInt(String(req.params.id), 10);
        if (!Number.isInteger(id) || id <= 0) {
            return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");
        }

        const body = req.body as UpdateEmpresaBody;
        const patch: {
            updated_at: Date;
            razao_social?: string;
            nome_fantasia?: string | null;
            cnpj?: string | null;
            slug?: string;
            ativa?: boolean;
        } = {updated_at: new Date()};

        if (body.razao_social !== undefined) patch.razao_social = body.razao_social;
        if (body.nome_fantasia !== undefined) patch.nome_fantasia = body.nome_fantasia?.trim() || null;
        if (body.ativa !== undefined) patch.ativa = body.ativa;
        if (body.slug !== undefined) patch.slug = await uniqueSlug(slugify(body.slug), id);
        if (body.cnpj !== undefined) {
            const cnpj = body.cnpj?.replace(/\D/g, "") || null;
            if (cnpj) {
                const [dup] = await db
                    .select({id: empresasTable.id})
                    .from(empresasTable)
                    .where(and(eq(empresasTable.cnpj, cnpj), ne(empresasTable.id, id)))
                    .limit(1);
                if (dup) {
                    return errorResponse(res, 422, "CNPJ_DUPLICADO", "Já existe uma empresa com este CNPJ.");
                }
            }
            patch.cnpj = cnpj;
        }

        const [item] = await db
            .update(empresasTable)
            .set(patch)
            .where(eq(empresasTable.id, id))
            .returning();

        if (!item) return errorResponse(res, 404, "NOT_FOUND", "Empresa não encontrada.");
        return successResponse(res, item);
    } catch (e) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao atualizar empresa.", e);
    }
});

export default router;
