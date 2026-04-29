-- Script SQL para criar tabelas do Kanban
-- Execute este script no SQL Editor do Supabase

-- Tabela kanban_cards
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

-- Tabela kanban_historico (logs de movimentação)
CREATE TABLE IF NOT EXISTS kanban_historico (
  id SERIAL PRIMARY KEY,
  card_id INTEGER REFERENCES kanban_cards(id) ON DELETE CASCADE,
  coluna_anterior TEXT,
  coluna_nova TEXT,
  comentario TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela kanban_comentarios
CREATE TABLE IF NOT EXISTS kanban_comentarios (
  id SERIAL PRIMARY KEY,
  card_id INTEGER REFERENCES kanban_cards(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) NOT NULL,
  comentario TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_kanban_cards_coluna ON kanban_cards(coluna);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_prioridade ON kanban_cards(prioridade);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_prazo ON kanban_cards(prazo);
CREATE INDEX IF NOT EXISTS idx_kanban_historico_card_id ON kanban_historico(card_id);

-- Confirmar criação
SELECT 'Tabelas criadas com sucesso!' AS resultado;