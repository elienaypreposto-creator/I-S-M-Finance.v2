/**
 * Bloqueio temporário de conta por tentativas de login falhas (ISMF-7).
 *
 * Regra:
 * - 5 falhas para o mesmo e-mail em 15 min -> e-mail bloqueado por 15 min.
 * - Enquanto bloqueado, o login responde o MESMO 401 INVALID_CREDENTIALS, sem
 *   consultar senha - e a tentativa não é contada (o atacante não prolonga o
 *   bloqueio batendo nele).
 * - Login correto zera falhas/bloqueio; reset de senha também libera.
 *
 * Sem enumeração: conta falhas por e-mail digitado, exista ou não o usuário,
 * e a resposta de bloqueio é idêntica à de senha errada.
 *
 * Sem travar a vítima indefinidamente: o IP de onde o usuário já logou com
 * sucesso (30 dias) não é barrado pelo bloqueio causado por OUTROS IPs. Quem
 * errou a senha a partir desse IP continua bloqueado normalmente. Esse IP
 * segue limitado pelo loginLimiter (IP + e-mail) e pelo globalLimiter.
 *
 * Estado no Redis (chaves com hash do e-mail, nada em claro). Fail-open, como o
 * rate limit: Redis fora do ar não impede login (alerta via alertRedis).
 */

import crypto from "node:crypto";
import {alertRedis, getRedis} from "./redis";

const MIN = 60_000;

export interface LockoutConfig {
    maxFalhas: number;
    janelaMs: number;
    bloqueioMs: number;
    ipConhecidoMs: number;
}

export const LOCKOUT_PADRAO: LockoutConfig = {
    maxFalhas: 5,
    janelaMs: 15 * MIN,
    bloqueioMs: 15 * MIN,
    ipConhecidoMs: 30 * 24 * 60 * MIN,
};

/** Primitivas de armazenamento (Redis em produção, memória nos testes). */
export interface LockoutStore {
    /** Soma uma falha; ao atingir o máximo, cria o bloqueio e zera o contador. */
    falha(chave: string, ip: string, cfg: LockoutConfig): Promise<{ falhas: number; bloqueouAgora: boolean }>;

    /** ms restantes de bloqueio (0 = livre). */
    bloqueioRestanteMs(chave: string): Promise<number>;

    /** IP já logou com sucesso nesta conta e não falhou na janela atual. */
    ipConfiavel(chave: string, ip: string): Promise<boolean>;

    sucesso(chave: string, ip: string, cfg: LockoutConfig): Promise<void>;

    limpar(chave: string): Promise<void>;
}

export async function lerFalhasRecentes(email: string): Promise<{ total: number; ips: string[] } | null> {
    try {
        const r = getRedis();
        if (!r) return null;
        const chave = chaveConta(email);
        const [contador, ips] = await Promise.all([
            r.get(k("falhas", chave)),
            r.smembers(k("ipfalha", chave)),
        ]);
        const total = contador ? parseInt(contador, 10) : 0;
        const lista = Array.isArray(ips) ? ips.filter((ip) => typeof ip === "string" && ip.length > 0) : [];
        const n = Number.isFinite(total) && total > 0 ? total : lista.length;
        if (n <= 0 && lista.length === 0) return null;
        return {total: n, ips: lista};
    } catch (err) {
        alertRedis("ler tentativas de login", err);
        return null;
    }
}

export function chaveConta(email: string): string {
    return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

const k = (tipo: string, chave: string) => `lk:${tipo}:${chave}`;
const MAX_IPS_CONHECIDOS = 20;

// KEYS: falhas, bloqueio, ips-que-falharam | ARGV: ip, janelaMs, max, bloqueioMs
const LUA_FALHA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
redis.call('SADD', KEYS[3], ARGV[1])
redis.call('PEXPIRE', KEYS[3], tonumber(ARGV[2]) + tonumber(ARGV[4]))
if n >= tonumber(ARGV[3]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[4])
  redis.call('DEL', KEYS[1])
  return {n, 1}
end
return {n, 0}`;

export function redisLockoutStore(): LockoutStore {
    const cli = () => {
        const r = getRedis();
        if (!r || r.status !== "ready") throw new Error(`Redis indisponível (${r?.status ?? "sem cliente"})`);
        return r;
    };
    return {
        async falha(chave, ip, cfg) {
            const [n, b] = (await cli().eval(
                LUA_FALHA,
                3,
                k("falhas", chave),
                k("bloq", chave),
                k("ipfalha", chave),
                ip,
                cfg.janelaMs,
                cfg.maxFalhas,
                cfg.bloqueioMs,
            )) as [number, number];
            return {falhas: Number(n), bloqueouAgora: Number(b) === 1};
        },
        async bloqueioRestanteMs(chave) {
            const ttl = await cli().pttl(k("bloq", chave));
            return ttl > 0 ? ttl : 0;
        },
        async ipConfiavel(chave, ip) {
            const r = cli();
            const [conhecido, falhou] = await Promise.all([
                r.sismember(k("ipok", chave), ip),
                r.sismember(k("ipfalha", chave), ip),
            ]);
            return conhecido === 1 && falhou === 0;
        },
        async sucesso(chave, ip, cfg) {
            const r = cli();
            const ok = k("ipok", chave);
            await r
                .multi()
                .del(k("falhas", chave), k("bloq", chave), k("ipfalha", chave))
                .sadd(ok, ip)
                .pexpire(ok, cfg.ipConhecidoMs)
                .exec();
            if ((await r.scard(ok)) > MAX_IPS_CONHECIDOS) await r.spop(ok);
        },
        async limpar(chave) {
            await cli().del(k("falhas", chave), k("bloq", chave), k("ipfalha", chave));
        },
    };
}

/** Store em memória com relógio injetável (testes). */
export function memoryLockoutStore(agora: () => number = Date.now): LockoutStore {
    const falhas = new Map<string, { n: number; expira: number }>();
    const bloq = new Map<string, number>();
    const ipFalha = new Map<string, { ips: Set<string>; expira: number }>();
    const ipOk = new Map<string, Set<string>>();
    const vivo = (exp: number | undefined) => exp !== undefined && exp > agora();
    return {
        async falha(chave, ip, cfg) {
            const atual = falhas.get(chave);
            const reg = atual && vivo(atual.expira) ? atual : {n: 0, expira: agora() + cfg.janelaMs};
            reg.n += 1;
            falhas.set(chave, reg);
            const fi = ipFalha.get(chave);
            const ips = fi && vivo(fi.expira) ? fi.ips : new Set<string>();
            ips.add(ip);
            ipFalha.set(chave, {ips, expira: agora() + cfg.janelaMs + cfg.bloqueioMs});
            if (reg.n >= cfg.maxFalhas) {
                bloq.set(chave, agora() + cfg.bloqueioMs);
                falhas.delete(chave);
                return {falhas: reg.n, bloqueouAgora: true};
            }
            return {falhas: reg.n, bloqueouAgora: false};
        },
        async bloqueioRestanteMs(chave) {
            const exp = bloq.get(chave);
            return vivo(exp) ? exp! - agora() : 0;
        },
        async ipConfiavel(chave, ip) {
            const fi = ipFalha.get(chave);
            const falhou = !!fi && vivo(fi.expira) && fi.ips.has(ip);
            return !!ipOk.get(chave)?.has(ip) && !falhou;
        },
        async sucesso(chave, ip) {
            falhas.delete(chave);
            bloq.delete(chave);
            ipFalha.delete(chave);
            const set = ipOk.get(chave) ?? new Set<string>();
            set.add(ip);
            ipOk.set(chave, set);
        },
        async limpar(chave) {
            falhas.delete(chave);
            bloq.delete(chave);
            ipFalha.delete(chave);
        },
    };
}

export interface EventoBloqueio {
    chave: string;
    ip: string;
    falhas: number;
    bloqueioMs: number;
}

export interface AccountLockout {
    /** true = responder 401 sem verificar a senha. */
    bloqueado(email: string, ip: string): Promise<boolean>;

    registrarFalha(email: string, ip: string): Promise<void>;

    registrarSucesso(email: string, ip: string): Promise<void>;

    /** Libera a conta (ex.: após redefinir a senha). */
    liberar(email: string): Promise<void>;
}

export function createAccountLockout(opts: {
    store: LockoutStore;
    config?: Partial<LockoutConfig>;
    onBloqueio?: (ev: EventoBloqueio) => void | Promise<void>;
}): AccountLockout {
    const cfg: LockoutConfig = {...LOCKOUT_PADRAO, ...opts.config};
    const {store} = opts;

    // Fail-open: falha de infraestrutura nunca derruba nem bloqueia o login.
    async function seguro<T>(contexto: string, fn: () => Promise<T>, fallback: T): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            alertRedis(`bloqueio de conta (${contexto})`, err);
            return fallback;
        }
    }

    return {
        bloqueado: (email, ip) =>
            seguro("consulta", async () => {
                const chave = chaveConta(email);
                if ((await store.bloqueioRestanteMs(chave)) <= 0) return false;
                return !(await store.ipConfiavel(chave, ip));
            }, false),

        registrarFalha: (email, ip) =>
            seguro("falha", async () => {
                const chave = chaveConta(email);
                const r = await store.falha(chave, ip, cfg);
                if (r.bloqueouAgora) {
                    await opts.onBloqueio?.({chave, ip, falhas: r.falhas, bloqueioMs: cfg.bloqueioMs});
                }
            }, undefined),

        registrarSucesso: (email, ip) =>
            seguro("sucesso", () => store.sucesso(chaveConta(email), ip, cfg), undefined),

        liberar: (email) => seguro("liberar", () => store.limpar(chaveConta(email)), undefined),
    };
}
