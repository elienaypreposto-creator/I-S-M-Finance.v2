-- Aceite do DPA gravado na empresa. Sem representante e data, a empresa não fica ativa.
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "dpa_representante" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "dpa_assinado_em" timestamp;--> statement-breakpoint

-- Única empresa do schema inicial (slug ism). O operador e o controlador, neste registo, são a ISM Tecnologia.
UPDATE "empresas"
SET "dpa_representante" = 'Administração da plataforma (admin@ism.finance)',
    "dpa_assinado_em"   = TIMESTAMP '2026-10-05 12:00:00'
WHERE "slug" = 'ism'
  AND "dpa_assinado_em" IS NULL;
