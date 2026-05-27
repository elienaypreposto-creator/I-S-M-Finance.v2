-- Migration: Adiciona tabela refresh_tokens para suporte a EJWT com rotação de tokens

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id"          SERIAL PRIMARY KEY,
  "usuario_id"  INTEGER NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
  "token_hash"  TEXT    NOT NULL UNIQUE,
  "expires_at"  TIMESTAMP NOT NULL,
  "revogado"    BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "refresh_tokens_usuario_id_idx"
  ON "refresh_tokens" ("usuario_id");

CREATE INDEX IF NOT EXISTS "refresh_tokens_token_hash_idx"
  ON "refresh_tokens" ("token_hash");

-- Limpeza periódica (opcional):
-- DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revogado = TRUE;
