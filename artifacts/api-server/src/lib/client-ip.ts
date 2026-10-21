/**
 * IP real do cliente atrás da cadeia de proxies do deploy.
 *
 * Cadeia em TST/HML (VM):
 *
 *   cliente -> nginx de borda (imovelsearcher-proxy, TLS)
 *           -> docker-proxy (10.0.0.24:85/86)
 *           -> nginx do container web (nginx.conf deste repo)
 *           -> api:5000
 *
 * A borda grava `X-Forwarded-For: $remote_addr` (sobrescreve o que o cliente
 * mandou) e o nginx do web acrescenta o próprio `$remote_addr` (o gateway do
 * docker-proxy). A API recebe, portanto, `X-Forwarded-For: <cliente>, <gateway>`
 * vinda do socket do nginx web: são 2 saltos confiáveis. Com `trust proxy = 2`
 * o Express descarta tudo o que estiver à esquerda do valor gravado pela borda,
 * então um `X-Forwarded-For` forjado pelo cliente nunca vira `req.ip`.
 *
 * Mudou a topologia (ex.: API exposta só atrás de um nginx, ou um CDN a mais)?
 * Ajuste `TRUST_PROXY_HOPS` no ambiente em vez de mexer no código.
 */

import type {Request} from "express";

export const DEFAULT_TRUST_PROXY_HOPS = 2;

/** Número de saltos de proxy confiáveis (`app.set("trust proxy", n)`). */
export function trustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
    const raw = env.TRUST_PROXY_HOPS?.trim();
    if (!raw) return DEFAULT_TRUST_PROXY_HOPS;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 10) {
        console.warn(
            `[CONFIG] TRUST_PROXY_HOPS inválido (${JSON.stringify(raw)}); usando ${DEFAULT_TRUST_PROXY_HOPS}.`,
        );
        return DEFAULT_TRUST_PROXY_HOPS;
    }
    return n;
}

/**
 * IP do cliente para auditoria e rate limit. Usa só `req.ip`, que o Express
 * resolve a partir de `trust proxy` — nunca ler `X-Forwarded-For` à mão: o
 * primeiro item do header é escolhido pelo cliente.
 */
export function clientIp(req: Pick<Request, "ip" | "socket">): string | null {
    return req.ip ?? req.socket?.remoteAddress ?? null;
}
