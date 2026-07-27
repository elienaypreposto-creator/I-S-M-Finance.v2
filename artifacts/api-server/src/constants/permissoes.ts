/**
 * FEAT-09 - códigos de permissão da conciliação (padrão dominio:recurso:acao).
 */
export const PERM = {
    CONCILIACAO_ACESSAR: "financeiro:conciliacao:acessar",
    CONCILIACAO_IMPORTAR: "financeiro:conciliacao:importar",
    CONCILIACAO_VINCULAR: "financeiro:conciliacao:vincular",
    CONCILIACAO_IGNORAR: "financeiro:conciliacao:ignorar",
    CONCILIACAO_DESFAZER: "financeiro:conciliacao:desfazer",
    CONCILIACAO_CONCLUIR: "financeiro:conciliacao:concluir",
    /** Configuração do módulo (ex.: motivo_ignorar_obrigatorio) + jobs manuais. */
    CONCILIACAO_CONFIGURAR: "financeiro:conciliacao:configurar",
    /** Legacy (UI antiga) — preferir as ações granulares acima. */
    CONCILIACAO_CONCILIAR: "financeiro:conciliacao:conciliar",
    LANCAMENTOS_EDITAR: "financeiro:lancamentos:editar",
    LANCAMENTOS_ALTERAR_VALOR: "financeiro:lancamentos:alterar_valor",
} as const;

export type PermissaoCodigo = (typeof PERM)[keyof typeof PERM];
