/**
 * Catálogo canônico de permissões do Super Admin (API + UI).
 * Fonte única - manter alinhado a withPermission / grant_admin.
 *
 * Módulo sem I/O de banco para poder ser importado em testes e no validador
 * de concessão sem instanciar o pool Postgres.
 */
export const PERMISSOES_ADMIN = [
    "dashboard:ver",

    "financeiro:lancamentos:criar",
    "financeiro:lancamentos:listar",
    "financeiro:lancamentos:editar",
    "financeiro:lancamentos:alterar_valor",
    "financeiro:lancamentos:deletar",

    "financeiro:parceiros:criar",
    "financeiro:parceiros:listar",
    "financeiro:parceiros:editar",
    "financeiro:parceiros:deletar",

    "financeiro:metas:criar",
    "financeiro:metas:listar",
    "financeiro:metas:editar",
    "financeiro:metas:deletar",

    "financeiro:fechamentos:criar",
    "financeiro:fechamentos:listar",
    "financeiro:fechamentos:deletar",

    "financeiro:contas-pagar:criar",
    "financeiro:contas-pagar:listar",
    "financeiro:contas-pagar:baixar",
    "financeiro:contas-pagar:cancelar",
    "financeiro:importar",
    "financeiro:contas-receber:criar",
    "financeiro:contas-receber:listar",
    "financeiro:contas-receber:baixar",
    "financeiro:contas-receber:cancelar",
    "financeiro:contas-receber:exportar",

    "financeiro:conciliacao:acessar",
    "financeiro:conciliacao:importar",
    "financeiro:conciliacao:vincular",
    "financeiro:conciliacao:ignorar",
    "financeiro:conciliacao:desfazer",
    "financeiro:conciliacao:concluir",
    "financeiro:conciliacao:configurar",

    "financeiro:regras-conciliacao:listar",
    "financeiro:regras-conciliacao:criar",
    "financeiro:regras-conciliacao:editar",
    "financeiro:regras-conciliacao:deletar",

    "financeiro:transferencias:criar",

    "configuracoes:contas-bancarias:criar",
    "configuracoes:contas-bancarias:listar",
    "configuracoes:contas-bancarias:editar",
    "configuracoes:contas-bancarias:deletar",

    "configuracoes:plano-contas:criar",
    "configuracoes:plano-contas:listar",
    "configuracoes:plano-contas:editar",
    "configuracoes:plano-contas:deletar",
    "configuracoes:plano-contas:exportar",

    "configuracoes:categorias:criar",
    "configuracoes:categorias:listar",
    "configuracoes:categorias:deletar",

    "configuracoes:filiais:criar",
    "configuracoes:filiais:editar",
    "configuracoes:filiais:deletar",

    "configuracoes:departamentos:criar",
    "configuracoes:departamentos:editar",
    "configuracoes:departamentos:deletar",

    "admin:usuarios:listar",
    "admin:usuarios:criar",
    "admin:usuarios:editar",
    "admin:usuarios:deletar",
    "admin:permissoes:conceder",
    "admin:migrate-passwords",

    "admin:empresas:listar",
    "admin:empresas:criar",
    "admin:empresas:editar",

    "admin:tokens-api:listar",
    "admin:tokens-api:criar",
    "admin:tokens-api:editar",
    "admin:tokens-api:deletar",

    "admin:auditoria:listar",
    "admin:transferencias:editar",
    "admin:transferencias:deletar",

    "relatorios:dre",
    "relatorios:fluxo-caixa-diario",
    "relatorios:fluxo-caixa-mensal",
    "relatorios:economico",
    "relatorios:financeiro",
    "relatorios:vencimento",
    "relatorios:extrato",
    "relatorios:metas",
    "relatorios:conciliacao",
    "relatorios:contabil-fiscal",
] as const;

export type PermissaoCatalogo = (typeof PERMISSOES_ADMIN)[number];
