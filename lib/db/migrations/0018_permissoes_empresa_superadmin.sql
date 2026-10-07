-- Alinha o schema versionado com usuarios.superadmin e
-- usuario_permissoes.empresa_id (já no Drizzle em develop).

ALTER TABLE "usuarios"
    ADD COLUMN IF NOT EXISTS "superadmin" boolean NOT NULL DEFAULT false;--> statement-breakpoint

ALTER TABLE "usuario_permissoes"
    ADD COLUMN IF NOT EXISTS "empresa_id" integer;--> statement-breakpoint

DROP INDEX IF EXISTS "usuario_permissoes_usuario_id_codigo_permissao_idx";--> statement-breakpoint

INSERT INTO "usuario_permissoes" ("usuario_id", "empresa_id", "codigo_permissao", "created_at")
SELECT up."usuario_id",
       ue."empresa_id",
       up."codigo_permissao",
       COALESCE(up."created_at", now())
FROM "usuario_permissoes" up
         INNER JOIN "usuario_empresas" ue
                    ON ue."usuario_id" = up."usuario_id"
                        AND COALESCE(ue."ativo", true) = true
WHERE up."empresa_id" IS NULL
  AND NOT EXISTS (SELECT 1
                  FROM "usuario_permissoes" existing
                  WHERE existing."usuario_id" = up."usuario_id"
                    AND existing."empresa_id" = ue."empresa_id"
                    AND existing."codigo_permissao" = up."codigo_permissao");--> statement-breakpoint

DELETE
FROM "usuario_permissoes"
WHERE "empresa_id" IS NULL;--> statement-breakpoint

ALTER TABLE "usuario_permissoes"
    ALTER COLUMN "empresa_id" SET NOT NULL;--> statement-breakpoint

DO
$$
BEGIN
        IF
NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'usuario_permissoes_empresa_id_empresas_id_fk'
        ) THEN
ALTER TABLE "usuario_permissoes"
    ADD CONSTRAINT "usuario_permissoes_empresa_id_empresas_id_fk"
        FOREIGN KEY ("empresa_id") REFERENCES "empresas" ("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
END IF;
END
$$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "usuario_permissoes_usuario_id_empresa_id_codigo_permissao_idx"
    ON "usuario_permissoes" USING btree ("usuario_id", "empresa_id", "codigo_permissao");
