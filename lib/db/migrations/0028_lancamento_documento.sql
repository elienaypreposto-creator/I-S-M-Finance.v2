DO
$$
BEGIN
CREATE TYPE "public"."tipo_documento_lancamento" AS ENUM ('nota_fiscal', 'boleto', 'fatura', 'recibo', 'contrato', 'guia_imposto', 'folha', 'outros');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "tipo_documento" "tipo_documento_lancamento";
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "numero_documento" varchar (60);
--> statement-breakpoint
ALTER TABLE "lancamentos"
    ADD COLUMN IF NOT EXISTS "observacao" text;
