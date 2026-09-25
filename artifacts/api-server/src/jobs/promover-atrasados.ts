import {eq, lt} from "drizzle-orm";
import {db, withTenantTx} from "@workspace/db";
import {empresasTable, lancamentosTable} from "@workspace/db/schema";
import {tenantWhere} from "../lib/tenant-scope";
import {hojeIsoLocal} from "../utils/date-civil";

/**
 * FEAT-08: promove lançamentos pendentes com vencimento < hoje para atrasado.
 * Idempotente - seguro rodar várias vezes ao dia.
 * "hoje" = dia civil America/Sao_Paulo (não fuso do host).
 */
export async function promoverLancamentosAtrasados(hojeIso?: string): Promise<{ atualizados: number }> {
    const hoje = hojeIso ?? hojeIsoLocal();

    const empresas = await db
        .select({id: empresasTable.id})
        .from(empresasTable)
        .where(eq(empresasTable.ativa, true));

    let atualizados = 0;
    for (const empresa of empresas) {
        const result = await withTenantTx(empresa.id, async () =>
            db
                .update(lancamentosTable)
                .set({
                    status: "atrasado",
                    updated_at: new Date(),
                })
                .where(
                    tenantWhere(
                        lancamentosTable,
                        empresa.id,
                        eq(lancamentosTable.status, "pendente"),
                        lt(lancamentosTable.vencimento, hoje),
                    ),
                )
                .returning({id: lancamentosTable.id}),
        );

        atualizados += result.length;
    }

    return {atualizados};
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Agenda job diário (a cada 6h) - sem dependência de cron externo. */
export function startPromoverAtrasadosJob(): void {
    if (intervalHandle) return;

    const run = () => {
        void promoverLancamentosAtrasados().then(({atualizados}) => {
            if (atualizados > 0) {
                console.log(`[job] promover-atrasados: ${atualizados} lançamento(s)`);
            }
        }).catch((err) => {
            console.error("[job] promover-atrasados falhou:", err);
        });
    };

    // Roda na subida + a cada 6 horas
    run();
    intervalHandle = setInterval(run, 6 * 60 * 60 * 1000);
    if (typeof intervalHandle.unref === "function") {
        intervalHandle.unref();
    }
}
