-- ============================================================
-- DADOS DE EXEMPLO PARA TESTES
-- Execute este script no Supabase SQL Editor
-- ============================================================

-- 1. Inserir usuários de exemplo (se não existirem)
INSERT INTO usuarios (nome, email, telefone, senha_hash)
VALUES 
  ('Elien Silva', 'elien@ismtecnologia.com.br', '(11) 99999-0001', 'demo123'),
  ('Maria Santos', 'maria@ismtecnologia.com.br', '(11) 99999-0002', 'demo123'),
  ('João Oliveira', 'joao@ismtecnologia.com.br', '(11) 99999-0003', 'demo123')
ON CONFLICT DO NOTHING;

-- 2. Inserir parceiros de exemplo
INSERT INTO parceiros (nome, tipo_pessoa, nome_fantasia, tipos)
VALUES
  ('Client Services Brasil S.A.', 'PJ', 'CS Brasil', ARRAY['cliente']),
  ('Tech Solutions LTDA', 'PJ', 'Tech Solutions', ARRAY['fornecedor']),
  ('Contabilidade Almeida', 'PJ', 'Almeida Contabilidade', ARRAY['fornecedor']),
  ('Cliente Exemplo S.A.', 'PJ', 'Cliente Exemplo', ARRAY['cliente']),
  ('Fornecedor Teste LTDA', 'PJ', 'Teste Fornecedor', ARRAY['fornecedor'])
ON CONFLICT DO NOTHING;

-- 3. Inserir contas bancárias
INSERT INTO contas_bancarias (nome, tipo, banco, agencia, conta, saldo_inicial, cor, data_inicio)
VALUES
  ('Itau CC', 'corrente', 'Itau', '1234', '56789-0', 0, '#EC4899', '2024-01-01'),
  ('Bradesco CC', 'corrente', 'Bradesco', '5678', '90123-4', 0, '#3B82F6', '2024-01-01'),
  ('Caixa CC', 'corrente', 'Caixa', '9012', '34567-8', 0, '#F59E0B', '2024-01-01'),
  ('Santander CC', 'corrente', 'Santander', '3456', '78901-2', 0, '#22C55E', '2024-01-01')
ON CONFLICT DO NOTHING;

-- 4. Inserir categorias do plano de contas
INSERT INTO plano_contas (tipo, categoria, subcategoria)
VALUES
  ('CR', 'Receita de Serviços', 'Consultoria'),
  ('CR', 'Receita de Serviços', 'Desenvolvimento'),
  ('CR', 'Receita de Serviços', 'Suporte Técnico'),
  ('CR', 'Receita de Serviços', 'Treinamentos'),
  ('CR', 'Receita de Licenças', 'Software'),
  ('CP', 'Despesas Operacionais', 'Aluguel'),
  ('CP', 'Despesas Operacionais', 'Luz'),
  ('CP', 'Despesas Operacionais', 'Internet'),
  ('CP', 'Despesas Operacionais', 'Telefone'),
  ('CP', 'Despesas com Pessoal', 'Salários'),
  ('CP', 'Despesas com Pessoal', 'Benefícios'),
  ('CP', 'Despesas Administrativas', 'Materiais'),
  ('CP', 'Despesas Administrativas', 'Manutenção'),
  ('CP', 'Despesas Financeiras', 'Juros'),
  ('CP', 'Despesas Financeiras', 'Tarjetas Bancárias')
ON CONFLICT DO NOTHING;

-- 5. Inserir lançamentos de exemplo
INSERT INTO lancamentos (tipo, vencimento, competencia, conta_id, parceiro_id, descricao, valor, status)
SELECT 
  'CR',
  CURRENT_DATE - (random() * 30)::integer,
  TO_CHAR(CURRENT_DATE - (random() * 30)::integer, 'YYYY-MM'),
  (SELECT id FROM contas_bancarias LIMIT 1),
  (SELECT id FROM parceiros WHERE 'cliente' = ANY(tipos) LIMIT 1),
  'Projeto Consultoria Fase ' || gs,
  (random() * 5000 + 500)::numeric(15,2),
  CASE WHEN random() > 0.3 THEN 'recebido' ELSE 'pendente' END
FROM generate_series(1, 5) gs;

INSERT INTO lancamentos (tipo, vencimento, competencia, conta_id, parceiro_id, descricao, valor, status)
SELECT 
  'CP',
  CURRENT_DATE + (random() * 30)::integer,
  TO_CHAR(CURRENT_DATE + (random() * 30)::integer, 'YYYY-MM'),
  (SELECT id FROM contas_bancarias LIMIT 1),
  (SELECT id FROM parceiros WHERE 'fornecedor' = ANY(tipos) LIMIT 1),
  'Despesa mensal ' || gs,
  (random() * 2000 + 200)::numeric(15,2),
  CASE WHEN random() > 0.5 THEN 'pago' ELSE 'pendente' END
FROM generate_series(1, 5) gs;

-- 6. Inserir cards de exemplo para o Kanban (Tarefas)
INSERT INTO kanban_cards (titulo, descricao, coluna, prioridade, prazo, departamentos, tags, checklist)
VALUES
  ('Revisar contrato cliente ABC', 'Verificar cláusulas contratuais e ajustar valores', 'solicitado', 'alta', CURRENT_DATE + 3, ARRAY['Financeiro', 'Jurídico'], ARRAY['urgente'], '[{"id":"1","texto":"Ler contrato","completed":true},{"id":"2","texto":"Verificar valores","completed":false}]'),
  ('Atualizar planilha de custos', 'Incluir novos fornecedores e preços 2024', 'em_analise', 'media', CURRENT_DATE + 7, ARRAY['Financeiro'], ARRAY['planilha'], '[{"id":"1","texto":"Baixar nova planilha","completed":true},{"id":"2","texto":"Atualizar valores","completed":false}]'),
  ('Reunião com equipe TI', 'Planejamento sprint próxima semana', 'em_execucao', 'media', CURRENT_DATE + 1, ARRAY['Operacional', 'TI'], ARRAY['reuniao'], '[{"id":"1","texto":"Preparar pauta","completed":true},{"id":"2","texto":"Enviar convite","completed":true}]'),
  ('Conciliação bancária Itaú', 'Conferir extrato com lançamentos', 'em_analise', 'urgente', CURRENT_DATE, ARRAY['Financeiro'], ARRAY['conciliacao'], '[{"id":"1","texto":"Baixar extrato","completed":false}]'),
  ('Elaborar relatório mensal', 'Relatório gerencial de Fevereiro', 'aguardando_aprovacao', 'alta', CURRENT_DATE - 1, ARRAY['Financeiro', 'Diretoria'], ARRAY['relatorio'], '[{"id":"1","texto":"Coletar dados","completed":true},{"id":"2","texto":"Gerar gráficos","completed":true},{"id":"3","texto":"Revisar texto","completed":false}]'),
  ('Aprovar orçamento Marketing', 'Campanha pubblicitária Q2 2024', 'concluido', 'media', CURRENT_DATE - 5, ARRAY['Marketing'], ARRAY['orcamento'], '[{"id":"1","texto":"Solicitar orçamentos","completed":true},{"id":"2","texto":"Comparar valores","completed":true},{"id":"3","texto":"Aprovar melhor proposta","completed":true}]'),
  ('Configurar novo servidor', 'Deploy aplicação produção', 'em_execucao', 'alta', CURRENT_DATE + 2, ARRAY['TI', 'Operacional'], ARRAY['infra'], '[{"id":"1","texto":"Provisionar instância","completed":true},{"id":"2","texto":"Instalar dependências","completed":false}]'),
  ('Responder ticket #4521', 'Problema de login no sistema', 'solicitado', 'baixa', CURRENT_DATE + 5, ARRAY['TI', 'Suporte'], ARRAY['suporte'], '[]')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONFIRMAÇÃO
-- ============================================================
SELECT 
  'usuarios' as tabela, count(*) as total FROM usuarios
UNION ALL SELECT 'parceiros', count(*) FROM parceiros
UNION ALL SELECT 'contas_bancarias', count(*) FROM contas_bancarias
UNION ALL SELECT 'plano_contas', count(*) FROM plano_contas
UNION ALL SELECT 'lancamentos', count(*) FROM lancamentos
UNION ALL SELECT 'kanban_cards', count(*) FROM kanban_cards;