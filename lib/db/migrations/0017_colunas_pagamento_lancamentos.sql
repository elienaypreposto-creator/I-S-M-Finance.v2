-- IF NOT EXISTS: bancos criados pelo antigo drizzle-kit push (TST, HML) já têm estas colunas.

ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "forma_pagamento" varchar(20);--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "dados_pagamento" jsonb;
