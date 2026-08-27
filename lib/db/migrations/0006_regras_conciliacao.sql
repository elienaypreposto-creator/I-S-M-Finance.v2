-- Card 48/FEAT-03: motor de regras de conciliação

DO $$ BEGIN
 CREATE TYPE "public"."tipo_match_regra_conciliacao" AS ENUM('contem', 'inicia', 'regex');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."natureza_regra_conciliacao" AS ENUM('entrada', 'saida');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regras_conciliacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer,
	"texto_gatilho" text NOT NULL,
	"tipo_match" "tipo_match_regra_conciliacao" DEFAULT 'contem' NOT NULL,
	"natureza" "natureza_regra_conciliacao" NOT NULL,
	"plano_conta_id" integer,
	"parceiro_id" integer,
	"departamento_id" integer,
	"centro_custo_id" integer,
	"forma_pagamento" varchar(20),
	"criar_lancamento_automatico" boolean DEFAULT true NOT NULL,
	"prioridade" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_conta_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_plano_conta_id_plano_contas_id_fk" FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_contas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_centro_custo_id_centros_custos_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regras_conciliacao_conta_id_idx" ON "regras_conciliacao" ("conta_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regras_conciliacao_ativo_natureza_idx" ON "regras_conciliacao" ("ativo","natureza");
--> statement-breakpoint
ALTER TABLE "conciliacoes" ADD COLUMN IF NOT EXISTS "resumo_classificadas_automaticamente" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "itens_conciliacao" ADD COLUMN IF NOT EXISTS "regra_id" integer;
--> statement-breakpoint
ALTER TABLE "itens_conciliacao" ADD COLUMN IF NOT EXISTS "classificacao_automatica" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "itens_conciliacao" ADD CONSTRAINT "itens_conciliacao_regra_id_regras_conciliacao_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_conciliacao"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;