/**
 * Retenção do inventário: extrato com período fim há mais de 5 anos é arquivado.
 * A linha permanece. O apagamento de dado fiscal não é automático.
 */

import {sql} from "drizzle-orm";
import {withBypassRls} from "@workspace/db";
import {PRAZO_EXTRATO_ANOS} from "../domains/lgpd/lgpd-prazos";

export const ANOS_RETENCAO_EXTRATO = PRAZO_EXTRATO_ANOS;
const INTERVALO_MS = 24 * 60 * 60 * 1000;

export async function arquivarExtratosVencidos(): Promise<{arquivados: number}> {
    return withBypassRls(async (tx) => {
        const result = await tx.execute(sql`
            UPDATE extratos
            SET arquivado_em = now(),
                updated_at = now()
            WHERE arquivado_em IS NULL
              AND COALESCE(periodo_fim, created_at::date)
                  < (CURRENT_DATE - (${ANOS_RETENCAO_EXTRATO} * interval '1 year'))
        `);
        const rowCount = (result as {rowCount?: number}).rowCount ?? 0;
        return {arquivados: rowCount};
    });
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startRetencaoLgpdJob(): void {
    if (intervalHandle) return;

    const run = () => {
        void arquivarExtratosVencidos()
            .then(({arquivados}) => {
                if (arquivados > 0) {
                    console.log(`[job] retencao-lgpd: ${arquivados} extrato(s) arquivado(s) (>${ANOS_RETENCAO_EXTRATO} anos)`);
                }
            })
            .catch((err) => {
                console.error("[job] retencao-lgpd falhou:", err);
            });
    };

    run();
    intervalHandle = setInterval(run, INTERVALO_MS);
    if (typeof intervalHandle.unref === "function") {
        intervalHandle.unref();
    }
}
