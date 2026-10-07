import {createReadStream} from "node:fs";
import {Router} from "express";
import {z} from "zod";
import {withSuperadmin} from "../middlewares/withSuperadmin";
import {validateBody} from "../middlewares/validate";
import {errorResponse, successResponse} from "../utils/response";
import {consumirDesafio, emitirDesafio} from "../domains/lgpd/lgpd-desafio";
import {
    arquivoExportacao,
    eliminarEmpresa,
    iniciarExportacao,
    obterJobExportacao,
    obterJobPorToken,
} from "../domains/lgpd/lgpd-empresa";
import {withBypassRls} from "@workspace/db";
import {sql} from "drizzle-orm";

const router = Router();

const confirmacaoSchema = z.object({
    desafio: z.string().trim().min(20),
    confirmacao: z.string().trim().min(1),
});

function idParam(raw: unknown): number | null {
    const valor = Array.isArray(raw) ? raw[0] : raw;
    const id = typeof valor === "string" ? Number(valor) : NaN;
    if (!Number.isInteger(id) || id <= 0) return null;
    return id;
}

function textoQuery(raw: unknown): string | null {
    const valor = Array.isArray(raw) ? raw[0] : raw;
    return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function falhaConhecida(err: unknown): {status: number; code: string; message: string} | null {
    if (!err || typeof err !== "object") return null;
    const e = err as {statusCode?: number; code?: string; cause?: {code?: string}};
    if (e.statusCode === 404) {
        return {status: 404, code: "NOT_FOUND", message: "Empresa não encontrada."};
    }
    const pg = e.code === "23503" ? e.code : e.cause?.code;
    if (pg === "23503") {
        return {
            status: 409,
            code: "FK_AUDITORIA",
            message: "Aplique a migração 0024 antes de eliminar. A auditoria ainda referencia a empresa.",
        };
    }
    return null;
}

function responderJob(res: Parameters<typeof successResponse>[0], job: {id: string; status: string; token: string | null; expiraEm: number | null; erro: string | null}) {
    if (job.status === "processando") {
        return successResponse(res, {job_id: job.id, status: job.status}, null, 202);
    }
    if (job.status === "pronto" && job.token && job.expiraEm) {
        return successResponse(res, {
            job_id: job.id,
            status: job.status,
            url: `/api/admin/exportacoes/${job.token}`,
            expira_em: new Date(job.expiraEm).toISOString(),
        });
    }
    return errorResponse(res, 500, "EXPORTACAO_FALHOU", job.erro ?? "Falha ao montar o pacote.");
}

router.get("/admin/empresas/:id/export", withSuperadmin, async (req, res) => {
    const empresaId = idParam(req.params.id);
    if (!empresaId) return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const jobId = textoQuery(req.query.job_id);
    if (jobId) {
        const job = obterJobExportacao(jobId);
        if (!job || job.empresaId !== empresaId) {
            return errorResponse(res, 404, "NOT_FOUND", "Exportação não encontrada.");
        }
        return responderJob(res, job);
    }

    try {
        const job = await iniciarExportacao(empresaId);
        return responderJob(res, job);
    } catch (err) {
        const conhecida = falhaConhecida(err);
        if (conhecida) return errorResponse(res, conhecida.status, conhecida.code, conhecida.message);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao iniciar a exportação.", err);
    }
});

router.get("/admin/exportacoes/:token", withSuperadmin, (req, res) => {
    const token = textoQuery(req.params.token);
    if (!token) return errorResponse(res, 400, "VALIDATION_ERROR", "Link inválido.");

    const job = obterJobPorToken(token);
    const arquivo = job ? arquivoExportacao(job) : null;
    if (!job || !arquivo) {
        return errorResponse(res, 410, "LINK_EXPIRADO", "Link de exportação expirado ou inexistente.");
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="empresa-${job.empresaId}-lgpd.json"`);
    res.setHeader("Cache-Control", "no-store");

    const stream = createReadStream(arquivo);
    stream.on("error", (err) => {
        if (!res.headersSent) {
            errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao ler o pacote.", err);
        } else {
            res.destroy();
        }
    });
    stream.pipe(res);
    return;
});

router.post("/admin/empresas/:id/eliminacao", withSuperadmin, async (req, res) => {
    const empresaId = idParam(req.params.id);
    if (!empresaId) return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");

    try {
        const desafio = await withBypassRls(async (tx) => {
            const result = await tx.execute(sql`
                SELECT razao_social FROM empresas WHERE id = ${empresaId}
            `);
            const rows = Array.isArray(result)
                ? result as {razao_social?: string}[]
                : ((result as {rows?: {razao_social?: string}[]}).rows ?? []);
            return rows[0]?.razao_social ?? null;
        });
        if (!desafio) return errorResponse(res, 404, "NOT_FOUND", "Empresa não encontrada.");

        const emitido = emitirDesafio(empresaId, desafio);
        return successResponse(res, {
            desafio: emitido.token,
            expira_em: new Date(emitido.expiraEm).toISOString(),
            instrucao: "Repita a razão social exata no campo confirmacao do DELETE.",
        });
    } catch (err) {
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao emitir o desafio.", err);
    }
});

router.delete("/admin/empresas/:id", withSuperadmin, validateBody(confirmacaoSchema), async (req, res) => {
    const empresaId = idParam(req.params.id);
    if (!empresaId) return errorResponse(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body as z.infer<typeof confirmacaoSchema>;
    const confirmado = consumirDesafio(body.desafio, empresaId, body.confirmacao);
    if (!confirmado.ok) {
        const mapa = {
            DESAFIO_AUSENTE: {status: 428, message: "Emita o desafio antes de eliminar a empresa."},
            DESAFIO_EXPIRADO: {status: 410, message: "Desafio expirado. Emita outro."},
            CONFIRMACAO_DIVERGENTE: {status: 422, message: "A confirmação não é a razão social da empresa."},
            EMPRESA_DIVERGENTE: {status: 422, message: "O desafio não pertence a esta empresa."},
        } as const;
        const falha = mapa[confirmado.code];
        return errorResponse(res, falha.status, confirmado.code, falha.message);
    }

    try {
        const resultado = await eliminarEmpresa(empresaId, req.user?.id ?? null);
        return successResponse(res, {
            empresa_id: empresaId,
            eliminada: true,
            usuarios_anonimizados: resultado.usuariosAnonimizados,
            apagadas: resultado.apagadas,
        });
    } catch (err) {
        const conhecida = falhaConhecida(err);
        if (conhecida) return errorResponse(res, conhecida.status, conhecida.code, conhecida.message);
        return errorResponse(res, 500, "INTERNAL_ERROR", "Erro ao eliminar a empresa.", err);
    }
});

export default router;
