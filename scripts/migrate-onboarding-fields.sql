-- Migração: campos de onboarding e perfil no schema de utilizadores
-- Execute com: psql $DATABASE_URL -f scripts/migrate-onboarding-fields.sql
-- Seguro para re-execução (IF NOT EXISTS / idempotente).

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS cargo TEXT,
    ADD COLUMN IF NOT EXISTS perfil_base TEXT,
    ADD COLUMN IF NOT EXISTS senha_unica_hash TEXT,
    ADD COLUMN IF NOT EXISTS senha_unica_utilizada BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice para acelerar lookup por e-mail em /auth/verify-otp e /auth/forgot-password
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_idx ON usuarios (email);
