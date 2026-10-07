/**
 * Encapsulamento de erros 5xx (Card 95).
 *
 * Produção: o cliente recebe só `{ requestId }` - nunca stack, SQL, constraint
 * ou host. O servidor loga o Error real prefixado por `[req.id]`.
 */

export function isProductionEnv(nodeEnv = process.env.NODE_ENV): boolean {
    return nodeEnv === "production";
}

export function requestIdFrom(resOrReq: {id?: string} | {req?: {id?: string}} | undefined): string {
    if (!resOrReq) return "unknown";
    if ("id" in resOrReq && typeof resOrReq.id === "string" && resOrReq.id) {
        return resOrReq.id;
    }
    if ("req" in resOrReq && typeof resOrReq.req?.id === "string" && resOrReq.req.id) {
        return resOrReq.req.id;
    }
    return "unknown";
}

function serializeCauseForDev(details: unknown): unknown {
    if (details instanceof Error) {
        return {
            name: details.name,
            message: details.message,
            stack: details.stack,
        };
    }
    return details ?? null;
}

/**
 * Detalhes do envelope JSON.
 * - 5xx em produção → `{ requestId }` (correlação suporte ↔ log)
 * - 5xx fora de produção → causa serializada para diagnóstico local
 * - 4xx → o que o chamador passou (Zod, regras de negócio)
 */
export function clientErrorDetails(
    status: number,
    details: unknown,
    nodeEnv = process.env.NODE_ENV,
    requestId?: string,
): unknown {
    if (status >= 500 && isProductionEnv(nodeEnv)) {
        return {requestId: requestId || "unknown"};
    }
    if (status >= 500) {
        return serializeCauseForDev(details);
    }
    return details ?? null;
}

/**
 * Log server-side de 5xx. Sempre imprime o objeto `err` (stack incluído
 * quando for `Error`). Nunca substitui o erro pelos `details`.
 *
 * Formato: `console.error([${requestId}], err)`
 */
export function logInternalError(requestId: string, err: unknown, extra?: unknown): void {
    console.error(`[${requestId}]`, err);
    if (extra !== undefined && extra !== err) {
        console.error(`[${requestId}] details:`, extra);
    }
}
