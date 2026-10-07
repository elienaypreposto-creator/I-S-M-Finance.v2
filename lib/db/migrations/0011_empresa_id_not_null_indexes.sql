ALTER TABLE "filiais"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "departamentos"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "centros_custos"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contas_bancarias"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plano_contas"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "parceiros"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "metas"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "regras_conciliacao"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "extratos"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "extrato_linhas"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conciliacoes"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "itens_conciliacao"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "itens_conciliacao_lancamentos"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "historico_conciliacao"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_cards"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_comentarios"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_anexos"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_historico"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "parametros_sistema"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "logs_auditoria"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens_api"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "parametros_sistema" DROP CONSTRAINT "parametros_sistema_pkey";--> statement-breakpoint
ALTER TABLE "parametros_sistema"
    ADD PRIMARY KEY ("empresa_id", "chave");--> statement-breakpoint
DROP INDEX IF EXISTS "parceiros_cpf_cnpj_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "parceiros_empresa_id_cpf_cnpj_unique_idx" ON "parceiros" USING btree ("empresa_id", "cpf_cnpj");--> statement-breakpoint
CREATE UNIQUE INDEX "plano_contas_empresa_id_codigo_unique" ON "plano_contas" USING btree ("empresa_id", "codigo");--> statement-breakpoint
DROP INDEX IF EXISTS "extrato_linhas_conta_id_hash_linha_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "extrato_linhas_empresa_id_hash_linha_idx" ON "extrato_linhas" USING btree ("empresa_id", "hash_linha");--> statement-breakpoint
ALTER TABLE "metas" DROP CONSTRAINT IF EXISTS "metas_plano_conta_id_ano_mes_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "metas_empresa_id_plano_conta_ano_mes_unique" ON "metas" USING btree ("empresa_id", "plano_conta_id", "ano", "mes");--> statement-breakpoint
CREATE INDEX "lancamentos_empresa_id_vencimento_idx" ON "lancamentos" USING btree ("empresa_id", "vencimento");--> statement-breakpoint
CREATE INDEX "lancamentos_empresa_id_conta_id_idx" ON "lancamentos" USING btree ("empresa_id", "conta_id");--> statement-breakpoint
CREATE INDEX "lancamentos_empresa_id_status_idx" ON "lancamentos" USING btree ("empresa_id", "status");--> statement-breakpoint
CREATE INDEX "parceiros_empresa_id_nome_idx" ON "parceiros" USING btree ("empresa_id", "nome");--> statement-breakpoint
CREATE INDEX "plano_contas_empresa_id_codigo_idx" ON "plano_contas" USING btree ("empresa_id", "codigo");--> statement-breakpoint
CREATE INDEX "conciliacoes_empresa_id_conta_id_data_idx" ON "conciliacoes" USING btree ("empresa_id", "conta_id", "data_conciliacao");--> statement-breakpoint
CREATE INDEX "filiais_empresa_id_idx" ON "filiais" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "departamentos_empresa_id_idx" ON "departamentos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "centros_custos_empresa_id_idx" ON "centros_custos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "contas_bancarias_empresa_id_idx" ON "contas_bancarias" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_empresa_id_idx" ON "kanban_cards" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "tokens_api_empresa_id_idx" ON "tokens_api" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "logs_auditoria_empresa_id_idx" ON "logs_auditoria" USING btree ("empresa_id");
