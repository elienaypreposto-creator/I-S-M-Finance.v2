CREATE TABLE "usuario_empresas"
(
    "id"         serial PRIMARY KEY      NOT NULL,
    "usuario_id" integer                 NOT NULL,
    "empresa_id" integer                 NOT NULL,
    "papel"      text                    NOT NULL,
    "ativo"      boolean   DEFAULT true  NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "usuario_empresas_usuario_id_empresa_id_unique" UNIQUE ("usuario_id", "empresa_id"),
    CONSTRAINT "usuario_empresas_papel_check" CHECK ("papel" IN ('admin', 'membro'))
);--> statement-breakpoint
ALTER TABLE "usuario_empresas"
    ADD CONSTRAINT "usuario_empresas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios" ("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_empresas"
    ADD CONSTRAINT "usuario_empresas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "usuario_empresas" ("usuario_id", "empresa_id", "papel", "ativo")
SELECT "id", 1, 'admin', true
FROM "usuarios" ON CONFLICT
ON CONSTRAINT "usuario_empresas_usuario_id_empresa_id_unique" DO NOTHING;
