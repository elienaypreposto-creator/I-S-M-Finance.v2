-- DRE: cada conta do plano diz em que linha da DRE entra (antes era adivinhado pelo
-- texto da categoria). NULL = segue o tipo (receita, custo, despesa).
ALTER TABLE "plano_contas"
    ADD COLUMN IF NOT EXISTS "grupo_dre" text;--> statement-breakpoint
ALTER TABLE "plano_contas" DROP CONSTRAINT IF EXISTS "plano_contas_grupo_dre_valido";--> statement-breakpoint
ALTER TABLE "plano_contas"
    ADD CONSTRAINT "plano_contas_grupo_dre_valido"
        CHECK ("grupo_dre" IS NULL OR "grupo_dre" IN ('receita', 'deducao', 'custo', 'despesa', 'fora'));--> statement-breakpoint
-- Mantém o que a DRE já mostrava: categoria com "imposto" ia para (-) IMPOSTOS
-- e com "custo" para CUSTO, qualquer que fosse o tipo da saída.
UPDATE "plano_contas"
SET "grupo_dre" = 'deducao'
WHERE "grupo_dre" IS NULL
  AND "tipo" <> 'receita'
  AND "categoria" ILIKE '%imposto%';--> statement-breakpoint
UPDATE "plano_contas"
SET "grupo_dre" = 'custo'
WHERE "grupo_dre" IS NULL
  AND "tipo" <> 'receita'
  AND "categoria" ILIKE '%custo%';
