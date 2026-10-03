import {alertRedis, getRedis} from "../lib/redis";
import {ACCESS_TOKEN_TTL} from "./token.service";

const key = (usuarioId: number) => `denylist:user:${usuarioId}`;

/**
 * DECISÃO: fail-open. Se o Redis estiver fora, a API segue respondendo e
 * volta ao trade-off antigo (access token válido até 15 min). Alerta no log.
 */

/** Invalida todos os access tokens do usuário emitidos até agora. */
export async function denylistUser(usuarioId: number): Promise<void> {
    try {
        const redis = getRedis();
        if (!redis) return;
        const agoraSeg = Math.floor(Date.now() / 1000);
        await redis.set(key(usuarioId), String(agoraSeg), "EX", ACCESS_TOKEN_TTL);
    } catch (e) {
        alertRedis(`falha ao gravar denylist do usuário ${usuarioId}`, e);
    }
}

/** Epoch (s) da revogação, ou null se não há denylist (ou Redis indisponível). */
export async function getUserRevokedAt(usuarioId: number): Promise<number | null> {
    try {
        const redis = getRedis();
        if (!redis) return null;
        const v = await redis.get(key(usuarioId));
        if (v === null) return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    } catch (e) {
        alertRedis("falha ao consultar denylist", e);
        return null;
    }
}