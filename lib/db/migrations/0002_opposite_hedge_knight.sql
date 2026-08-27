CREATE TABLE "logs_auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"acao" text NOT NULL,
	"recurso" text NOT NULL,
	"ip" text,
	"detalhes" jsonb,
	"status_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parceiros" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "parceiros" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "parceiros" ADD COLUMN "forma_pagamento_preferencial" text;--> statement-breakpoint
ALTER TABLE "parceiros" ADD COLUMN "status" varchar(20) DEFAULT 'ativo' NOT NULL;--> statement-breakpoint
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiros_cpf_cnpj_unique_idx" ON "parceiros" USING btree ("cpf_cnpj");--> statement-breakpoint
CREATE INDEX "lancamentos_conta_id_idx" ON "lancamentos" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "lancamentos_parceiro_id_idx" ON "lancamentos" USING btree ("parceiro_id");--> statement-breakpoint
CREATE INDEX "lancamentos_plano_conta_id_idx" ON "lancamentos" USING btree ("plano_conta_id");--> statement-breakpoint
CREATE INDEX "lancamentos_vencimento_idx" ON "lancamentos" USING btree ("vencimento");--> statement-breakpoint
CREATE INDEX "lancamentos_status_idx" ON "lancamentos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lancamentos_data_quitacao_idx" ON "lancamentos" USING btree ("data_quitacao");--> statement-breakpoint
CREATE INDEX "conciliacoes_extrato_id_idx" ON "conciliacoes" USING btree ("extrato_id");--> statement-breakpoint
CREATE INDEX "conciliacoes_conta_id_idx" ON "conciliacoes" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "extratos_conta_id_idx" ON "extratos" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "extratos_arquivo_hash_idx" ON "extratos" USING btree ("arquivo_hash");--> statement-breakpoint
CREATE INDEX "historico_conciliacao_conciliacao_id_idx" ON "historico_conciliacao" USING btree ("conciliacao_id");--> statement-breakpoint
CREATE INDEX "itens_conciliacao_lancamentos_item_id_idx" ON "itens_conciliacao_lancamentos" USING btree ("item_conciliacao_id");--> statement-breakpoint
CREATE INDEX "itens_conciliacao_lancamentos_lancamento_id_idx" ON "itens_conciliacao_lancamentos" USING btree ("lancamento_id");--> statement-breakpoint
CREATE INDEX "itens_conciliacao_conciliacao_id_idx" ON "itens_conciliacao" USING btree ("conciliacao_id");--> statement-breakpoint
CREATE INDEX "itens_conciliacao_extrato_linha_id_idx" ON "itens_conciliacao" USING btree ("extrato_linha_id");