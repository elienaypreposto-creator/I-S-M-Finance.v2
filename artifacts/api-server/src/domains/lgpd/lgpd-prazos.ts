/**
 * Prazos do inventário versionado (docs/lgpd-inventario.md).
 * O job de retenção e o arquivo de auditoria leem daqui. O número no documento tem de ser o mesmo.
 */

/** Extrato: arquivar (não apagar) quando o período fecha há mais do que isto. */
export const PRAZO_EXTRATO_ANOS = 5;

/** Auditoria quente: meses até ir para logs_auditoria_arquivo. */
export const PRAZO_AUDITORIA_MESES = 24;

/** Colunas de logs_auditoria limpas na eliminação. empresa_id, acao, recurso e created_at ficam. */
export const CAMPOS_ZERADOS_NA_ANONIMIZACAO = [
    "usuario_id",
    "ip",
    "user_agent",
    "request_id",
    "token_api_id",
] as const;
