
import Redis from "ioredis";

let client: Redis | null = null;
let ultimoAlerta = 0;

/**
 * Alerta com throttle de 30 segundos para evitar
 * inundação do log quando o Redis estiver indisponível.
 */
export function alertRedis(
    contexto: string,
    err?: unknown,
): void {
    const agora = Date.now();

    if (agora - ultimoAlerta < 30_000) {
        return;
    }

    ultimoAlerta = agora;

    console.error(
        `[ALERT][REDIS] ${contexto} - operando em fail-open.`,
        err ?? "",
    );
}

/**
 * Obtém o cliente Redis.
 *
 * Variáveis utilizadas:
 *
 * REDIS_URL
 * REDIS_PASSWORD
 *
 * Exemplos:
 *
 * Redis local:
 * REDIS_URL=redis://127.0.0.1:6379
 * REDIS_PASSWORD=
 *
 * Redis hospedado:
 * REDIS_URL=rediss://host:6379
 * REDIS_PASSWORD=sua_senha
 *
 * Também aceita REDIS_URL contendo a senha diretamente.
 */
export function getRedis(): Redis | null {
    if (client) {
        return client;
    }

    const url = process.env.REDIS_URL?.trim();
    const password = process.env.REDIS_PASSWORD?.trim();

    if (!url) {
        alertRedis("REDIS_URL não definido");
        return null;
    }

    try {
        const options: Redis.RedisOptions = {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,

            connectTimeout: 2_000,
            commandTimeout: 300,

            retryStrategy: (
                tentativa: number,
            ) => {
                return Math.min(
                    tentativa * 200,
                    5_000,
                );
            },
        };

        /**
         * Se REDIS_PASSWORD estiver definido,
         * ele será utilizado pelo ioredis.
         *
         * Caso a senha já esteja na REDIS_URL,
         * o ioredis continuará utilizando a senha da URL.
         */
        if (password) {
            options.password = password;
        }

        client = new Redis(
            url,
            options,
        );

        client.on(
            "error",
            (err: unknown) => {
                alertRedis(
                    "erro de conexão",
                    err,
                );
            },
        );

        client.on(
            "connect",
            () => {
                console.log(
                    "[REDIS] conexão estabelecida",
                );
            },
        );

        client.on(
            "ready",
            () => {
                console.log(
                    "[REDIS] pronto para uso",
                );
            },
        );

        client.on(
            "close",
            () => {
                console.warn(
                    "[REDIS] conexão encerrada",
                );
            },
        );

        return client;
    } catch (err) {
        alertRedis(
            "falha ao inicializar cliente",
            err,
        );

        client = null;

        return null;
    }
}

/**
 * Fecha a conexão Redis de forma segura.
 *
 * Útil para:
 * - shutdown da API;
 * - testes;
 * - encerramento controlado do processo.
 */
export async function closeRedis(): Promise<void> {
    if (!client) {
        return;
    }

    try {
        await client.quit();
    } catch (err) {
        console.warn(
            "[REDIS] erro ao fechar conexão:",
            err,
        );
    } finally {
        client = null;
    }
}