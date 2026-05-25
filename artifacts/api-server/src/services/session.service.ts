/**
 * Session Service — gestão de sessões de utilizador (refresh tokens).
 *
 * Separado do token.service para manter a distinção entre operações
 * criptográficas (token.service) e operações de estado (session.service).
 */

import {eq} from "drizzle-orm";
import {db} from "@workspace/db";
import {refreshTokensTable} from "@workspace/db/schema";

/**
 * Revoga todos os refresh tokens activos de um utilizador.
 * Deve ser chamado sempre que:
 *  - A senha do utilizador é alterada (por admin ou por reset).
 *  - A conta é bloqueada por um administrador.
 *  - Um replay attack de refresh token é detectado (Token Family Revocation).
 */
export const revokeAllTokensForUser = (usuarioId: number) =>
    db
        .update(refreshTokensTable)
        .set({revogado: true})
        .where(eq(refreshTokensTable.usuario_id, usuarioId));
