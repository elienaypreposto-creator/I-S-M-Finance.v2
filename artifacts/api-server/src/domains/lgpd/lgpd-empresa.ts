import {mkdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {sql} from "drizzle-orm";
import {withBypassRls, type TenantDb} from "@workspace/db";
import {
    TABELAS_ANTES_LANCAMENTOS,
    TABELAS_AUDITORIA,
    TABELAS_DEPOIS_LANCAMENTOS,
    ident,
    tabelasRemovidasNaEliminacao,
} from "./lgpd-tables";
import {CAMPOS_ZERADOS_NA_ANONIMIZACAO} from "./lgpd-prazos";
import {comporPacoteExportacao, omitirColunas, valorJson} from "./lgpd-pacote";

const DIR_EXPORT = path.join(os.tmpdir(), "ism-lgpd-exports");
const TTL_LINK_MS = 15 * 60 * 1000;

export type EstadoExportacao = "processando" | "pronto" | "erro";

export type JobExportacao = {
    id: string;
    empresaId: number;
    status: EstadoExportacao;
    token: string | null;
    arquivo: string | null;
    expiraEm: number | null;
    erro: string | null;
};

const jobs = new Map<string, JobExportacao>();
const jobPorEmpresa = new Map<number, string>();

function linhasDe(result: unknown): Record<string, unknown>[] {
    if (Array.isArray(result)) return result as Record<string, unknown>[];
    if (result && typeof result === "object" && Array.isArray((result as {rows?: unknown}).rows)) {
        return (result as {rows: Record<string, unknown>[]}).rows;
    }
    return [];
}

function rowCountDe(result: unknown): number {
    if (result && typeof result === "object" && typeof (result as {rowCount?: unknown}).rowCount === "number") {
        return (result as {rowCount: number}).rowCount;
    }
    if (Array.isArray(result) && typeof (result as {rowCount?: unknown}).rowCount === "number") {
        return (result as unknown as {rowCount: number}).rowCount;
    }
    return 0;
}

async function lerTabela(tx: TenantDb, tabela: string, empresaId: number): Promise<Record<string, unknown>[]> {
    const result = await tx.execute(
        sql`SELECT * FROM ${sql.raw(ident(tabela))} WHERE empresa_id = ${empresaId}`,
    );
    return linhasDe(result).map((linha) => omitirColunas(tabela, valorJson(linha) as Record<string, unknown>));
}

export function obterJobExportacao(jobId: string): JobExportacao | undefined {
    return jobs.get(jobId);
}

export function arquivoExportacao(job: JobExportacao, agora = Date.now()): string | null {
    if (job.status !== "pronto" || !job.arquivo || job.expiraEm === null || job.expiraEm <= agora) {
        return null;
    }
    const resolvido = path.resolve(job.arquivo);
    const relativo = path.relative(path.resolve(DIR_EXPORT), resolvido);
    if (relativo.startsWith("..") || path.isAbsolute(relativo)) return null;
    return resolvido;
}

export function obterJobPorToken(token: string): JobExportacao | undefined {
    for (const job of jobs.values()) {
        if (job.token === token) return job;
    }
    return undefined;
}

function purgarExportacoes(agora = Date.now()): void {
    for (const [id, job] of jobs) {
        if (job.expiraEm !== null && job.expiraEm <= agora) {
            jobs.delete(id);
            if (jobPorEmpresa.get(job.empresaId) === id) jobPorEmpresa.delete(job.empresaId);
            if (job.arquivo) {
                void rm(job.arquivo, {force: true});
            }
        }
    }
}

async function gravarPacote(empresaId: number, token: string, corpo: unknown): Promise<string> {
    await mkdir(DIR_EXPORT, {recursive: true});
    const arquivo = path.join(DIR_EXPORT, `${token}.json`);
    const relativo = path.relative(DIR_EXPORT, arquivo);
    if (relativo.startsWith("..") || path.isAbsolute(relativo)) {
        throw new Error("Caminho de exportação recusado.");
    }
    await writeFile(arquivo, JSON.stringify(corpo, null, 2), "utf8");
    return arquivo;
}

async function montarPacote(empresaId: number): Promise<unknown> {
    return withBypassRls(async (tx) => {
        const empresaRows = linhasDe(await tx.execute(sql`
            SELECT id, razao_social, nome_fantasia, cnpj, slug, ativa, created_at, updated_at
            FROM empresas
            WHERE id = ${empresaId}
        `));
        const empresa = empresaRows[0];
        if (!empresa) {
            throw new Error("EMPRESA_AUSENTE");
        }

        const tabelas: Record<string, Record<string, unknown>[]> = {};
        for (const tabela of tabelasRemovidasNaEliminacao()) {
            tabelas[tabela] = await lerTabela(tx, tabela, empresaId);
        }
        for (const tabela of TABELAS_AUDITORIA) {
            tabelas[tabela] = await lerTabela(tx, tabela, empresaId);
        }

        const usuarios = linhasDe(await tx.execute(sql`
            SELECT u.id, u.nome, u.email, u.cargo, u.perfil_base, u.telefone, u.celular,
                   u.bloqueado, ue.papel, ue.ativo
            FROM usuarios u
            INNER JOIN usuario_empresas ue ON ue.usuario_id = u.id
            WHERE ue.empresa_id = ${empresaId}
        `)).map((linha) => valorJson(linha) as Record<string, unknown>);

        return comporPacoteExportacao({
            empresa,
            tabelas,
            usuarios,
            geradoEm: new Date().toISOString(),
        });
    });
}

export async function iniciarExportacao(empresaId: number): Promise<JobExportacao> {
    const existe = await withBypassRls(async (tx) => {
        const rows = linhasDe(await tx.execute(sql`SELECT id FROM empresas WHERE id = ${empresaId}`));
        return Boolean(rows[0]);
    });
    if (!existe) {
        throw Object.assign(new Error("Empresa não encontrada."), {statusCode: 404, code: "NOT_FOUND"});
    }

    purgarExportacoes();
    const existenteId = jobPorEmpresa.get(empresaId);
    const existente = existenteId ? jobs.get(existenteId) : undefined;
    if (existente && existente.status === "processando") return existente;
    if (existente && existente.status === "pronto" && existente.expiraEm && existente.expiraEm > Date.now()) {
        return existente;
    }

    const job: JobExportacao = {
        id: randomBytes(16).toString("base64url"),
        empresaId,
        status: "processando",
        token: null,
        arquivo: null,
        expiraEm: null,
        erro: null,
    };
    jobs.set(job.id, job);
    jobPorEmpresa.set(empresaId, job.id);

    void montarPacote(empresaId)
        .then(async (pacote) => {
            const token = randomBytes(24).toString("base64url");
            job.arquivo = await gravarPacote(empresaId, token, pacote);
            job.token = token;
            job.expiraEm = Date.now() + TTL_LINK_MS;
            job.status = "pronto";
        })
        .catch((err: unknown) => {
            job.status = "erro";
            job.expiraEm = Date.now() + 60_000;
            job.erro = err instanceof Error && err.message === "EMPRESA_AUSENTE"
                ? "Empresa não encontrada."
                : "Falha ao montar o pacote.";
            console.error("[lgpd] exportação falhou:", err);
        });

    return job;
}

export type ContagemEmpresa = {
    tabelas: Record<string, number>;
    auditoria: Record<string, {total: number; anonimizadas: number}>;
};

export async function contarLinhasEmpresa(tx: TenantDb, empresaId: number): Promise<ContagemEmpresa> {
    const tabelasAlvo = ["empresas", ...tabelasRemovidasNaEliminacao()];
    const tabelas: Record<string, number> = {};

    const empresa = linhasDe(await tx.execute(sql`
        SELECT count(*)::int AS total FROM empresas WHERE id = ${empresaId}
    `));
    tabelas.empresas = Number(empresa[0]?.total ?? 0);

    for (const tabela of tabelasAlvo) {
        if (tabela === "empresas") continue;
        const rows = linhasDe(await tx.execute(sql`
            SELECT count(*)::int AS total
            FROM ${sql.raw(ident(tabela))}
            WHERE empresa_id = ${empresaId}
        `));
        tabelas[tabela] = Number(rows[0]?.total ?? 0);
    }

    const auditoria: ContagemEmpresa["auditoria"] = {};
    for (const tabela of TABELAS_AUDITORIA) {
        const rows = linhasDe(await tx.execute(sql`
            SELECT count(*)::int AS total,
                   count(*) FILTER (
                       WHERE COALESCE(detalhes->>'anonimizado', '') = 'true'
                         AND ip IS NULL
                         AND user_agent IS NULL
                         AND request_id IS NULL
                   )::int AS anonimizadas
            FROM ${sql.raw(ident(tabela))}
            WHERE empresa_id = ${empresaId}
        `));
        auditoria[tabela] = {
            total: Number(rows[0]?.total ?? 0),
            anonimizadas: Number(rows[0]?.anonimizadas ?? 0),
        };
    }

    return {tabelas, auditoria};
}

async function anonimizarAuditoria(tx: TenantDb, empresaId: number): Promise<void> {
    const detalhes = JSON.stringify({anonimizado: true});
    const zerar = sql.join(
        CAMPOS_ZERADOS_NA_ANONIMIZACAO.map((campo) => sql`${sql.raw(ident(campo))} = NULL`),
        sql`, `,
    );
    for (const tabela of TABELAS_AUDITORIA) {
        await tx.execute(sql`
            UPDATE ${sql.raw(ident(tabela))}
            SET ${zerar},
                detalhes = ${detalhes}::jsonb
            WHERE empresa_id = ${empresaId}
              AND COALESCE(detalhes->>'operacao', '') <> 'eliminacao'
        `);
    }
}

export async function eliminarEmpresa(
    empresaId: number,
    atorUsuarioId: number | null,
): Promise<{apagadas: Record<string, number>; usuariosAnonimizados: number}> {
    return withBypassRls(async (tx) => {
        const encontradas = linhasDe(await tx.execute(sql`
            SELECT id, razao_social FROM empresas WHERE id = ${empresaId}
        `));
        if (!encontradas[0]) {
            throw Object.assign(new Error("Empresa não encontrada."), {statusCode: 404, code: "NOT_FOUND"});
        }

        await anonimizarAuditoria(tx, empresaId);

        const exclusivos = linhasDe(await tx.execute(sql`
            SELECT u.id
            FROM usuarios u
            INNER JOIN usuario_empresas ue ON ue.usuario_id = u.id
            WHERE ue.empresa_id = ${empresaId}
              AND u.superadmin = false
              AND NOT EXISTS (
                  SELECT 1
                  FROM usuario_empresas outra
                  WHERE outra.usuario_id = u.id
                    AND outra.empresa_id <> ${empresaId}
              )
        `));
        const idsExclusivos = exclusivos
            .map((linha) => Number(linha.id))
            .filter((id) => Number.isInteger(id) && id > 0);

        await tx.execute(sql`
            UPDATE lancamentos
            SET lancamento_origem_id = NULL
            WHERE empresa_id = ${empresaId}
              AND lancamento_origem_id IS NOT NULL
        `);

        const apagadas: Record<string, number> = {};
        for (const tabela of TABELAS_ANTES_LANCAMENTOS) {
            const resultado = await tx.execute(sql`
                DELETE FROM ${sql.raw(ident(tabela))} WHERE empresa_id = ${empresaId}
            `);
            apagadas[tabela] = rowCountDe(resultado);
        }

        const resultadoLancamentos = await tx.execute(sql`
            DELETE FROM lancamentos WHERE empresa_id = ${empresaId}
        `);
        apagadas.lancamentos = rowCountDe(resultadoLancamentos);

        for (const tabela of TABELAS_DEPOIS_LANCAMENTOS) {
            const resultado = await tx.execute(sql`
                DELETE FROM ${sql.raw(ident(tabela))} WHERE empresa_id = ${empresaId}
            `);
            apagadas[tabela] = rowCountDe(resultado);
        }

        if (idsExclusivos.length > 0) {
            const lista = sql.join(idsExclusivos.map((id) => sql`${id}`), sql`, `);
            await tx.execute(sql`
                UPDATE refresh_tokens
                SET revogado = true
                WHERE usuario_id IN (${lista})
            `);
            await tx.execute(sql`
                UPDATE usuarios
                SET nome = 'Titular eliminado',
                    email = 'eliminado-' || id::text || '@invalid.local',
                    cargo = NULL,
                    perfil_base = NULL,
                    telefone = NULL,
                    celular = NULL,
                    senha_hash = '!lgpd-eliminado',
                    senha_unica_hash = NULL,
                    senha_unica_utilizada = true,
                    bloqueado = true,
                    ultimo_acesso = NULL,
                    updated_at = now()
                WHERE id IN (${lista})
            `);
        }

        await tx.execute(sql`
            INSERT INTO logs_auditoria (empresa_id, usuario_id, acao, recurso, ip, detalhes, status_code)
            VALUES (
                ${empresaId},
                NULL,
                'lgpd.eliminacao',
                'empresas',
                NULL,
                ${JSON.stringify({anonimizado: true, operacao: "eliminacao"})}::jsonb,
                200
            )
        `);

        await tx.execute(sql`
            INSERT INTO logs_sistema (servico, mensagem, detalhes)
            VALUES (
                'lgpd',
                'Eliminação de empresa',
                ${JSON.stringify({
                    operacao: "lgpd_eliminacao",
                    empresa_id: empresaId,
                    ator_usuario_id: atorUsuarioId,
                })}::jsonb
            )
        `);

        await tx.execute(sql`DELETE FROM empresas WHERE id = ${empresaId}`);

        return {apagadas, usuariosAnonimizados: idsExclusivos.length};
    });
}
