// @ts-ignore
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import dotenv from "dotenv";
import path from "path";

dotenv.config({path: path.resolve(process.cwd(), "../../.env")});

import {assertRlsRoles, syncAdminPermissionsOnBoot} from "@workspace/db";
import app from "./app";
import {startPromoverAtrasadosJob} from "./jobs/promover-atrasados";
import {startArquivarAuditoriaJob} from "./jobs/arquivar-auditoria";

const port = process.env.PORT || 5000;

/** Sync fail-soft: nunca derruba o boot se o DB estiver lento/indisponível. */
function runAdminPermissionsSyncOnBoot(): void {
    void syncAdminPermissionsOnBoot()
        .then((r) => {
            console.log(
                `[boot] admin-permissions: ${r.sincronizados}/${r.emailsAlvo} usuário(s),` +
                ` ${r.permissoesPorUsuario} permissões` +
                (r.ausentes.length ? ` (ausentes: ${r.ausentes.join(", ")})` : ""),
            );
        })
        .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[boot] admin-permissions: falha ao sincronizar - ${msg}`);
        });
}

function listenIfLocal(): void {
    if (process.env.NODE_ENV === "production" && process.env.RUN_LOCAL !== "true") {
        return;
    }

    const server = app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        startPromoverAtrasadosJob();
        startArquivarAuditoriaJob();
    });

    server.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
            console.error(`ERROR: Port ${port} is already in use.`);
            console.error("The server is likely already running in another terminal.");
            process.exit(1);
        } else {
            console.error("Server error:", error);
        }
    });
}

void assertRlsRoles()
    .then(() => {
        console.log("[boot] pool padrão = ism_app; admin pool = ism_admin");
        runAdminPermissionsSyncOnBoot();
        listenIfLocal();
    })
    .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[boot] recusado — SET ROLE ism_app/ism_admin é obrigatório: ${msg}`);
        process.exit(1);
    });

export default app;
