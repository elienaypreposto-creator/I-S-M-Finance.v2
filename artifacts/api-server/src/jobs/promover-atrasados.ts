import {and, eq, lt} from "drizzle-orm";
import {db, withTenantTx} from "@workspace/db";
import {empresasTable, lancamentosTable} from "@workspace/db/schema";
import {tenantWhere} from "../lib/tenant-scope";
import {hojeIsoLocal} from "../utils/date-civil";

/**
 * Promove pendentes com vencimento anterior a hoje para atrasado.
 * "hoje" é o dia civil America/Sao_Paulo, não o fuso do host.
 *
 * `apenasEmpresaId`: restringe a uma empresa. O job periódico não passa nada (todas as
 * empresas ativas); o gatilho HTTP passa a empresa da sessão, para que um usuário de uma
 * empresa não altere dados nem descubra contagens das demais.
 */
export async function promoverLancamentosAtrasados(
    hojeIso?: string,
    apenasEmpresaId?: number,
): Promise<{ atualizados: number }> {
    const hoje = hojeIso ?? hojeIsoLocal();

    const empresas = await db
        .select({id: empresasTable.id})
        .from(empresasTable)
        .where(
            and(
                eq(empresasTable.ativa, true),
                apenasEmpresaId !== undefined ? eq(empresasTable.id, apenasEmpresaId) : undefined,
            ),
        );

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

    run();
    intervalHandle = setInterval(run, 6 * 60 * 60 * 1000);
    if (typeof intervalHandle.unref === "function") {
        intervalHandle.unref();
    }
}