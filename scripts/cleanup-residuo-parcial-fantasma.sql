-- DEF-01 dívida: resíduos fantasma criados pelo ramo invertido (excedente -> residuo_parcial).
--
-- 1) SELECT de inventário (obrigatório revisar antes do UPDATE)
-- 2) Reconstitui lancamentos.juros na origem com o valor do fantasma
-- 3) Cancela o residual pendente
--
-- Rodar em transação; conferir o SELECT; só então COMMIT.

BEGIN;

-- Inventário
SELECT
  r.id AS residuo_id,
  r.valor AS residuo_valor,
  r.status AS residuo_status,
  r.descricao AS residuo_descricao,
  r.lancamento_origem_id,
  o.valor AS origem_valor,
  o.valor_quitado AS origem_quitado,
  o.status AS origem_status,
  o.juros AS origem_juros
FROM lancamentos r
LEFT JOIN lancamentos o ON o.id = r.lancamento_origem_id
WHERE r.origem = 'residuo_parcial'
  AND r.is_residuo_parcial = true
ORDER BY r.id;

-- Fantasmas de excedente: residual pendente cuja origem já está 100% quitada.
-- Move o valor do fantasma para origem.juros (centavos via numeric) e cancela o residual.
WITH fantasmas AS (
  SELECT r.id AS residuo_id, r.valor AS residuo_valor, r.lancamento_origem_id
  FROM lancamentos r
  INNER JOIN lancamentos o ON o.id = r.lancamento_origem_id
  WHERE r.origem = 'residuo_parcial'
    AND r.is_residuo_parcial = true
    AND r.status = 'pendente'
    AND o.valor_quitado IS NOT NULL
    AND o.valor_quitado::numeric >= o.valor::numeric
    AND o.status IN ('pago', 'recebido')
)
UPDATE lancamentos o
SET
  juros = COALESCE(o.juros, 0)::numeric + f.residuo_valor::numeric,
  updated_at = now()
FROM fantasmas f
WHERE o.id = f.lancamento_origem_id;

WITH fantasmas AS (
  SELECT r.id AS residuo_id
  FROM lancamentos r
  INNER JOIN lancamentos o ON o.id = r.lancamento_origem_id
  WHERE r.origem = 'residuo_parcial'
    AND r.is_residuo_parcial = true
    AND r.status = 'pendente'
    AND o.valor_quitado IS NOT NULL
    AND o.valor_quitado::numeric >= o.valor::numeric
    AND o.status IN ('pago', 'recebido')
)
UPDATE lancamentos r
SET
  status = 'cancelado',
  updated_at = now()
FROM fantasmas f
WHERE r.id = f.residuo_id;

COMMIT;
