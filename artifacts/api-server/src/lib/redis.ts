import Redis from "ioredis";

let client: Redis | null = null;
let ultimoAlerta = 0;

/** Alerta com throttle (30s) para não inundar o log quando o Redis cai. */
export function alertRedis(contexto: string, err?: unknown): void {
    const agora = Date.now();
    if (agora - ultimoAlerta < 30_000) return;
    ultimoAlerta = agora;
    console.error(`[ALERT][REDIS] ${contexto} - operando em fail-open.`, err ?? "");
}

export function getRedis(): Redis | null {
    if (client) return client;

    const url = process.env.REDIS_URL;
    if (!url) {
        alertRedis("REDIS_URL não definido");
        return null;
    }

    client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false, // falha rápido em vez de enfileirar request
        connectTimeout: 2_000,
        commandTimeout: 300,
        retryStrategy: (tentativa) => Math.min(tentativa * 200, 5_000),
    });
    client.on("error", (e) => alertRedis("erro de conexão", e));

    return client;
}