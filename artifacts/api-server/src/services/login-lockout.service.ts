/**
 * Instância do bloqueio de conta usada pelo /auth/login (ISMF-7).
 * Regras em lib/account-lockout.ts.
 */
import {db} from "@workspace/db";
import {logsSistemaTable} from "@workspace/db/schema";
import {createAccountLockout, redisLockoutStore} from "../lib/account-lockout";

export const loginLockout = createAccountLockout({
    store: redisLockoutStore(),
    onBloqueio: async ({chave, ip, falhas, bloqueioMs}) => {
        const minutos = Math.round(bloqueioMs / 60_000);
        console.warn(
            `[SECURITY] Bloqueio automático de login: conta=${chave} ip=${ip} falhas=${falhas} por ${minutos} min.`,
        );
        try {
            await db.insert(logsSistemaTable).values({
                servico: "auth",
                mensagem: "Bloqueio automático de login por tentativas falhas",
                // Hash do e-mail (lib/account-lockout.ts#chaveConta), não o e-mail em claro.
                detalhes: {conta_hash: chave, ip, falhas, bloqueio_min: minutos},
            });
        } catch (err) {
            console.error("[SECURITY] Falha ao registrar bloqueio em logs_sistema:", err);
        }
    },
});
