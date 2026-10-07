/**
 * Ordem de apagamento: filhos antes dos pais.
 * logs_auditoria fica de fora de propósito. A linha é anonimizada e o inteiro empresa_id permanece.
 * lancamentos fica entre as duas listas: a FK para a própria tabela é anulada e só então a linha sai.
 */

export const TABELAS_AUDITORIA = ["logs_auditoria", "logs_auditoria_arquivo"] as const;

/** Filhas de lançamento e de extrato. Têm de sair antes do DELETE em lancamentos. */
export const TABELAS_ANTES_LANCAMENTOS = [
    "historico_conciliacao",
    "itens_conciliacao_lancamentos",
    "itens_conciliacao",
    "conciliacoes",
    "extrato_linhas",
    "extratos",
    "regras_conciliacao",
] as const;

/** Pais ainda referenciados por lancamentos, ou cadastros sem essa FK. */
export const TABELAS_DEPOIS_LANCAMENTOS = [
    "metas",
    "kanban_anexos",
    "kanban_comentarios",
    "kanban_historico",
    "kanban_cards",
    "parametros_sistema",
    "tokens_api",
    "usuario_permissoes",
    "usuario_empresas",
    "contas_bancarias",
    "plano_contas",
    "parceiros",
    "centros_custos",
    "departamentos",
    "filiais",
] as const;

const IDENT = /^[a-z][a-z0-9_]*$/;

export function ident(nome: string): string {
    if (!IDENT.test(nome)) {
        throw new Error("Tabela fora do inventário LGPD.");
    }
    return `"${nome}"`;
}

/** Tabelas de domínio que deixam de ter linha com o empresa_id. Auditoria não entra. */
export function tabelasRemovidasNaEliminacao(): readonly string[] {
    return [...TABELAS_ANTES_LANCAMENTOS, "lancamentos", ...TABELAS_DEPOIS_LANCAMENTOS];
}

/** Colunas que não saem no pacote portável. */
export const COLUNAS_OMITIDAS_NO_EXPORT: Record<string, readonly string[]> = {
    tokens_api: ["token_hash"],
};
