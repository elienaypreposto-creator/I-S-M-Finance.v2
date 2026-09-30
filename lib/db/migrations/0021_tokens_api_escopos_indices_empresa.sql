-- ISMF-17/20: colunas de tokens_api e índices por empresa que entraram no schema sem migration.
-- Idempotente: já aplicada manualmente no TST; repete as colunas da 0018 sem efeito.

ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "superadmin" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "usuario_permissoes" ADD COLUMN IF NOT EXISTS "empresa_id" integer;--> statement-breakpoint
-- Até aqui só existia a empresa 1.
UPDATE "usuario_permissoes" SET "empresa_id" = 1 WHERE "empresa_id" IS NULL;--> statement-breakpoint
ALTER TABLE "usuario_permissoes" ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "usuario_permissoes" ADD CONSTRAINT "usuario_permissoes_empresa_id_empresas_id_fk"
        FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "usuario_permissoes_usuario_id_codigo_permissao_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usuario_permissoes_usuario_id_empresa_id_codigo_permissao_idx"
    ON "usuario_permissoes" ("usuario_id", "empresa_id", "codigo_permissao");--> statement-breakpoint

ALTER TABLE "tokens_api" ADD COLUMN IF NOT EXISTS "escopos" text[];--> statement-breakpoint
ALTER TABLE "tokens_api" ADD COLUMN IF NOT EXISTS "criado_por_usuario_id" integer;--> statement-breakpoint
ALTER TABLE "tokens_api" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "tokens_api" ADD COLUMN IF NOT EXISTS "last_used_ip" text;--> statement-breakpoint
-- Tokens existentes mantêm o acesso de leitura que já tinham.
UPDATE "tokens_api"
    SET "escopos" = ARRAY['v1:lancamentos:ler', 'v1:parceiros:ler', 'v1:bancos:ler', 'v1:filiais:ler', 'v1:planoContas:ler']
    WHERE "escopos" IS NULL;--> statement-breakpoint
ALTER TABLE "tokens_api" ALTER COLUMN "escopos" SET NOT NULL;--> statement-breakpoint
-- Tokens sem expiração passam a expirar em 90 dias.
UPDATE "tokens_api" SET "data_expiracao" = current_date + 90 WHERE "data_expiracao" IS NULL;--> statement-breakpoint
ALTER TABLE "tokens_api" ALTER COLUMN "data_expiracao" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "tokens_api" ADD CONSTRAINT "tokens_api_criado_por_usuario_id_usuarios_id_fk"
        FOREIGN KEY ("criado_por_usuario_id") REFERENCES "public"."usuarios"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "extratos_empresa_id_idx" ON "extratos" ("empresa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conciliacoes_empresa_id_idx" ON "conciliacoes" ("empresa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itens_conciliacao_empresa_id_idx" ON "itens_conciliacao" ("empresa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "historico_conciliacao_empresa_id_idx" ON "historico_conciliacao" ("empresa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lancamentos_empresa_id_idx" ON "lancamentos" ("empresa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regras_conciliacao_empresa_id_idx" ON "regras_conciliacao" ("empresa_id");
