/**
 * Inventário ISMF-13 - decisão por tabela.
 *
 * Recebe empresa_id (domínio / isolamento):
 *   filiais, departamentos, centros_custos, contas_bancarias, plano_contas,
 *   parceiros, lancamentos, metas, regras_conciliacao, extratos, extrato_linhas,
 *   conciliacoes, itens_conciliacao, itens_conciliacao_lancamentos,
 *   historico_conciliacao, kanban_cards, kanban_comentarios, kanban_anexos,
 *   kanban_historico, parametros_sistema, logs_auditoria, tokens_api
 *
 * Global (sem empresa_id):
 *   empresas            - é o tenant
 *   usuarios            - e-mail único no sistema; vínculo em usuario_empresas
 *   usuario_permissoes  - global até ISMF-16 (perms por empresa)
 *   refresh_tokens      - sessão do utilizador; empresa viva no JWT
 *   logs_sistema        - log operacional da API, não dado de negócio
 *   usuario_empresas    - ponte N:N, não é “dado de uma empresa”
 *
 * Sem tabela própria:
 *   transferencias      - par de lançamentos com transferencia_grupo_id
 *
 * contas_bancarias.empresa (texto) → renomeado para `titular`
 * (nome do titular da conta; o tenant é empresa_id).
 */

export const TABELAS_COM_EMPRESA_ID = [
    "filiais",
    "departamentos",
    "centros_custos",
    "contas_bancarias",
    "plano_contas",
    "parceiros",
    "lancamentos",
    "metas",
    "regras_conciliacao",
    "extratos",
    "extrato_linhas",
    "conciliacoes",
    "itens_conciliacao",
    "itens_conciliacao_lancamentos",
    "historico_conciliacao",
    "kanban_cards",
    "kanban_comentarios",
    "kanban_anexos",
    "kanban_historico",
    "parametros_sistema",
    "logs_auditoria",
    "tokens_api",
] as const;

export const TABELAS_GLOBAIS = [
    "empresas",
    "usuarios",
    "usuario_permissoes",
    "refresh_tokens",
    "logs_sistema",
    "usuario_empresas",
] as const;
