-- Empresa ativa sem aceite de DPA deixa de ser um estado válido.
-- Linhas já ativas sem data (ex.: filial-sul-teste em TST) passam a inativas.
-- Não inventa assinatura: só o registo que já tem dpa_assinado_em permanece ativo.
UPDATE "empresas"
SET "ativa" = false,
    "updated_at" = now()
WHERE "dpa_assinado_em" IS NULL
  AND "ativa" = true;--> statement-breakpoint

ALTER TABLE "empresas" DROP CONSTRAINT IF EXISTS "empresas_ativa_exige_dpa";--> statement-breakpoint
ALTER TABLE "empresas"
    ADD CONSTRAINT "empresas_ativa_exige_dpa"
        CHECK ("ativa" = false OR "dpa_assinado_em" IS NOT NULL);
