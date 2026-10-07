-- Conferência manual no Postgres de produção, depois de um restore feito à mão.
-- A suíte que corre sempre é o teste "elimina, restaura o dump cifrado e elimina de novo"
-- em artifacts/api-server/src/domains/lgpd/lgpd-empresa.test.ts.
-- psql "$DATABASE_URL" -v empresa_id=123 -f scripts/lgpd-verificar-eliminacao.sql

SELECT 'filiais' AS tabela, count(*) AS total FROM filiais WHERE empresa_id = :empresa_id
UNION ALL SELECT 'departamentos', count(*) FROM departamentos WHERE empresa_id = :empresa_id
UNION ALL SELECT 'centros_custos', count(*) FROM centros_custos WHERE empresa_id = :empresa_id
UNION ALL SELECT 'contas_bancarias', count(*) FROM contas_bancarias WHERE empresa_id = :empresa_id
UNION ALL SELECT 'plano_contas', count(*) FROM plano_contas WHERE empresa_id = :empresa_id
UNION ALL SELECT 'parceiros', count(*) FROM parceiros WHERE empresa_id = :empresa_id
UNION ALL SELECT 'lancamentos', count(*) FROM lancamentos WHERE empresa_id = :empresa_id
UNION ALL SELECT 'metas', count(*) FROM metas WHERE empresa_id = :empresa_id
UNION ALL SELECT 'regras_conciliacao', count(*) FROM regras_conciliacao WHERE empresa_id = :empresa_id
UNION ALL SELECT 'extratos', count(*) FROM extratos WHERE empresa_id = :empresa_id
UNION ALL SELECT 'extrato_linhas', count(*) FROM extrato_linhas WHERE empresa_id = :empresa_id
UNION ALL SELECT 'conciliacoes', count(*) FROM conciliacoes WHERE empresa_id = :empresa_id
UNION ALL SELECT 'itens_conciliacao', count(*) FROM itens_conciliacao WHERE empresa_id = :empresa_id
UNION ALL SELECT 'itens_conciliacao_lancamentos', count(*) FROM itens_conciliacao_lancamentos WHERE empresa_id = :empresa_id
UNION ALL SELECT 'historico_conciliacao', count(*) FROM historico_conciliacao WHERE empresa_id = :empresa_id
UNION ALL SELECT 'kanban_cards', count(*) FROM kanban_cards WHERE empresa_id = :empresa_id
UNION ALL SELECT 'kanban_comentarios', count(*) FROM kanban_comentarios WHERE empresa_id = :empresa_id
UNION ALL SELECT 'kanban_anexos', count(*) FROM kanban_anexos WHERE empresa_id = :empresa_id
UNION ALL SELECT 'kanban_historico', count(*) FROM kanban_historico WHERE empresa_id = :empresa_id
UNION ALL SELECT 'parametros_sistema', count(*) FROM parametros_sistema WHERE empresa_id = :empresa_id
UNION ALL SELECT 'tokens_api', count(*) FROM tokens_api WHERE empresa_id = :empresa_id
UNION ALL SELECT 'usuario_permissoes', count(*) FROM usuario_permissoes WHERE empresa_id = :empresa_id
UNION ALL SELECT 'usuario_empresas', count(*) FROM usuario_empresas WHERE empresa_id = :empresa_id
UNION ALL SELECT 'empresas', count(*) FROM empresas WHERE id = :empresa_id
ORDER BY tabela;

SELECT 'logs_auditoria' AS tabela,
       count(*) AS total,
       count(*) FILTER (
           WHERE COALESCE(detalhes->>'anonimizado', '') = 'true'
             AND ip IS NULL AND user_agent IS NULL AND request_id IS NULL
       ) AS anonimizadas
FROM logs_auditoria
WHERE empresa_id = :empresa_id
UNION ALL
SELECT 'logs_auditoria_arquivo',
       count(*),
       count(*) FILTER (
           WHERE COALESCE(detalhes->>'anonimizado', '') = 'true'
             AND ip IS NULL AND user_agent IS NULL AND request_id IS NULL
       )
FROM logs_auditoria_arquivo
WHERE empresa_id = :empresa_id;
