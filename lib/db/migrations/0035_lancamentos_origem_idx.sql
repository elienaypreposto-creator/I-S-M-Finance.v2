-- Índice em lancamentos.lancamento_origem_id. A regra de "em aberto" do
-- pago_parcial (em-aberto.ts: temResidualAtivoSql) faz, por linha, uma
-- subconsulta "existe residual com lancamento_origem_id = este título"; sem
-- índice cada uma varria a tabela. A exclusão de extrato e o desfazer também
-- buscam residuais por essa coluna.
-- Idempotente: IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS "lancamentos_lancamento_origem_id_idx" ON "lancamentos" ("lancamento_origem_id");
