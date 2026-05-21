# ISM Tecnologia — Sistema Financeiro (I-S-M-Finance)

> Sistema completo de controle financeiro e gestão de fluxo de caixa para a **ISM Tecnologia**.

---

## 1. Visão Geral

O **I-S-M-Finance** é uma aplicação full-stack monorepo para gestão financeira empresarial. Ele oferece dashboard com KPIs, lançamentos de contas a pagar/receber, conciliação bancária, quadro Kanban, relatórios contábeis/fiscais, DRE gerencial, fluxo de caixa, metas orçamentárias e integração com Power BI via API REST.

---

## 2. Arquitetura do Projeto

```
I-S-M-Finance.v2/
├── artifacts/
│   ├── api-server/          ← Backend (Express 5 + TypeScript)
│   │   └── src/
│   │       ├── routes/       ← Rotas da API (CRUD de cada módulo)
│   │       ├── lib/supabase.ts  ← Cliente Supabase
│   │       ├── app.ts        ← Configuração do Express
│   │       └── index.ts      ← Entry point do servidor
│   ├── ism-financeiro/       ← Frontend (React + Vite + TypeScript)
│   │   └── src/
│   │       ├── pages/         ← Páginas/telas da aplicação
│   │       ├── components/    ← Componentes reutilizáveis
│   │       ├── hooks/         ← Hooks customizados
│   │       ├── lib/           ← Configurações e utilitários
│   │       ├── App.tsx        ← Roteamento e providers
│   │       ├── main.tsx       ← Entry point do Vite
│   │       └── index.css      ← Variáveis de tema (dark mode)
│   └── mockup-sandbox/        ← Sandbox de mockup para testes visuais
├── lib/
│   ├── db/                   ← Biblioteca compartilhada de banco de dados
│   │   └── src/
│   │       └── schema/        ← Definições das tabelas (Drizzle ORM)
│   ├── api-zod/              ← Esquemas Zod gerados pela Orval
│   └── api-client-react/     ← Hooks React Query gerados pela Orval
├── api/index.js              ← Handler serverless (Vercel)
├── public/                   ← Arquivos estáticos públicos (frontend)
├── scripts/                  ← Scripts utilitários (build, copy, etc.)
├── modelo_financeiro.xlsx    ← Modelo financeiro de referência
├── package.json              ← Root do monorepo
├── pnpm-workspace.yaml       ← Configuração do pnpm workspaces
└── vercel.json               ← Configuração de deploy na Vercel
```

O projeto utiliza **pnpm workspaces** como ferramenta de monorepo. Os pacotes são:

| Pacote | Caminho | Função |
|--------|---------|--------|
| workspace root | `/` | Coordenação de builds e typecheck |
| `@workspace/api-server` | `artifacts/api-server/` | API REST Express 5 |
| `@workspace/ism-financeiro` | `artifacts/ism-financeiro/` | Frontend React + Vite |
| `@workspace/db` | `lib/db/` | Schema Drizzle ORM + migrações |
| `@workspace/api-zod` | `lib/api-zod/` | Esquemas Zod gerados automaticamente |
| `@workspace/api-client-react` | `lib/api-client-react/` | Hooks React Query gerados |
| `@workspace/api-spec` | `lib/api-spec/` | OpenAPI spec + codegen Orval |

---

## 3. Tecnologias (Stack)

### 3.1. Infraestrutura e Tooling

| Categoria | Tecnologia |
|-----------|------------|
| Monorepo | pnpm workspaces |
| Node.js | v24 |
| TypeScript | v5.9 |
| Build | esbuild (bundle CJS) |
| Deploy | Vercel (serverless via `api/index.js`) |

### 3.2. Backend

| Categoria | Tecnologia |
|-----------|------------|
| Framework | Express 5 |
| Banco de Dados | PostgreSQL |
| ORM | Drizzle ORM v0.45 |
| Validação | Zod v3 + drizzle-zod |
| Runtime dev | tsx (TypeScript execute) |
| CORS | cors middleware |
| Cookies | cookie-parser |

### 3.3. Frontend

| Categoria | Tecnologia |
|-----------|------------|
| Framework | React 19.1 |
| Build Tool | Vite 7 |
| Estilização | Tailwind CSS v4.1 + shadcn/ui |
| Roteamento | Wouter v3.3 |
| Gerenciamento de Estado | TanStack React Query v5.90 |
| Formulários | React Hook Form + HookForm Resolvers |
| Gráficos | Recharts v2.15 |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Ícones | Lucide React + react-icons |
| Animações | Framer Motion v12 |
| Datas | date-fns + react-day-picker |
| Exportação | xlsx v0.18 + jsPDF + jspdf-autotable |
| Notificações | Sonner + @radix-ui/react-toast |
| UI Components | Radix UI (todos os componentes do shadcn/ui) |

### 3.4. Banco de Dados

- **Supabase** como provedor PostgreSQL (acessado via `@supabase/supabase-js` — ver `artifacts/api-server/src/lib/supabase.ts`)
- **Drizzle ORM** para definição de schema e queries
- Migrações via `drizzle-kit push`

---

## 4. Identidade Visual

O sistema opera em **Dark Mode por padrão**. Paleta:

| Elemento | Cor | Hex |
|----------|-----|-----|
| Background | Dark | `#1E1E2E` |
| Card/Panel | Medium dark | `#2A2A3E` |
| Sidebar | Navy blue | `#1A2B5E` |
| Primary | Blue | `#3BA8DC` |
| Text | Light gray | `#E8EAF0` |
| Success | Green | `#27AE60` |
| Danger | Red | `#E74C3C` |
| Warning | Amber | `#F39C12` |
| Expenses | Orange | `#E67E22` |
| Revenue | Teal | `#1ABC9C` |
| Font | Inter (Google Fonts) | |

---

## 5. Banco de Dados — Schema Completo

O sistema possui **13 tabelas** no PostgreSQL, definidas via Drizzle ORM em `lib/db/src/schema/`:

### 5.1. `usuarios`

Tabela de usuários do sistema.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK auto-incremento |
| `nome` | text | Nome completo |
| `email` | text | Email único |
| `telefone`, `celular` | text | Contatos opcionais |
| `senha_hash` | text | Hash da senha (obrigatório) |
| `bloqueado` | boolean | Se o usuário está bloqueado (default: false) |
| `ultimo_acesso` | timestamp | Último acesso do usuário |

### 5.2. `permissoes`

Permissões granulares por usuário.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `usuario_id` | integer FK → usuarios.id | Usuário dono da permissão |
| `permissao` | text | Nome/string da permissão |

### 5.3. `filiais`

Cadastro de filiais da empresa.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `nome` | text | Nome da filial |

### 5.4. `parceiros`

Clientes, fornecedores e demais parceiros.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `tipo_pessoa` | text | "PF" (Pessoa Física) ou "PJ" (Pessoa Jurídica) |
| `cpf_cnpj` | text | CPF ou CNPJ |
| `nome`, `nome_fantasia` | text | Razão social e nome fantasia |
| `tipos` | jsonb `string[]` | Lista de papéis: cliente, fornecedor, transportadora, etc. |
| `departamento_id` | integer FK → departamentos.id | Departamento vinculado |
| `centro_custo_id` | integer FK → centros_custos.id | Centro de custo vinculado |
| `ativo`, `bloqueado` | boolean | Status do parceiro |
| `chaves_pix` | jsonb | Array de objetos `{tipo, chave}` |
| `dados_bancarios` | jsonb | Array de objetos `{banco, agencia, digito_agencia, conta, digito_conta}` |

### 5.5. `contas_bancarias`

Contas bancárias da empresa.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `tipo` | text | "corrente", "movimento" ou "poupanca" |
| `banco`, `agencia`, `digito_agencia` | text | Dados bancários |
| `conta`, `digito_conta` | text | Número da conta |
| `nome`, `empresa` | text | Nome da conta e empresa |
| `saldo_inicial` | numeric(15,2) | Saldo inicial (default: 0) |
| `data_inicio` | date | Data de abertura |
| `status` | text | "ativo" ou "bloquedo" (default: ativo) |
| `cor` | text | Cor para identificação visual (default: #3BA8DC) |

### 5.6. `plano_contas`

Plano de contas categorizado (estrutura hierárquica).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `tipo` | text | "receita", "custo" ou "despesa" |
| `categoria` | text | Categoria principal |
| `subcategoria` | text | Subcategoria (opcional) |
| `codigo` | text | Código identificador |
| `ativo` | boolean | Se a conta está ativa (default: true) |

### 5.7. `lancamentos`

**Tabela central do sistema** — registros financeiros (contas a pagar e a receber).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `tipo` | text | "CP" (Conta a Pagar) ou "CR" (Conta a Receber) |
| `vencimento` | date | Data de vencimento |
| `competencia` | date | Competência do lançamento |
| `conta_id` | integer FK → contas_bancarias.id | Conta bancária vinculada |
| `parceiro_id` | integer FK → parceiros.id | Parceiro vinculado |
| `descricao` | text | Descrição do lançamento |
| `valor` | numeric(15,2) | Valor monetário |
| `status` | text | "pendente", "pago", "recebido", "atrasado", "cancelado" |
| `plano_conta_id` | integer FK → plano_contas.id | Classificação contábil |
| `departamento_id` | integer FK → departamentos.id | Departamento |
| `centro_custo_id` | integer FK → centros_custos.id | Centro de custo |
| `parcela_atual`, `total_parcelas` | integer | Suporte a parcelamentos |
| `riscos` | jsonb `string[]` | Tags de risco |
| `criado_por` | integer FK → usuarios.id | Usuário que criou |

### 5.8. `conciliacoes` e `itens_conciliacao`

Conciliação bancária.

**`conciliacoes`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `conta_id` | integer FK → contas_bancarias.id | Conta bancária |
| `periodo_inicio`, `periodo_fim` | date | Período da conciliação |
| `status` | text | "pendente" ou "conciliado" |
| `arquivo_nome` | text | Nome do arquivo OFX importado |

**`itens_conciliacao`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `conciliacao_id` | integer FK → conciliacoes.id | Conciliação pai |
| `lancamento_id` | integer FK → lancamentos.id | Lançamento vinculado (nullable) |
| `valor_extrato` | numeric(15,2) | Valor do item no extrato |
| `desconto`, `acrescimo` | numeric(15,2) | Ajustes financeiros |
| `status` | text | "pendente", "vinculado" ou "ignorado" |
| `tipo_extrato` | text | "debito" ou "credito" |
| `descricao`, `data` | text/date | Detalhes do item |

### 5.9. `metas`

Metas orçamentárias mensais vinculadas ao plano de contas.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `plano_conta_id` | integer FK → plano_contas.id | Conta do plano de metas |
| `ano`, `mes` | integer | Ano e mês (1-12) da meta |
| `valor_projetado` | numeric(15,2) | Valor projetado/metas |
| **Unique** | (plano_conta_id, ano, mes) | Uma meta por conta/mês/ano |

### 5.10. `departamentos` e `centros_custos`

Estrutura organizacional e centros de custo.

**`departamentos`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `nome` | text | Nome do departamento |

**`centros_custos`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `nome` | text | Nome do centro de custo |
| `departamento_id` | integer FK → departamentos.id | Departamento pai |

### 5.11. `kanban_cards`, `kanban_comentarios`, `kanban_anexos`, `kanban_historico`

Sistema de gestão de tarefas em quadro Kanban.

**`kanban_cards`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `titulo`, `descricao` | text | Título e descrição do card |
| `coluna` | text | Coluna atual (5 colunas): "solicitado", "em_andamento", "revisao", "aprovado", "concluido" (default: "solicitado") |
| `responsavel_id` | integer FK → usuarios.id | Responsável principal |
| `responsavel_nome` | text | Nome do responsável (cache/denormalizado) |
| `responsaveis_multiplos` | jsonb `number[]` | Múltiplos responsáveis |
| `departamentos`, `tags` | jsonb `string[]` | Tags e departamentos |
| `checklist` | jsonb | Array de `{id, texto, completed}` |
| `comentarios_count`, `anexos_count` | integer | Contadores de comentários e anexos (denormalizados) |
| `prazo` | date | Data limite |
| `prioridade` | text | "baixa", "media", "alta" (default: "media") |
| `created_by` | integer FK → usuarios.id | Usuário que criou o card |

**`kanban_comentarios`:** Comentários vinculados a cards (`card_id`, `usuario_id`, `comentario`).
**`kanban_anexos`:** Anexos vinculados a cards (`card_id`, `usuario_id`, `nome_arquivo`, `url`, `tipo`, `tamanho`).
**`kanban_historico`:** Log de mudanças de coluna (com `coluna_anterior`, `coluna_nova`, `usuario_id`, `comentario`).

### 5.12. `tokens_api`

Tokens para integração Power BI / API externa.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | serial | PK |
| `descricao` | text | Descrição do token |
| `token_hash` | text | Hash do token (único) |
| `token_preview` | text | Preview parcial (primeiros/últimos chars) |
| `data_expiracao` | date | Data de expiração |
| `ativo` | boolean | Token ativo? |

### 5.13. `logs`

Tabela de logs de auditoria.

---

## 6. Backend — API REST

### 6.1. Configuração

- **Entry point:** `artifacts/api-server/src/index.ts`
- **App:** `artifacts/api-server/src/app.ts`
- **Porta:** 5000 (lida de variável de ambiente)
- **CORS:** Habilitado
- **Base path:** `/api`

### 6.2. Rotas da API

| Prefixo | Arquivo | Módulo | Descrição |
|---------|---------|--------|-----------|
| `/healthz` | `app.ts` | Health Check | Status do servidor (200 OK) |
| `/api/dashboard` | `dashboard.ts` | Dashboard | 9 endpoints: KPIs, projeções, inadimplência, risco |

Detalhamento dos endpoints do Dashboard:

| Endpoint | Query Params | Descrição |
|----------|--------------|-----------|
| `/api/dashboard/kpis` | — | `contasReceberAtraso`, `contasReceberAberto`, `contasPagarAberto`, `contasPagarAtraso` |
| `/api/dashboard/projecao-mes` | — | Projeções de recebimentos/pagamentos do mês atual |
| `/api/dashboard/projecao-dias` | `?dias=30` | Projeção diária de saldo acumulado |
| `/api/dashboard/inadimplencia-clientes` | `?tab=inadimplente` | Inadimplência de clientes (inadimplente, vencidos, proximos_vencer) |
| `/api/dashboard/inadimplencia-fornecedores` | `?tab=inadimplente` | Inadimplência de fornecedores |
| `/api/dashboard/dias-atraso` | — | Top 10 lançamentos atrasados por dias |
| `/api/dashboard/nivel-risco` | — | Contas a pagar atrasadas com tags de risco |
| `/api/dashboard/fluxo-caixa-mensal` | `?ano=2024` | Receitas vs despesas mensais |
| `/api/dashboard/saidas-plano-contas` | — | Top 6 categorias de despesas por percentual |
| `/api/dashboard/entradas-plano-contas` | — | Top 6 categorias de entradas por percentual |
| `/api/lancamentos` | `lancamentos.ts` | Lançamentos | CRUD + paginação + filtros (tipo, status, data, parceiro, busca) |
| `/api/parceiros` | `parceiros.ts` | Parceiros | CRUD + paginação + busca por nome |
| `/api/contas-bancarias` | `contas-bancarias.ts` | Contas Bancárias | CRUD completo |
| `/api/plano-contas` | `plano-contas.ts` | Plano de Contas | CRUD ordenado por tipo/categoria |
| `/api/metas` | `metas.ts` | Metas | GET por ano; POST com upsert (atualiza se existir) |
| `/api/conciliacoes` | `conciliacoes.ts` | Conciliação | Importar, vincular, ignorar itens, fechar conciliação |
| `/api/kanban` | `kanban.ts` | Kanban | CRUD cards (GET/POST/PATCH), GET usuarios — usa Supabase diretamente |
| `/api/relatorios` | `relatorios.ts` | Relatórios | Fechamento, DRE, fluxo caixa, metas, contábil-fiscal |
| `/api/usuarios` | `usuarios.ts` | Usuários | CRUD + permissões (HASH SHA-256) |
| `/api/filiais` | `filiais.ts` | Filiais | CRUD simples |
| `/api/tokens-api` | `tokens-api.ts` | Tokens API | CRUD — token gerado e mostrado apenas uma vez |
| `/api/departamentos` | `departamentos.ts` | Departamentos | CRUD de departamentos |
| `/api/v1/*` | `v1.ts` | Power BI API | 8 endpoints com Bearer token |

### 6.4. Observações Importantes do Backend

1. **Kanban via Supabase:** A rota `/api/kanban/*` usa o cliente `@supabase/supabase-js` diretamente (não Drizzle) para operações. Isso permite joins relacionais complexos que seriam difíceis com Drizzle ORM.
2. **Hash de senhas:** Senhas são hashadas com SHA-256 (via `crypto.createHash`) no cadastro de usuários. **Atenção:** SHA-256 não é considerado seguro para senhas; o ideal seria `bcrypt` ou `Argon2`.
3. **Tokens API:** O token é gerado em memória (`crypto.randomBytes(32)`), hashado com SHA-256, e o token completo é retornado **apenas uma vez** na criação. Para uso posterior, deve-se copiar imediatamente.
4. **Serverless:** Em produção (Vercel), o app é exportado como `app.listen()` condicionalmente — apenas executa o server se `NODE_ENV !== "production"` ou `RUN_LOCAL === "true"`.
5. **Relatórios com dados mockados:** As rotas DRE, Fluxo de Caixa e Metas usam dados gerados aleatoriamente (`Math.random()`). Apenas o Fechamento Mensal e Contábil-Fiscal usam dados reais do banco.

### 6.3. API Power BI (`/api/v1/*`)

Rota dedicada para consumo externo (Power BI, dashboards terceiros). Usa autenticação por **Bearer Token** (validado contra `tokens_api`):

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/v1/bancos` | GET | Lista todas as contas bancárias |
| `/api/v1/contasPagar` | GET | Contas a pagar (paginação, 100 por página) |
| `/api/v1/contasReceber` | GET | Contas a receber (paginação, 100 por página) |
| `/api/v1/pessoas` | GET | Todos os parceiros |
| `/api/v1/filiais` | GET | Lista de filiais |
| `/api/v1/planoContas` | GET | Plano de contas completo |
| `/api/v1/categoriaPlanoConta` | GET | Categorias do plano de contas |
| `/api/v1/tipoDocumentos` | GET | Tipos de documentos (NF, Recibo, Contrato, Boleto, PIX, TED, DOC) |

---

## 7. Frontend — Páginas e Funcionalidades

### 7.1. Estrutura de Roteamento (Wouter)

O frontend usa **Wouter** como router, com `AppLayout` envolvendo todas as rotas. Cada rota mapeia para uma página/componente.

### 7.2. Descrição Detalhada das Páginas

#### `/` — Dashboard

- **KPIs:** Saldo em conta, receitas do mês, despesas do mês, inadimplência
- **Gráficos:** Fluxo de caixa mensal (receitas vs despesas), projeção de dias
- **Tabelas:** Inadimplência por cliente e por fornecedor em tabs
- **Filtros:** Intervalo de datas via `DateRangePicker`

#### `/kanban` — Quadro Kanban

- **5 colunas:** Solicitado, Em Andamento, Revisão, Aprovado, Concluído
- **Drag & Drop:** Cards arrastáveis entre colunas via `@dnd-kit`
- **Cards:** Mostram título, responsável, prazo, prioridade, checklist
- **Modal:** Criação/edição de cards com detalhes completos
- **Persistência:** Estado salvo no banco (PostgreSQL via API)

#### `/lancamentos` — Lançamentos Financeiros

- Listagem de contas a pagar (CP) e a receber (CR)
- Filtros por status, tipo, período, parceiro, conta bancária, plano de conta
- Criação/edição parcelada
- Atualização de status (pendente → pago/recebido)
- Geração de lançamentos recorrentes
- Export para Excel e PDF

#### `/conciliacao` — Conciliação Bancária

- Importação de extrato OFX
- Listagem de itens do extrato (débitos e créditos)
- Vinculação manual entre itens do extrato e lançamentos do sistema
- Ajustes de desconto/acréscimo na vinculação
- Status: pendente, vinculado, ignorado
- Marcação como "conciliado" quando todos os itens processados

#### `/cadastros/parceiros` — Parceiros

- CRUD de parceiros com filtros
- Tipos múltiplos: Cliente, Fornecedor, Transportadora, etc.
- Dados bancários e chaves Pix por parceiro (armazenados em JSONB)

#### `/cadastros/contas-bancarias` — Contas Bancárias

- Cadastro de contas correntes, de movimento e poupança
- Configuração de saldo inicial
- Identificação visual por cor

#### `/cadastros/plano-contas` — Plano de Contas

- Estrutura de categorias e subcategorias
- Tipos: Receita, Custo, Despesa
- Ativação/desativação de contas
- Visualização em tree/donut

#### `/cadastros/metas` — Metas Orçamentárias

- Interface estilo planilha (spreadsheet-like)
- Metas mensais para cada conta do plano de contas
- Comparativo projetado vs realizado
- Ano selecionável

#### `/cadastros/departamentos` — Departamentos & Centros de Custos

- CRUD de departamentos
- CRUD de centros de custo (vinculados a departamentos)

#### `/relatorios/fechamento-mensal` — Fechamento Mensal

- Relatório agrupado por categoria do plano de contas
- Comparativo entre período selecionado
- Totais por receita, custo e despesa

#### `/relatorios/contabil-fiscal` — Contábil-Fiscal

- Relatório contábil e fiscal com filtros
- Dados agrupados por tipo e categoria

#### `/relatorios/dre` — DRE Gerencial

- Demonstrativo de Resultados do Exercício (DRE)
- Tabela anual com colunas por mês
- Estrutura: Receita Bruta → Deduções → Receita Líquida → CMV → Lucro Bruto → Despesas → Lucro Líquido
- Regime: Competência ou Caixa

#### `/relatorios/fluxo-caixa` — Fluxo de Caixa

- Tabela anual de fluxo de caixa
- Seções: Receitas Operacionais, Despesas Operacionais, Investimentos, Resultado
- Valores por mês

#### `/relatorios/metas` — Relatório de Metas

- Comparativo metas vs realizado por conta/plano
- Visualização textual e tabular do desempenho

#### `/configuracoes/usuarios` — Usuários & Permissões

- Cadastro de usuários com nome, email, telefone
- Bloqueio/desbloqueio de acesso
- Gestão granular de permissões por usuário

#### `/configuracoes/filiais` — Filiais

- Cadastro simples de filiais da empresa

#### `/configuracoes/tokens-api` — Tokens de API

- Geração/revogação de tokens para integração externa
- Preview do token, data de expiração, status ativo/inativo
- Link para documentação Swagger

---

## 8. Regras de Negócio

### 8.1. Lançamentos Financeiros

1. **Tipos de lançamento:** `CP` (Conta a Pagar) e `CR` (Conta a Receber)
2. **Status:** `pendente` → `pago` (para CP) ou `recebido` (para CR); também pode ser `atrasado` ou `cancelado`
3. **Parcelamento:** Um lançamento pode ser dividido em múltiplas parcelas (`parcela_atual` / `total_parcelas`)
4. **Classificação:** Cada lançamento é vinculado a um plano de conta, departamento e centro de custo
5. **Competência:** Separada do vencimento, permite análise por período contábil correto
6. **Riscos:** Tags de risco armazenadas em JSONB para análise de exposição

### 8.2. Conciliação Bancária

1. **Importação:** Extratos vêm em arquivo OFX do banco
2. **Vinculação:** Cada item do extrato pode ser vinculado a um lançamento do sistema
3. **Ajustes:** Na vinculação, é possível aplicar desconto e acréscimo ao valor
4. **Status dos itens:** Pendente (não tratado), Vinculado (associado a lançamento), Ignorado (descartado)
5. **Fechamento:** Quando todos os itens são processados, a conciliação muda para "conciliado"

### 8.3. Metas Orçamentárias

1. **Granularidade:** Mensal — uma meta por conta do plano de contas por mês
2. **Unicidade:** Constraint unique em `(plano_conta_id, ano, mes)` impede duplicatas
3. **Comparação:** O relatório de metas compara o `valor_projetado` contra os valores reais dos lançamentos

### 8.4. Plano de Contas

1. **Hierarquia:** Categoria → Subcategoria
2. **Tipos:** Receita, Custo, Despesa (estrutura DRE)
3. **Ativação:** Contas podem ser ativadas/desativadas sem perda de histórico

### 8.5. Kanban

1. **Colunas fixas:** 5 colunas pré-definidas representando o fluxo de trabalho
2. **Drag & Drop:** Cards são movidos entre colunas via drag-and-drop
3. **Histórico:** Toda movimentação de coluna é registrada em `kanban_historico`
4. **Checklist:** Cards suportam checklists aninhados
5. **Múltiplos responsáveis:** Além do responsável principal, há suporte para array de responsáveis

### 8.6. API Power BI

1. **Autenticação:** Bearer Token validado contra `tokens_api` (hash armazenado)
2. **Expiração:** Tokens possuem `data_expiracao` configurável
3. **Preview:** Token é exibido parcialmente (prefixo/sufixo) para identificação sem expor o valor completo
4. **Endpoints:** Contas a pagar, contas a receber e tipos de documentos

### 8.7. Parceiros

1. **Tipos múltiplos:** Um parceiro pode ser simultaneamente cliente, fornecedor, etc.
2. **Dados bancários:** Múltiplas contas bancárias por parceiro (JSONB)
3. **Chaves Pix:** Múltiplas chaves por parceiro com tipo (CPF/CNPJ, e-mail, telefone, aleatória)
4. **Departamento/Centro de Custo:** Vinculação opcional para rateio

### 8.8. Usuários e Permissões

1. **Permissões granulares:** Múltiplas permissões por usuário (tabela `permissoes`)
2. **Bloqueio:** Usuários podem ser bloqueados sem exclusão
3. **Último acesso:** Timestamp do último login

---

## 9. Fluxo de Dados

```
┌─────────────────────────────────────────────────┐
│                  FRONTEND (React)                │
│  Port 5173 → Vite dev server                     │
│  Tailwind CSS + shadcn/ui + Recharts             │
│  Wouter routing + TanStack React Query           │
│  Proxy /api → http://localhost:5000/api         │
└──────────────┬──────────────────────────────────┘
               │ HTTP/JSON
               ▼
┌─────────────────────────────────────────────────┐
│                BACKEND (Express 5)               │
│  Port 5000                                       │
│  Routes: /api/dashboard, /api/lancamentos,      │
│          /api/conciliacoes, /api/kanban, etc.   │
│  Zod validation via @workspace/api-zod            │
└──────────────┬──────────────────────────────────┘
               │ drizzle-orm (Postgres.js)
               ▼
┌─────────────────────────────────────────────────┐
│           DATABASE (Supabase PostgreSQL)         │
│  13 tabelas + JSONB columns                      │
│  Migrations via drizzle-kit push                 │
└─────────────────────────────────────────────────┘
```

**Em produção (Vercel):**
- Frontend → `dist/` servido como static site
- Backend → `api/index.js` como serverless function
- Banco → Supabase PostgreSQL (externo)

---

## 10. Comandos de Desenvolvimento

```bash
# Instalação de dependências
pnpm install

# Desenvolvimento — inicia frontend e backend simultaneamente
pnpm run dev
#   → pnpm dev:api    (porta 5000)
#   → pnpm dev:web    (porta 5173)

# Build de produção
pnpm run build

# Typecheck
pnpm run typecheck

# Push do schema do banco (Drizzle)
pnpm --filter @workspace/db run push

# Regenerar cliente API (Orval)
pnpm --filter @workspace/api-spec run codegen
```

---

## 11. Deploy (Vercel)

O projeto está configurado para deploy na **Vercel**:

- **`vercel.json`** — Configuração de build, rotas e tratamento de fallback SPA
- **`api/index.js`** — Handler serverless que encapsula o Express app
- **Frontend** — Build via Vite, servido como static files
- **Backend** — Rotas `/api/*` encaminhadas para serverless function
- **Variáveis de ambiente:** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_API_URL` (prod)

---

## 12. Convenções e Padrões

### 12.1. Naming

- Tabelas: `snake_case` (ex: `lancamentos`, `contas_bancarias`)
- Colunas: `snake_case` (ex: `created_at`, `valor`, `tipo_pessoa`)
- Arquivos TypeScript: `kebab-case` (ex: `contas-bancarias.ts`, `plano-contas.ts`)
- Componentes React: `PascalCase` (ex: `AppLayout`, `StatusBadge`)

### 12.2. Timestamps

Todas as tabelas possuem `created_at` e `updated_at` com `defaultNow()`.

### 12.3. JSONB

Campos flexíveis que variam em estrutura são armazenados como JSONB:
- `parceiros.chaves_pix` — array de chaves Pix
- `parceiros.dados_bancarios` — array de dados bancários
- `parceiros.tipos` — array de strings (papéis do parceiro)
- `lancamentos.riscos` — array de tags de risco
- `kanban_cards.checklist` — array de objetos de checklist

### 12.4. Validação

- **Backend:** Esquemas Zod gerados automaticamente pelo Orval a partir do OpenAPI spec (`lib/api-zod/`)
- **Frontend:** React Hook Form com Zod resolver para formulários

---

## 13. Integrações Externas

| Serviço | Finalidade |
|---------|------------|
| **Supabase** | Backend PostgreSQL + cliente JS |
| **Power BI** | Dashboards via API REST (`/api/v1/*`) |
| **OFX** | Importação de extratos bancários |
| **Vercel** | Deploy full-stack (frontend + serverless) |

---

## 14. Resumo dos Responsáveis do Sistema

O I-S-M-Finance é um sistema **all-in-one** de gestão financeira que abrange:

1. **Controle de fluxo de caixa** — Entradas e saídas, conciliação e projeções
2. **Gestão contábil** — DRE, plano de contas, fechamento mensal
3. **Gestão orçamentária** — Metas mensais por categoria com comparativo realizado
4. **Gestão de tarefas** — Quadro Kanban integrado ao financeiro
5. **Cadastro de parceiros** — Clientes, fornecedores com dados bancários e Pix
6. **Business intelligence** — API REST para Power BI e dashboards externos
7. **Relatórios** — Fechamento mensal, DRE gerencial, fluxo de caixa, análise de inadimplência
