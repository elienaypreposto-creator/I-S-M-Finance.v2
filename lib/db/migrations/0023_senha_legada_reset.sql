-- Hashes SHA-256 legados (64 hex, sem salt) são quebráveis em minutos a partir de qualquer dump.
-- Invalida a senha de quem ainda tem um e revoga as sessões. Quem for afetado redefine a senha
-- pelo e-mail de recuperação (script notificar-reset-legado).

ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "senha_reset_notificado_em" timestamp;

UPDATE "refresh_tokens"
SET "revogado" = true
WHERE "revogado" = false
  AND "usuario_id" IN (SELECT "id" FROM "usuarios" WHERE "senha_hash" ~ '^[0-9a-f]{64}$');

UPDATE "usuarios"
SET "senha_hash" = 'RESET_REQUIRED',
    "senha_reset_notificado_em" = NULL,
    "updated_at" = now()
WHERE "senha_hash" ~ '^[0-9a-f]{64}$';