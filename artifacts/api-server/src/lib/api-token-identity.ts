/**
 * Identidade de chamadas da API v1 (token por empresa).
 *
 * Token de API NÃO é usuário: req.user fica vazio e a chamada é identificada
 * por req.tokenApiId. Assim a auditoria grava token_api_id e nunca atribui a
 * chamada ao usuário cujo id coincide com o id do token.
 *
 * Módulo puro (sem banco) para ser testável isoladamente.
 */

import crypto from "crypto";
import {hojeIsoLocal} from "../utils/date-civil";

export type TokenApiContexto = {
    id: number;
    empresa_id: number;
    escopos: string[] | null;
};

type RequestComToken = {
    tenant?: {empresaId: number};
    apiToken?: {id: number; escopos: string[]};
    tokenApiId?: number;
    user?: unknown;
};

/** Popula tenant/escopos/token na request e garante que não há identidade de usuário. */
export function aplicarIdentidadeToken(req: RequestComToken, tokenRow: TokenApiContexto): void {
    req.tenant = {empresaId: tokenRow.empresa_id};
    req.apiToken = {id: tokenRow.id, escopos: tokenRow.escopos ?? []};
    req.tokenApiId = tokenRow.id;
    req.user = undefined;
}

type RequestAuditavel = {
    user?: {id?: number};
    tokenApiId?: number;
    apiToken?: {id: number};
};

/**
 * usuario_id / token_api_id para logs_auditoria.
 * Chamada por token: usuario_id null (o criador está em tokens_api.criado_por_usuario_id).
 */
export function identidadeAuditoria(req: RequestAuditavel): {usuario_id: number | null; token_api_id: number | null} {
    const tokenId = req.tokenApiId ?? req.apiToken?.id;
    if (typeof tokenId === "number" && Number.isInteger(tokenId) && tokenId > 0) {
        return {usuario_id: null, token_api_id: tokenId};
    }
    const userId = req.user?.id;
    return {
        usuario_id: typeof userId === "number" && Number.isInteger(userId) && userId > 0 ? userId : null,
        token_api_id: null,
    };
}

/** sha256(valor) comparado com o hash hex armazenado, em tempo constante. */
export function hashConfere(valor: string, storedHex: string | null | undefined): boolean {
    if (!storedHex || !/^[a-f0-9]{64}$/i.test(storedHex)) return false;
    const calculado = crypto.createHash("sha256").update(valor).digest();
    const armazenado = Buffer.from(storedHex, "hex");
    return calculado.length === armazenado.length && crypto.timingSafeEqual(calculado, armazenado);
}

/**
 * Token com `data_expiracao` (coluna date, "YYYY-MM-DD") vale até o fim desse dia civil
 * em America/Sao_Paulo. Com "hoje" em UTC, expirava ~3h antes (a partir das 21h BRT).
 */
export function tokenExpirado(dataExpiracao: string | null | undefined, agora: Date = new Date()): boolean {
    return !!dataExpiracao && dataExpiracao < hojeIsoLocal(agora);
}
