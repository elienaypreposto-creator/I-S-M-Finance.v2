/**
 * FEAT-09 - códigos de permissão (espelho do backend).
 */
export const PERM = {
    CONCILIACAO_ACESSAR: "financeiro:conciliacao:acessar",
    CONCILIACAO_IMPORTAR: "financeiro:conciliacao:importar",
    CONCILIACAO_VINCULAR: "financeiro:conciliacao:vincular",
    CONCILIACAO_IGNORAR: "financeiro:conciliacao:ignorar",
    CONCILIACAO_DESFAZER: "financeiro:conciliacao:desfazer",
    CONCILIACAO_CONCLUIR: "financeiro:conciliacao:concluir",
    CONCILIACAO_CONFIGURAR: "financeiro:conciliacao:configurar",
    CONCILIACAO_CONCILIAR: "financeiro:conciliacao:conciliar",
    LANCAMENTOS_EDITAR: "financeiro:lancamentos:editar",
    LANCAMENTOS_ALTERAR_VALOR: "financeiro:lancamentos:alterar_valor",
    RELATORIOS_CONCILIACAO: "relatorios:conciliacao",
    RELATORIOS_METAS: "relatorios:metas",
    RELATORIOS_DRE: "relatorios:dre",
    RELATORIOS_FLUXO_CAIXA: "relatorios:fluxo-caixa-mensal",
    RELATORIOS_FECHAMENTO: "relatorios:financeiro",
    RELATORIOS_CONTABIL: "relatorios:contabil-fiscal",
    REGRAS_CONCILIACAO_LISTAR: "financeiro:regras-conciliacao:listar",
    REGRAS_CONCILIACAO_CRIAR: "financeiro:regras-conciliacao:criar",
    REGRAS_CONCILIACAO_EDITAR: "financeiro:regras-conciliacao:editar",
    REGRAS_CONCILIACAO_DELETAR: "financeiro:regras-conciliacao:deletar",
} as const;
