-- FEAT-06: parâmetros do sistema (motivo_ignorar_obrigatorio)
-- FEAT-08: data_conciliacao em conciliacoes e itens_conciliacao
-- FEAT-06: motivo ao ignorar

CREATE TABLE IF NOT EXISTS "parametros_sistema" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "parametros_sistema" ("chave", "valor")
VALUES ('motivo_ignorar_obrigatorio', 'false')
ON CONFLICT ("chave") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "conciliacoes" ADD COLUMN IF NOT EXISTS "data_conciliacao" date;
--> statement-breakpoint
ALTER TABLE "itens_conciliacao" ADD COLUMN IF NOT EXISTS "motivo_ignorar" text;
--> statement-breakpoint
ALTER TABLE "itens_conciliacao" ADD COLUMN IF NOT EXISTS "motivo_ignorar_codigo" text;
--> statement-breakpoint
ALTER TABLE "itens_conciliacao" ADD COLUMN IF NOT EXISTS "data_conciliacao" date;
