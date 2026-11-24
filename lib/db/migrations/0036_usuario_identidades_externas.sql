-- Login vindo do GovADM (Fase 1): vínculo entre o usuário do ISM e a identidade dele no GovADM.
-- Tabela GLOBAL, como "usuarios": sem empresa_id e sem RLS (o acesso é controlado pelas rotas).
-- empresa_id_padrao: ON DELETE SET NULL para não travar a eliminação de empresa (LGPD).
-- Idempotente: IF NOT EXISTS / checagem de constraint antes de criar.
CREATE TABLE IF NOT EXISTS "usuario_identidades_externas"
(
    "id"                serial PRIMARY KEY      NOT NULL,
    "provedor"          text                    NOT NULL,
    "emissor"           text                    NOT NULL,
    "sujeito_externo"   text                    NOT NULL,
    "usuario_id"        integer                 NOT NULL,
    "empresa_id_padrao" integer,
    "ativo"             boolean   DEFAULT true  NOT NULL,
    "criado_por"        integer,
    "created_at"        timestamp DEFAULT now() NOT NULL,
    "ultimo_uso_em"     timestamp,
    CONSTRAINT "usuario_identidades_externas_provedor_emissor_sujeito_unique" UNIQUE ("provedor", "emissor", "sujeito_externo"),
    CONSTRAINT "usuario_identidades_externas_provedor_emissor_usuario_unique" UNIQUE ("provedor", "emissor", "usuario_id"),
    CONSTRAINT "usuario_identidades_externas_provedor_check" CHECK ("provedor" IN ('govadm'))
);--> statement-breakpoint

DO
$$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_identidades_externas_usuario_id_usuarios_id_fk') THEN
            ALTER TABLE "usuario_identidades_externas"
                ADD CONSTRAINT "usuario_identidades_externas_usuario_id_usuarios_id_fk"
                    FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios" ("id") ON DELETE cascade ON UPDATE no action;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_identidades_externas_empresa_id_padrao_empresas_id_fk') THEN
            ALTER TABLE "usuario_identidades_externas"
                ADD CONSTRAINT "usuario_identidades_externas_empresa_id_padrao_empresas_id_fk"
                    FOREIGN KEY ("empresa_id_padrao") REFERENCES "public"."empresas" ("id") ON DELETE set null ON UPDATE no action;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_identidades_externas_criado_por_usuarios_id_fk') THEN
            ALTER TABLE "usuario_identidades_externas"
                ADD CONSTRAINT "usuario_identidades_externas_criado_por_usuarios_id_fk"
                    FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios" ("id") ON DELETE set null ON UPDATE no action;
        END IF;
    END
$$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "usuario_identidades_externas_usuario_id_idx" ON "usuario_identidades_externas" ("usuario_id");--> statement-breakpoint

-- Mesmos privilégios das demais tabelas globais (o ALTER DEFAULT PRIVILEGES da 0013/0020
-- já cobre; explícito aqui para não depender de qual role roda o migrate).
DO
$$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ism_app')
            AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ism_admin') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "usuario_identidades_externas" TO ism_app, ism_admin;
            GRANT USAGE, SELECT ON SEQUENCE "usuario_identidades_externas_id_seq" TO ism_app, ism_admin;
        END IF;
    END
$$;
