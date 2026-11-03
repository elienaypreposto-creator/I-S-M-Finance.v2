-- Retenções na fonte (IR, PIS, COFINS, CSLL, INSS, ISS) no lançamento.
-- `valor` continua sendo o BRUTO da nota; `valor_liquido` é o que de fato
-- entra/sai do banco (antes de desconto/juros) e é a base da quitação.
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "retencao_ir" numeric (15, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "retencao_pis" numeric (15, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "retencao_cofins" numeric (15, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "retencao_csll" numeric (15, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "retencao_inss" numeric (15, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "retencao_iss" numeric (15, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint
DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'lancamentos_retencoes_nao_negativas_chk'
                     AND conrelid = 'public.lancamentos'::regclass) THEN
        ALTER TABLE "lancamentos"
            ADD CONSTRAINT "lancamentos_retencoes_nao_negativas_chk" CHECK (
                "retencao_ir" >= 0 AND "retencao_pis" >= 0 AND "retencao_cofins" >= 0
                AND "retencao_csll" >= 0 AND "retencao_inss" >= 0 AND "retencao_iss" >= 0
            );
    END IF;
END $$;
--> statement-breakpoint
-- `soma = 0 OR ...`: título legado com valor negativo (sem retenção) não
-- viola a regra; com retenção, a soma nunca passa do bruto.
DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'lancamentos_retencoes_ate_valor_chk'
                     AND conrelid = 'public.lancamentos'::regclass) THEN
        ALTER TABLE "lancamentos"
            ADD CONSTRAINT "lancamentos_retencoes_ate_valor_chk" CHECK (
                ("retencao_ir" + "retencao_pis" + "retencao_cofins" + "retencao_csll" + "retencao_inss" + "retencao_iss") = 0
                OR ("retencao_ir" + "retencao_pis" + "retencao_cofins" + "retencao_csll" + "retencao_inss" + "retencao_iss") <= "valor"
            );
    END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "valor_liquido" numeric (15, 2)
        GENERATED ALWAYS AS (
            "valor" - ("retencao_ir" + "retencao_pis" + "retencao_cofins" + "retencao_csll" + "retencao_inss" + "retencao_iss")
        ) STORED;
