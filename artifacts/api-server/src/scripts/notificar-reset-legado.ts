/**
 * Envia o aviso + link de redefinição a quem teve a senha legada invalidada (migration 0023).
 *
 * Idempotente: só pega quem ainda não foi avisado
 * (senha_reset_notificado_em IS NULL).
 *
 * Uso:
 *
 *   pnpm --filter @workspace/api-server run senhas:notificar -- --dry-run
 *   (só lista os usuários pendentes)
 *
 *   pnpm --filter @workspace/api-server run senhas:notificar
 *   (envia os e-mails)
 *
 * Precisa das mesmas variáveis da API:
 * DATABASE_URL, FRONTEND_URL, SMTP_*, segredos de JWT.
 */

import { and, eq, isNull } from "drizzle-orm";
import { closeDbPools, db } from "@workspace/db";
import { usuariosTable } from "@workspace/db/schema";
import { sendLegacyPasswordNoticeEmail } from "../services/email.service";
import { signPurposeToken } from "../services/token.service";
import { SENHA_RESET_REQUIRED } from "../utils/password-policy";

const TTL_24H = 24 * 60 * 60;
const dryRun = process.argv.includes("--dry-run");

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error("FRONTEND_URL não definido.");
  }

  const pendentes = await db
    .select({
      id: usuariosTable.id,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
    })
    .from(usuariosTable)
    .where(
      and(
        eq(usuariosTable.senha_hash, SENHA_RESET_REQUIRED),
        isNull(usuariosTable.senha_reset_notificado_em),
        eq(usuariosTable.bloqueado, false),
      ),
    );

  console.log(
    `${pendentes.length} utilizador(es) a avisar${
      dryRun ? " (dry-run)" : ""
    }.`,
  );

  let enviados = 0;
  let falhas = 0;

  for (const u of pendentes) {
    if (dryRun) {
      console.log(` - ${u.email}`);
      continue;
    }

    try {
      const token = await signPurposeToken(
        {
          sub: String(u.id),
          email: u.email,
          purpose: "password_reset",
        },
        TTL_24H,
      );

      await sendLegacyPasswordNoticeEmail(
        u.email,
        u.nome,
        token,
        frontendUrl,
      );

      await db
        .update(usuariosTable)
        .set({
          senha_reset_notificado_em: new Date(),
        })
        .where(eq(usuariosTable.id, u.id));

      enviados++;

      console.log(` ok  ${u.email}`);
    } catch (err) {
      falhas++;

      console.error(
        ` ERRO ${u.email}:`,
        err instanceof Error ? err.message : err,
      );
    }

    // Pequena pausa para não estourar o limite do SMTP.
    await sleep(300);
  }

  console.log(
    `Concluído: ${enviados} enviado(s), ${falhas} falha(s). ` +
      `Rode de novo para reenviar as falhas.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDbPools();
  });