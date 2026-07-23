-- DEF-05: acrescimo -> juros_multa no vínculo item <-> lançamento
-- DEF-08: status pago_parcial
ALTER TYPE "status_lancamento" ADD VALUE IF NOT EXISTS 'pago_parcial';
--> statement-breakpoint
ALTER TABLE "itens_conciliacao_lancamentos" RENAME COLUMN "acrescimo" TO "juros_multa";
