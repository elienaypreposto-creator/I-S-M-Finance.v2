CREATE TABLE "empresas"
(
    "id"            serial PRIMARY KEY      NOT NULL,
    "razao_social"  text                    NOT NULL,
    "nome_fantasia" text,
    "cnpj"          text,
    "slug"          text                    NOT NULL,
    "ativa"         boolean   DEFAULT true  NOT NULL,
    "created_at"    timestamp DEFAULT now() NOT NULL,
    "updated_at"    timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "empresas_cnpj_unique" UNIQUE ("cnpj"),
    CONSTRAINT "empresas_slug_unique" UNIQUE ("slug")
);--> statement-breakpoint
INSERT INTO "empresas" ("id", "razao_social", "nome_fantasia", "slug", "ativa")
VALUES (1, 'ISM Tecnologia', 'ISM', 'ism', true);--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('empresas', 'id'), (SELECT MAX(id) FROM "empresas"));--> statement-breakpoint
ALTER TABLE "contas_bancarias" RENAME COLUMN "empresa" TO "titular";--> statement-breakpoint
ALTER TABLE "filiais"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "departamentos"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "centros_custos"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "contas_bancarias"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "plano_contas"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "parceiros"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "metas"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "regras_conciliacao"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "extratos"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "extrato_linhas"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "conciliacoes"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "itens_conciliacao"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "itens_conciliacao_lancamentos"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "historico_conciliacao"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "kanban_cards"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "kanban_comentarios"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "kanban_anexos"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "kanban_historico"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "parametros_sistema"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "logs_auditoria"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "tokens_api"
    ADD COLUMN "empresa_id" integer;--> statement-breakpoint
ALTER TABLE "filiais"
    ADD CONSTRAINT "filiais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departamentos"
    ADD CONSTRAINT "departamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centros_custos"
    ADD CONSTRAINT "centros_custos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_bancarias"
    ADD CONSTRAINT "contas_bancarias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_contas"
    ADD CONSTRAINT "plano_contas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiros"
    ADD CONSTRAINT "parceiros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD CONSTRAINT "lancamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas"
    ADD CONSTRAINT "metas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_conciliacao"
    ADD CONSTRAINT "regras_conciliacao_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extratos"
    ADD CONSTRAINT "extratos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_linhas"
    ADD CONSTRAINT "extrato_linhas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes"
    ADD CONSTRAINT "conciliacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_conciliacao"
    ADD CONSTRAINT "itens_conciliacao_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_conciliacao_lancamentos"
    ADD CONSTRAINT "itens_conciliacao_lancamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_conciliacao"
    ADD CONSTRAINT "historico_conciliacao_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards"
    ADD CONSTRAINT "kanban_cards_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_comentarios"
    ADD CONSTRAINT "kanban_comentarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_anexos"
    ADD CONSTRAINT "kanban_anexos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_historico"
    ADD CONSTRAINT "kanban_historico_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_sistema"
    ADD CONSTRAINT "parametros_sistema_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs_auditoria"
    ADD CONSTRAINT "logs_auditoria_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_api"
    ADD CONSTRAINT "tokens_api_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;
