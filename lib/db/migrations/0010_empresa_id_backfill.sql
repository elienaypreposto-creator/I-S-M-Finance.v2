UPDATE "filiais"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "departamentos"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "centros_custos"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "contas_bancarias"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "plano_contas"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "parceiros"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "lancamentos"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "metas"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "regras_conciliacao"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "extratos"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "extrato_linhas"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "conciliacoes"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "itens_conciliacao"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "itens_conciliacao_lancamentos"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "historico_conciliacao"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "kanban_cards"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "kanban_comentarios"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "kanban_anexos"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "kanban_historico"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "parametros_sistema"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "logs_auditoria"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;--> statement-breakpoint
UPDATE "tokens_api"
SET "empresa_id" = 1
WHERE "empresa_id" IS NULL;
