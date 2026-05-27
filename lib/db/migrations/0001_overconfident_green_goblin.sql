CREATE TYPE "public"."acao_historico_conciliacao" AS ENUM('vincular', 'ignorar', 'desfazer_vinculo', 'criar_transferencia', 'criar_residuo_parcial', 'salvar');--> statement-breakpoint
CREATE TYPE "public"."origem_lancamento" AS ENUM('manual', 'conciliacao', 'importacao', 'transferencia', 'residuo_parcial');--> statement-breakpoint
CREATE TYPE "public"."status_cadastro" AS ENUM('ativo', 'bloqueado');--> statement-breakpoint
CREATE TYPE "public"."status_conciliacao" AS ENUM('pendente', 'conciliado');--> statement-breakpoint
CREATE TYPE "public"."status_extrato" AS ENUM('pendente', 'parcial', 'conciliado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."status_item_conciliacao" AS ENUM('pendente', 'vinculado', 'ignorado');--> statement-breakpoint
CREATE TYPE "public"."status_lancamento" AS ENUM('pendente', 'pago', 'recebido', 'atrasado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_lancamento" AS ENUM('CP', 'CR');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimento_extrato" AS ENUM('debito', 'credito');--> statement-breakpoint
CREATE TABLE "usuario_permissoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"codigo_permissao" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revogado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"cargo" text,
	"perfil_base" text,
	"telefone" text,
	"celular" text,
	"senha_hash" text NOT NULL,
	"senha_unica_hash" text,
	"senha_unica_utilizada" boolean DEFAULT false NOT NULL,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"ultimo_acesso" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "filiais" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parceiros" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo_pessoa" text NOT NULL,
	"cpf_cnpj" text,
	"nome" text NOT NULL,
	"nome_fantasia" text,
	"tipos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"departamento_id" integer,
	"centro_custo_id" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"chaves_pix" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dados_bancarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_bancarias" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"banco" text,
	"agencia" text,
	"digito_agencia" text,
	"conta" text,
	"digito_conta" text,
	"nome" text NOT NULL,
	"empresa" text,
	"saldo_inicial" numeric(15, 2) DEFAULT '0',
	"data_inicio" date NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"cor" text DEFAULT '#3BA8DC',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plano_contas" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"categoria" text NOT NULL,
	"subcategoria" text,
	"codigo" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metas" (
	"id" serial PRIMARY KEY NOT NULL,
	"plano_conta_id" integer NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"valor_projetado" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "metas_plano_conta_id_ano_mes_unique" UNIQUE("plano_conta_id","ano","mes")
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"vencimento" date NOT NULL,
	"competencia" date,
	"conta_id" integer,
	"parceiro_id" integer,
	"descricao" text,
	"valor" numeric(15, 2) NOT NULL,
	"status" "status_lancamento" DEFAULT 'pendente' NOT NULL,
	"origem" "origem_lancamento" DEFAULT 'manual' NOT NULL,
	"plano_conta_id" integer,
	"departamento_id" integer,
	"centro_custo_id" integer,
	"parcela_atual" integer DEFAULT 1,
	"total_parcelas" integer DEFAULT 1,
	"riscos" jsonb DEFAULT '[]'::jsonb,
	"data_quitacao" date,
	"valor_quitado" numeric(15, 2),
	"juros" numeric(15, 2) DEFAULT '0',
	"multa" numeric(15, 2) DEFAULT '0',
	"desconto" numeric(15, 2) DEFAULT '0',
	"acrescimo" numeric(15, 2) DEFAULT '0',
	"is_residuo_parcial" boolean DEFAULT false NOT NULL,
	"lancamento_origem_id" integer,
	"transferencia_grupo_id" text,
	"criado_por" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conciliacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"extrato_id" integer NOT NULL,
	"conta_id" integer NOT NULL,
	"periodo_inicio" date,
	"periodo_fim" date,
	"status" "status_conciliacao" DEFAULT 'pendente' NOT NULL,
	"arquivo_nome" text,
	"resumo_conciliados" integer DEFAULT 0 NOT NULL,
	"resumo_ignorados" integer DEFAULT 0 NOT NULL,
	"resumo_pendentes" integer DEFAULT 0 NOT NULL,
	"resumo_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extrato_linhas" (
	"id" serial PRIMARY KEY NOT NULL,
	"extrato_id" integer NOT NULL,
	"identificador_externo" text,
	"valor" numeric(15, 2) NOT NULL,
	"saldo_pos_linha" numeric(15, 2),
	"tipo_movimento" "tipo_movimento_extrato" NOT NULL,
	"descricao" text,
	"data_movimento" date,
	"data_compensacao" date,
	"documento" text,
	"observacao" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extratos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"periodo_inicio" date,
	"periodo_fim" date,
	"status" "status_extrato" DEFAULT 'pendente' NOT NULL,
	"arquivo_nome" text,
	"arquivo_hash" text,
	"importado_em" timestamp DEFAULT now() NOT NULL,
	"total_linhas" integer DEFAULT 0 NOT NULL,
	"total_creditos" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_debitos" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historico_conciliacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"conciliacao_id" integer NOT NULL,
	"item_conciliacao_id" integer,
	"usuario_id" integer,
	"acao" "acao_historico_conciliacao" NOT NULL,
	"detalhes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_conciliacao_lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_conciliacao_id" integer NOT NULL,
	"lancamento_id" integer NOT NULL,
	"valor_vinculado" numeric(15, 2) NOT NULL,
	"desconto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"acrescimo" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_conciliacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"conciliacao_id" integer NOT NULL,
	"extrato_linha_id" integer NOT NULL,
	"valor_extrato" numeric(15, 2) NOT NULL,
	"valor_vinculado_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_saldo" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "status_item_conciliacao" DEFAULT 'pendente' NOT NULL,
	"tipo_extrato" "tipo_movimento_extrato" NOT NULL,
	"descricao" text,
	"data" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_anexos" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"nome_arquivo" text NOT NULL,
	"url" text NOT NULL,
	"tipo" text,
	"tamanho" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"coluna" text DEFAULT 'solicitado' NOT NULL,
	"responsavel_id" integer,
	"responsaveis_multiplos" jsonb DEFAULT '[]'::jsonb,
	"departamentos" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"checklist" jsonb DEFAULT '[]'::jsonb,
	"comentarios_count" integer DEFAULT 0,
	"anexos_count" integer DEFAULT 0,
	"prazo" date,
	"prioridade" text DEFAULT 'media' NOT NULL,
	"created_by" integer,
	"responsavel_nome" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_comentarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"comentario" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"coluna_anterior" text,
	"coluna_nova" text,
	"comentario" text,
	"usuario_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens_api" (
	"id" serial PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_preview" text,
	"data_expiracao" date,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_api_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "centros_custos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"departamento_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs_sistema" (
	"id" serial PRIMARY KEY NOT NULL,
	"servico" text,
	"mensagem" text,
	"detalhes" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "usuario_permissoes" ADD CONSTRAINT "usuario_permissoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiros" ADD CONSTRAINT "parceiros_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiros" ADD CONSTRAINT "parceiros_centro_custo_id_centros_custos_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_plano_conta_id_plano_contas_id_fk" FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_plano_conta_id_plano_contas_id_fk" FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_centro_custo_id_centros_custos_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_lancamento_origem_id_fkey" FOREIGN KEY ("lancamento_origem_id") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes" ADD CONSTRAINT "conciliacoes_extrato_id_extratos_id_fk" FOREIGN KEY ("extrato_id") REFERENCES "public"."extratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacoes" ADD CONSTRAINT "conciliacoes_conta_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_linhas" ADD CONSTRAINT "extrato_linhas_extrato_id_extratos_id_fk" FOREIGN KEY ("extrato_id") REFERENCES "public"."extratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extratos" ADD CONSTRAINT "extratos_conta_id_contas_bancarias_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_bancarias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_conciliacao" ADD CONSTRAINT "historico_conciliacao_conciliacao_id_conciliacoes_id_fk" FOREIGN KEY ("conciliacao_id") REFERENCES "public"."conciliacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_conciliacao" ADD CONSTRAINT "historico_conciliacao_item_conciliacao_id_itens_conciliacao_id_fk" FOREIGN KEY ("item_conciliacao_id") REFERENCES "public"."itens_conciliacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_conciliacao" ADD CONSTRAINT "historico_conciliacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_conciliacao_lancamentos" ADD CONSTRAINT "itens_conciliacao_lancamentos_item_conciliacao_id_itens_conciliacao_id_fk" FOREIGN KEY ("item_conciliacao_id") REFERENCES "public"."itens_conciliacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_conciliacao_lancamentos" ADD CONSTRAINT "itens_conciliacao_lancamentos_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_conciliacao" ADD CONSTRAINT "itens_conciliacao_conciliacao_id_conciliacoes_id_fk" FOREIGN KEY ("conciliacao_id") REFERENCES "public"."conciliacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_conciliacao" ADD CONSTRAINT "itens_conciliacao_extrato_linha_id_extrato_linhas_id_fk" FOREIGN KEY ("extrato_linha_id") REFERENCES "public"."extrato_linhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_anexos" ADD CONSTRAINT "kanban_anexos_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_anexos" ADD CONSTRAINT "kanban_anexos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_comentarios" ADD CONSTRAINT "kanban_comentarios_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_comentarios" ADD CONSTRAINT "kanban_comentarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_historico" ADD CONSTRAINT "kanban_historico_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."kanban_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_historico" ADD CONSTRAINT "kanban_historico_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centros_custos" ADD CONSTRAINT "centros_custos_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_permissoes_usuario_id_codigo_permissao_idx" ON "usuario_permissoes" USING btree ("usuario_id","codigo_permissao");--> statement-breakpoint
CREATE UNIQUE INDEX "extrato_linhas_extrato_id_identificador_externo_idx" ON "extrato_linhas" USING btree ("extrato_id","identificador_externo");