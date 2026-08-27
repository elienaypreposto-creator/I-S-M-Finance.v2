-- Card 76: alteração nos lançamentos apenas após Salvar/Conciliar.
-- O residual parcial não é mais criado em `lancamentos` no momento do
-- vincular - fica "pendente" aqui até o POST .../finalizar materializar.

ALTER TABLE "itens_conciliacao_lancamentos" ADD COLUMN IF NOT EXISTS "eh_origem_residuo" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "itens_conciliacao_lancamentos" ADD COLUMN IF NOT EXISTS "residuo_valor_pendente" numeric(15, 2);
