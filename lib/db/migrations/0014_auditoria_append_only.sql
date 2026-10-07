-- ISMF-18: colunas de correlação + índices. Partição mensal adiada —
-- volume actual de logs_auditoria não justifica o custo operacional.
-- Retenção/arquivo: tabela dona-only (ism_app sem GRANT).

ALTER TABLE "logs_auditoria"
    ADD COLUMN IF NOT EXISTS "request_id" uuid;--> statement-breakpoint
ALTER TABLE "logs_auditoria"
    ADD COLUMN IF NOT EXISTS "user_agent" text;--> statement-breakpoint
ALTER TABLE "logs_auditoria"
    ADD COLUMN IF NOT EXISTS "token_api_id" integer;--> statement-breakpoint
ALTER TABLE "logs_auditoria"
    ADD COLUMN IF NOT EXISTS "duracao_ms" integer;--> statement-breakpoint

DO
$$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'logs_auditoria_token_api_id_tokens_api_id_fk'
        ) THEN
            ALTER TABLE "logs_auditoria"
                ADD CONSTRAINT "logs_auditoria_token_api_id_tokens_api_id_fk"
                    FOREIGN KEY ("token_api_id") REFERENCES "tokens_api" ("id")
                    ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
    END
$$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "logs_auditoria_empresa_id_created_at_idx"
    ON "logs_auditoria" ("empresa_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logs_auditoria_usuario_id_created_at_idx"
    ON "logs_auditoria" ("usuario_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logs_auditoria_request_id_idx"
    ON "logs_auditoria" ("request_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "logs_auditoria_arquivo"
(
    "id"           integer,
    "empresa_id"   integer                  NOT NULL,
    "usuario_id"   integer,
    "acao"         text                     NOT NULL,
    "recurso"      text                     NOT NULL,
    "ip"           text,
    "detalhes"     jsonb,
    "status_code"  integer,
    "created_at"   timestamp                NOT NULL,
    "request_id"   uuid,
    "user_agent"   text,
    "token_api_id" integer,
    "duracao_ms"   integer,
    "arquivado_at" timestamp DEFAULT now()  NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "logs_auditoria_arquivo_empresa_created_idx"
    ON "logs_auditoria_arquivo" ("empresa_id", "created_at" DESC);--> statement-breakpoint

REVOKE ALL ON TABLE logs_auditoria_arquivo FROM ism_app;
