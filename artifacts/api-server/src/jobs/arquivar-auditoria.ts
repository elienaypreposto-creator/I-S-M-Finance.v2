/**
 * Retenção de ~24 meses. Corre como role dona (ownerPool), nunca ism_app.
 * Move linhas antigas para logs_auditoria_arquivo e apaga da tabela quente.
 */

import {sql} from "drizzle-orm";
import {withOwnerTx, type TenantDb} from "@workspace/db";

const RETENTION_MONTHS = 24;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function arquivarLogsAuditoria(): Promise<{arquivados: number}> {
    return withOwnerTx(async (tx: TenantDb) => {
        await tx.execute(sql`
            INSERT INTO logs_auditoria_arquivo (
                id, empresa_id, usuario_id, acao, recurso, ip, detalhes,
                status_code, created_at, request_id, user_agent, token_api_id, duracao_ms
            )
            SELECT
                id, empresa_id, usuario_id, acao, recurso, ip, detalhes,
                status_code, created_at, request_id, user_agent, token_api_id, duracao_ms
            FROM logs_auditoria
            WHERE created_at < now() - (${RETENTION_MONTHS} * interval '1 month')
        `);

        const deleted = await tx.execute(sql`
            DELETE FROM logs_auditoria
            WHERE created_at < now() - (${RETENTION_MONTHS} * interval '1 month')
        `);

        const rows = (deleted as {rowCount?: number}).rowCount ?? 0;
        return {arquivados: rows};
    });
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startArquivarAuditoriaJob(): void {
    if (intervalHandle) return;

    const run = () => {
        void arquivarLogsAuditoria()
            .then(({arquivados}) => {
                if (arquivados > 0) {
                    console.log(`[job] arquivar-auditoria: ${arquivados} linha(s) (>${RETENTION_MONTHS} meses)`);
                }
            })
            .catch((err) => {
                console.error("[job] arquivar-auditoria falhou:", err);
            });
    };

    run();
    intervalHandle = setInterval(run, INTERVAL_MS);
    if (typeof intervalHandle.unref === "function") {
        intervalHandle.unref();
    }
}
