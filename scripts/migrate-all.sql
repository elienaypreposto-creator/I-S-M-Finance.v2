-- Script completo de migração para todas as tabelas do sistema
-- Execute este script no SQL Editor do Supabase

-- Verificar tabelas existentes
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Criar tabela de usuários (se não existir)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha TEXT,
  cargo TEXT,
  avatar TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de parceiros (clientes/fornecedores)
CREATE TABLE IF NOT EXISTS parceiros (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo_pessoa TEXT DEFAULT 'PF',
  cpf_cnpj TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de contas bancárias
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  tipo_conta TEXT DEFAULT 'corrente',
  saldo_inicial NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de plano de contas
CREATE TABLE IF NOT EXISTS plano_contas (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- RECEITA, DESPESA
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de departamentos
CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de centros de custos
CREATE TABLE IF NOT EXISTS centros_custos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  departamento_id INTEGER REFERENCES departamentos(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de lançamentos
CREATE TABLE IF NOT EXISTS lancamentos (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- CP, CR
  vencimento DATE NOT NULL,
  competencia DATE,
  conta_id INTEGER REFERENCES contas_bancarias(id),
  parceiro_id INTEGER REFERENCES parceiros(id),
  descricao TEXT,
  valor NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente, pago, recebido, atrasado, cancelado
  plano_conta_id INTEGER REFERENCES plano_contas(id),
  departamento_id INTEGER REFERENCES departamentos(id),
  centro_custo_id INTEGER REFERENCES centros_custos(id),
  parcela_atual INTEGER DEFAULT 1,
  total_parcelas INTEGER DEFAULT 1,
  riscos JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de lançamentos (com o campo criado_por)
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS criado_por INTEGER REFERENCES usuarios(id);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_lancamentos_tipo ON lancamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON lancamentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_conta_id ON lancamentos(conta_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_parceiro_id ON lancamentos(parceiro_id);

-- Tabelas do Kanban (Tarefas)
CREATE TABLE IF NOT EXISTS kanban_cards (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  coluna TEXT NOT NULL DEFAULT 'solicitado',
  responsavel_id INTEGER REFERENCES usuarios(id),
  responsaveis_multiplos JSONB DEFAULT '[]',
  departamentos JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  checklist JSONB DEFAULT '[]',
  comentarios_count INTEGER DEFAULT 0,
  anexos_count INTEGER DEFAULT 0,
  prazo DATE,
  prioridade TEXT NOT NULL DEFAULT 'media',
  created_by INTEGER REFERENCES usuarios(id),
  responsavel_nome TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_historico (
  id SERIAL PRIMARY KEY,
  card_id INTEGER REFERENCES kanban_cards(id) ON DELETE CASCADE,
  coluna_anterior TEXT,
  coluna_nova TEXT,
  comentario TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_comentarios (
  id SERIAL PRIMARY KEY,
  card_id INTEGER REFERENCES kanban_cards(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) NOT NULL,
  comentario TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Confirmar criação
SELECT 'Migração concluída com sucesso!' AS resultado;

-- Listar todas as tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;