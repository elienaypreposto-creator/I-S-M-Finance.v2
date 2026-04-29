-- =============================================================================
-- SCRIPT COMPLETO DE MIGRAÇÃO - I-S-M-FINANCE
-- Execute este script no SQL Editor do Supabase
-- =============================================================================

-- =============================================================================
-- TABELA: usuarios
-- =============================================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT,
  celular TEXT,
  senha_hash TEXT NOT NULL,
  bloqueado BOOLEAN DEFAULT FALSE NOT NULL,
  ultimo_acesso TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: permissoes
-- =============================================================================
CREATE TABLE IF NOT EXISTS permissoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: filiais
-- =============================================================================
CREATE TABLE IF NOT EXISTS filiais (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  endereco TEXT,
  telefone TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: departamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: centros_custos
-- =============================================================================
CREATE TABLE IF NOT EXISTS centros_custos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: parceiros (Clientes/Fornecedores)
-- =============================================================================
CREATE TABLE IF NOT EXISTS parceiros (
  id SERIAL PRIMARY KEY,
  tipo_pessoa TEXT NOT NULL DEFAULT 'PF',
  cpf_cnpj TEXT,
  nome TEXT NOT NULL,
  nome_fantasia TEXT,
  tipos TEXT[] DEFAULT '{}',
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  centro_custo_id INTEGER REFERENCES centros_custos(id) ON DELETE SET NULL,
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  bloqueado BOOLEAN DEFAULT FALSE NOT NULL,
  chaves_pix JSONB DEFAULT '[]',
  dados_bancarios JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: contas_bancarias
-- =============================================================================
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- corrente, movimento, poupanca
  banco TEXT,
  agencia TEXT,
  digito_agencia TEXT,
  conta TEXT,
  digito_conta TEXT,
  nome TEXT NOT NULL,
  empresa TEXT,
  saldo_inicial NUMERIC(15,2) DEFAULT 0,
  data_inicio DATE NOT NULL,
  status TEXT DEFAULT 'ativo' NOT NULL, -- ativo, bloqueado
  cor TEXT DEFAULT '#3BA8DC',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: plano_contas
-- =============================================================================
CREATE TABLE IF NOT EXISTS plano_contas (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- receita, custo, despesa
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  codigo TEXT,
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: lancamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS lancamentos (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- CP (Contas a Pagar), CR (Contas a Receber)
  vencimento DATE NOT NULL,
  competencia DATE,
  conta_id INTEGER REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  parceiro_id INTEGER REFERENCES parceiros(id) ON DELETE SET NULL,
  descricao TEXT,
  valor NUMERIC(15,2) NOT NULL,
  status TEXT DEFAULT 'pendente' NOT NULL, -- pendente, pago, recebido, atrasado, cancelado
  plano_conta_id INTEGER REFERENCES plano_contas(id) ON DELETE SET NULL,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  centro_custo_id INTEGER REFERENCES centros_custos(id) ON DELETE SET NULL,
  parcela_atual INTEGER DEFAULT 1,
  total_parcelas INTEGER DEFAULT 1,
  riscos JSONB DEFAULT '[]',
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: metas
-- =============================================================================
CREATE TABLE IF NOT EXISTS metas (
  id SERIAL PRIMARY KEY,
  plano_conta_id INTEGER REFERENCES plano_contas(id) ON DELETE CASCADE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL, -- 1-12
  valor_projetado NUMERIC(15,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(plano_conta_id, ano, mes)
);

-- =============================================================================
-- TABELA: conciliacoes
-- =============================================================================
CREATE TABLE IF NOT EXISTS conciliacoes (
  id SERIAL PRIMARY KEY,
  conta_id INTEGER REFERENCES contas_bancarias(id) ON DELETE CASCADE NOT NULL,
  periodo_inicio DATE,
  periodo_fim DATE,
  status TEXT DEFAULT 'pendente' NOT NULL, -- pendente, conciliado
  arquivo_nome TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: itens_conciliacao
-- =============================================================================
CREATE TABLE IF NOT EXISTS itens_conciliacao (
  id SERIAL PRIMARY KEY,
  conciliacao_id INTEGER REFERENCES conciliacoes(id) ON DELETE CASCADE NOT NULL,
  lancamento_id INTEGER REFERENCES lancamentos(id) ON DELETE SET NULL,
  valor_extrato NUMERIC(15,2) NOT NULL,
  desconto NUMERIC(15,2) DEFAULT 0,
  acrescimo NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'pendente' NOT NULL, -- pendente, vinculado, ignorado
  tipo_extrato TEXT NOT NULL, -- debito, credito
  descricao TEXT,
  data DATE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELA: tokens_api
-- =============================================================================
CREATE TABLE IF NOT EXISTS tokens_api (
  id SERIAL PRIMARY KEY,
  descricao TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_preview TEXT,
  data_expiracao DATE,
  ativo BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- TABELAS: kanban (Tarefas)
-- =============================================================================
CREATE TABLE IF NOT EXISTS kanban_cards (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  coluna TEXT NOT NULL DEFAULT 'solicitado',
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  responsaveis_multiplos INTEGER[] DEFAULT '{}',
  departamentos TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  checklist JSONB DEFAULT '[]',
  comentarios_count INTEGER DEFAULT 0,
  anexos_count INTEGER DEFAULT 0,
  prazo DATE,
  prioridade TEXT NOT NULL DEFAULT 'media',
  created_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

COMMENT ON COLUMN kanban_cards.coluna IS 'solicitado, em_analise, em_execucao, aguardando_aprovacao, concluido';
COMMENT ON COLUMN kanban_cards.prioridade IS 'baixa, media, alta, urgente';

CREATE TABLE IF NOT EXISTS kanban_historico (
  id SERIAL PRIMARY KEY,
  card_id INTEGER REFERENCES kanban_cards(id) ON DELETE CASCADE NOT NULL,
  coluna_anterior TEXT,
  coluna_nova TEXT,
  comentario TEXT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kanban_comentarios (
  id SERIAL PRIMARY KEY,
  card_id INTEGER REFERENCES kanban_cards(id) ON DELETE CASCADE NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL NOT NULL,
  comentario TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kanban_anexos (
  id SERIAL PRIMARY KEY,
  card_id INTEGER REFERENCES kanban_cards(id) ON DELETE CASCADE NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url TEXT NOT NULL,
  tipo TEXT,
  tamanho INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_lancamentos_tipo ON lancamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON lancamentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_conta_id ON lancamentos(conta_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_parceiro_id ON lancamentos(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_tipo_pessoa ON parceiros(tipo_pessoa);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_coluna ON kanban_cards(coluna);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_prioridade ON kanban_cards(prioridade);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_prazo ON kanban_cards(prazo);

-- =============================================================================
-- CONFIRMAÇÃO
-- =============================================================================
SELECT '✅ Migração concluída com sucesso!' AS mensagem;

-- Listar todas as tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;