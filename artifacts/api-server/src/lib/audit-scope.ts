/**
 * Resolução de tenant para auditoria HTTP.
 * Nunca deriva empresa_id de body em rotas genéricas  só em select/switch
 * após resposta de sucesso, ou do contexto already-validado (req.tenant / req.user).
 */

const AUTH_GLOBAL_PATH =
    /\/auth\/(login|refresh|logout|select-empresa|switch-empresa|verify-otp|setup-password|forgot-password|reset-password|migrate-passwords)(?:\?|$)/;

const EMPRESA_SELECTION_PATH = /\/auth\/(select-empresa|switch-empresa)(?:\?|$)/;

export function isAuthGlobalPath(url: string): boolean {
    return AUTH_GLOBAL_PATH.test(url);
}

export function isEmpresaSelectionPath(url: string): boolean {
    return EMPRESA_SELECTION_PATH.test(url);
}

export function parsePositiveEmpresaId(raw: unknown): number | null {
    const id = typeof raw === "number" ? raw : Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
}

type AuditRequest = {
    tenant?: {empresaId?: number};
    user?: {empresaId?: number};
    body?: {empresa_id?: unknown} & Record<string, unknown>;
    originalUrl?: string;
    path?: string;
};

export function resolveAuditEmpresaId(req: AuditRequest, statusCode: number): number | null {
    const fromContext = parsePositiveEmpresaId(req.tenant?.empresaId ?? req.user?.empresaId);
    if (fromContext) return fromContext;

    const url = req.originalUrl ?? req.path ?? "";
    if (isEmpresaSelectionPath(url) && statusCode < 400) {
        return parsePositiveEmpresaId(req.body?.empresa_id);
    }

    return null;
}
