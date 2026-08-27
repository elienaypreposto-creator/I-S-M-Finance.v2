-- DEF-02: conta_id + hash_linha em extrato_linhas; uniques por conta
-- DEF-03: saldo_final_banco no cabeçalho do extrato

ALTER TABLE "extratos" ADD COLUMN IF NOT EXISTS "saldo_final_banco" numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "extratos" ADD COLUMN IF NOT EXISTS "saldo_banco_data" date;
--> statement-breakpoint
ALTER TABLE "extrato_linhas" ADD COLUMN IF NOT EXISTS "conta_id" integer;
--> statement-breakpoint
ALTER TABLE "extrato_linhas" ADD COLUMN IF NOT EXISTS "hash_linha" text;
--> statement-breakpoint

-- Backfill conta_id a partir do extrato pai
UPDATE "extrato_linhas" el
SET "conta_id" = e."conta_id"
FROM "extratos" e
WHERE el."extrato_id" = e."id"
  AND el."conta_id" IS NULL;
--> statement-breakpoint

-- Backfill hash provisório (linhas antigas) — reimportação gera hash canônico
UPDATE "extrato_linhas"
SET "hash_linha" = md5(
  COALESCE("conta_id"::text, '') || '|' ||
  COALESCE("data_movimento"::text, '') || '|' ||
  COALESCE("tipo_movimento"::text, '') || '|' ||
  COALESCE("valor"::text, '') || '|' ||
  COALESCE("identificador_externo", '') || '|' ||
  id::text
)
WHERE "hash_linha" IS NULL;
--> statement-breakpoint

ALTER TABLE "extrato_linhas" ALTER COLUMN "conta_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "extrato_linhas" ALTER COLUMN "hash_linha" SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "extrato_linhas"
    ADD CONSTRAINT "extrato_linhas_conta_id_contas_bancarias_id_fk"
    FOREIGN KEY ("conta_id") REFERENCES "contas_bancarias"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DROP INDEX IF EXISTS "extrato_linhas_extrato_id_identificador_externo_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "extrato_linhas_conta_id_identificador_externo_idx"
  ON "extrato_linhas" ("conta_id", "identificador_externo");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "extrato_linhas_conta_id_hash_linha_idx"
  ON "extrato_linhas" ("conta_id", "hash_linha");
