/**
 * Sessões do usuário no Redis.
 *
 * O refresh token continua no Postgres. Aqui fica o que a tela precisa
 * (dispositivo, IP, início, último uso) e a revogação de UM dispositivo:
 * `sess:v1:rev:<sid>` faz o access token daquela sessão cair na próxima
 * request, sem derrubar as outras (a denylist por usuário derrubaria todas).
 *
 * Fail-open: Redis fora do ar não impede login. A lista fica vazia e a
 * revogação por dispositivo espera o Redis voltar; o refresh daquele
 * dispositivo ainda é revogado no Postgres quando a operação pede.
 */

import crypto from "node:crypto";
import {alertRedis, getRedis} from "../lib/redis";
import {ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL} from "./token.service";

export interface SessaoRegistro {
    id: string;
    usuarioId: number;
    tokenHash: string;
    userAgent: string | null;
    ip: string | null;
    criadoEm: string;
    ultimoUso: string;
}

export interface SessaoPublica {
    id: string;
    dispositivo: string;
    ip: string;
    inicio: string;
    ultimoUso: string;
    atual: boolean;
}

export interface ArmazemSessoes {
    gravar(reg: SessaoRegistro, ttlSec: number): Promise<void>;

    ler(id: string): Promise<SessaoRegistro | null>;

    idsDoUsuario(usuarioId: number): Promise<string[]>;

    apagar(id: string, usuarioId: number): Promise<void>;

    marcarRevogada(id: string, ttlSec: number): Promise<void>;

    estaRevogada(id: string): Promise<boolean>;

    hashParaId(hash: string): Promise<string | null>;

    ligarHash(hash: string, id: string, ttlSec: number): Promise<void>;

    desligarHash(hash: string): Promise<void>;

    gravarUa(usuarioId: number, ua: string, ttlSec: number): Promise<void>;

    lerUa(usuarioId: number): Promise<string | null>;
}

const kSess = (id: string) => `sess:v1:${id}`;
const kUser = (uid: number) => `sess:v1:u:${uid}`;
const kHash = (hash: string) => `sess:v1:h:${hash}`;
const kRev = (id: string) => `sess:v1:rev:${id}`;
const kUa = (uid: number) => `sess:v1:ua:${uid}`;

function parseRegistro(bruto: string | null): SessaoRegistro | null {
    if (!bruto) return null;
    try {
        const v = JSON.parse(bruto) as SessaoRegistro;
        if (!v || typeof v.id !== "string" || typeof v.usuarioId !== "number") return null;
        return v;
    } catch {
        return null;
    }
}

export function redisArmazem(): ArmazemSessoes {
    const cli = () => {
        try {
            return getRedis();
        } catch (err) {
            alertRedis("sessões", err);
            return null;
        }
    };
    return {
        async gravar(reg, ttlSec) {
            const r = cli();
            if (!r) return;
            try {
                await r
                    .multi()
                    .set(kSess(reg.id), JSON.stringify(reg), "EX", ttlSec)
                    .sadd(kUser(reg.usuarioId), reg.id)
                    .expire(kUser(reg.usuarioId), ttlSec)
                    .exec();
            } catch (err) {
                alertRedis("gravar sessão", err);
            }
        },
        async ler(id) {
            const r = cli();
            if (!r) return null;
            try {
                return parseRegistro(await r.get(kSess(id)));
            } catch (err) {
                alertRedis("ler sessão", err);
                return null;
            }
        },
        async idsDoUsuario(usuarioId) {
            const r = cli();
            if (!r) return [];
            try {
                return await r.smembers(kUser(usuarioId));
            } catch (err) {
                alertRedis("listar sessões", err);
                return [];
            }
        },
        async apagar(id, usuarioId) {
            const r = cli();
            if (!r) return;
            try {
                await r.multi().del(kSess(id)).srem(kUser(usuarioId), id).exec();
            } catch (err) {
                alertRedis("apagar sessão", err);
            }
        },
        async marcarRevogada(id, ttlSec) {
            const r = cli();
            if (!r) return;
            try {
                await r.set(kRev(id), "1", "EX", ttlSec);
            } catch (err) {
                alertRedis("revogar sessão", err);
            }
        },
        async estaRevogada(id) {
            const r = cli();
            if (!r) return false;
            try {
                return (await r.get(kRev(id))) === "1";
            } catch (err) {
                alertRedis("consultar revogação", err);
                return false;
            }
        },
        async hashParaId(hash) {
            const r = cli();
            if (!r) return null;
            try {
                return await r.get(kHash(hash));
            } catch (err) {
                alertRedis("localizar sessão", err);
                return null;
            }
        },
        async ligarHash(hash, id, ttlSec) {
            const r = cli();
            if (!r) return;
            try {
                await r.set(kHash(hash), id, "EX", ttlSec);
            } catch (err) {
                alertRedis("ligar refresh à sessão", err);
            }
        },
        async desligarHash(hash) {
            const r = cli();
            if (!r) return;
            try {
                await r.del(kHash(hash));
            } catch (err) {
                alertRedis("desligar refresh da sessão", err);
            }
        },
        async gravarUa(usuarioId, ua, ttlSec) {
            const r = cli();
            if (!r) return;
            try {
                await r.set(kUa(usuarioId), ua.slice(0, 400), "EX", ttlSec);
            } catch (err) {
                alertRedis("gravar dispositivo do último acesso", err);
            }
        },
        async lerUa(usuarioId) {
            const r = cli();
            if (!r) return null;
            try {
                return await r.get(kUa(usuarioId));
            } catch (err) {
                alertRedis("ler dispositivo do último acesso", err);
                return null;
            }
        },
    };
}

/** Store em memória para testes. Relógio injetável. */
export function memoriaArmazem(agora: () => number = Date.now): ArmazemSessoes {
    const sessoes = new Map<string, { reg: SessaoRegistro; expira: number }>();
    const porUsuario = new Map<number, Set<string>>();
    const porHash = new Map<string, { id: string; expira: number }>();
    const revogadas = new Map<string, number>();
    const uas = new Map<number, { ua: string; expira: number }>();
    const vivo = (exp: number) => exp > agora();
    return {
        async gravar(reg, ttlSec) {
            sessoes.set(reg.id, {reg, expira: agora() + ttlSec * 1000});
            const set = porUsuario.get(reg.usuarioId) ?? new Set<string>();
            set.add(reg.id);
            porUsuario.set(reg.usuarioId, set);
        },
        async ler(id) {
            const item = sessoes.get(id);
            if (!item || !vivo(item.expira)) return null;
            return item.reg;
        },
        async idsDoUsuario(usuarioId) {
            return [...(porUsuario.get(usuarioId) ?? [])];
        },
        async apagar(id, usuarioId) {
            sessoes.delete(id);
            porUsuario.get(usuarioId)?.delete(id);
        },
        async marcarRevogada(id, ttlSec) {
            revogadas.set(id, agora() + ttlSec * 1000);
        },
        async estaRevogada(id) {
            const exp = revogadas.get(id);
            return exp !== undefined && vivo(exp);
        },
        async hashParaId(hash) {
            const item = porHash.get(hash);
            if (!item || !vivo(item.expira)) return null;
            return item.id;
        },
        async ligarHash(hash, id, ttlSec) {
            porHash.set(hash, {id, expira: agora() + ttlSec * 1000});
        },
        async desligarHash(hash) {
            porHash.delete(hash);
        },
        async gravarUa(usuarioId, ua, ttlSec) {
            uas.set(usuarioId, {ua, expira: agora() + ttlSec * 1000});
        },
        async lerUa(usuarioId) {
            const item = uas.get(usuarioId);
            if (!item || !vivo(item.expira)) return null;
            return item.ua;
        },
    };
}

export function mascararIp(ip: string | null): string {
    if (!ip) return "-";
    const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
    if (v4) return `${v4[1]}.${v4[2]}.•••.•••`;
    if (ip.includes(":")) {
        const grupos = ip.split(":").filter(Boolean);
        return `${grupos.slice(0, 2).join(":")}:••••`;
    }
    return "-";
}

/** "Windows · Chrome 129" a partir do user-agent. Sem geo (não temos esse dado). */
export function rotuloDispositivo(ua: string | null): string {
    if (!ua || !ua.trim()) return "Dispositivo desconhecido";
    const os = /Windows NT/i.test(ua)
        ? "Windows"
        : /iPhone/i.test(ua)
            ? "iPhone"
            : /iPad/i.test(ua)
                ? "iPad"
                : /Android/i.test(ua)
                    ? "Android"
                    : /Mac OS X/i.test(ua)
                        ? "macOS"
                        : /Linux/i.test(ua)
                            ? "Linux"
                            : "Dispositivo";
    const edge = /Edg\/(\d+)/.exec(ua);
    const firefox = /Firefox\/(\d+)/.exec(ua);
    const chrome = /Chrome\/(\d+)/.exec(ua);
    const safari = /Version\/(\d+).+Safari/.exec(ua);
    let browser = "Navegador";
    let ver = "";
    if (edge) {
        browser = "Edge";
        ver = edge[1];
    } else if (firefox) {
        browser = "Firefox";
        ver = firefox[1];
    } else if (chrome) {
        browser = "Chrome";
        ver = chrome[1];
    } else if (safari) {
        browser = "Safari";
        ver = safari[1];
    }
    return ver ? `${os} · ${browser} ${ver}` : `${os} · ${browser}`;
}

export interface MetaSessao {
    userAgent: string | null;
    ip: string | null;
}

export interface ServicoSessoes {
    abrir(input: { usuarioId: number; tokenHash: string; meta: MetaSessao; sid?: string }): Promise<string>;

    girar(sid: string, novoHash: string, meta: MetaSessao): Promise<void>;

    idPorHash(hash: string): Promise<string | null>;

    revogada(sid: string): Promise<boolean>;

    tocar(sid: string): Promise<void>;

    encerrarPorHash(hash: string): Promise<void>;

    encerrarDoUsuario(usuarioId: number, sid: string, sidAtual: string | undefined): Promise<"ok" | "ausente" | "atual">;

    encerrarOutras(usuarioId: number, sidAtual: string | undefined): Promise<number>;

    encerrarTodas(usuarioId: number): Promise<void>;

    listar(usuarioId: number, sidAtual: string | undefined): Promise<SessaoPublica[]>;

    hashDaSessao(sid: string): Promise<string | null>;

    lembrarUa(usuarioId: number, ua: string | null): Promise<void>;

    lerUa(usuarioId: number): Promise<string | null>;
}

export function criarSessoes(store: ArmazemSessoes): ServicoSessoes {
    async function derrubar(reg: SessaoRegistro): Promise<void> {
        await store.marcarRevogada(reg.id, ACCESS_TOKEN_TTL);
        await store.desligarHash(reg.tokenHash);
        await store.apagar(reg.id, reg.usuarioId);
    }

    return {
        async abrir({usuarioId, tokenHash, meta, sid}) {
            const id = sid ?? crypto.randomUUID();
            const agora = new Date().toISOString();
            const reg: SessaoRegistro = {
                id,
                usuarioId,
                tokenHash,
                userAgent: meta.userAgent,
                ip: meta.ip,
                criadoEm: agora,
                ultimoUso: agora,
            };
            await store.gravar(reg, REFRESH_TOKEN_TTL);
            await store.ligarHash(tokenHash, id, REFRESH_TOKEN_TTL);
            if (meta.userAgent) await store.gravarUa(usuarioId, meta.userAgent, REFRESH_TOKEN_TTL);
            return id;
        },
        async girar(sid, novoHash, meta) {
            const atual = await store.ler(sid);
            if (!atual) return;
            await store.desligarHash(atual.tokenHash);
            const reg: SessaoRegistro = {
                ...atual,
                tokenHash: novoHash,
                userAgent: meta.userAgent ?? atual.userAgent,
                ip: meta.ip ?? atual.ip,
                ultimoUso: new Date().toISOString(),
            };
            await store.gravar(reg, REFRESH_TOKEN_TTL);
            await store.ligarHash(novoHash, sid, REFRESH_TOKEN_TTL);
            if (meta.userAgent) await store.gravarUa(atual.usuarioId, meta.userAgent, REFRESH_TOKEN_TTL);
        },
        idPorHash: (hash) => store.hashParaId(hash),
        revogada: (sid) => store.estaRevogada(sid),
        async tocar(sid) {
            const atual = await store.ler(sid);
            if (!atual) return;
            await store.gravar({...atual, ultimoUso: new Date().toISOString()}, REFRESH_TOKEN_TTL);
        },
        async encerrarPorHash(hash) {
            const id = await store.hashParaId(hash);
            if (!id) return;
            const reg = await store.ler(id);
            if (reg) await derrubar(reg);
            else await store.desligarHash(hash);
        },
        async encerrarDoUsuario(usuarioId, sid, sidAtual) {
            if (sidAtual && sid === sidAtual) return "atual";
            const reg = await store.ler(sid);
            if (!reg || reg.usuarioId !== usuarioId) return "ausente";
            await derrubar(reg);
            return "ok";
        },
        async encerrarOutras(usuarioId, sidAtual) {
            const ids = await store.idsDoUsuario(usuarioId);
            let n = 0;
            for (const id of ids) {
                if (sidAtual && id === sidAtual) continue;
                const reg = await store.ler(id);
                if (!reg || reg.usuarioId !== usuarioId) continue;
                await derrubar(reg);
                n += 1;
            }
            return n;
        },
        async encerrarTodas(usuarioId) {
            const ids = await store.idsDoUsuario(usuarioId);
            for (const id of ids) {
                const reg = await store.ler(id);
                if (reg) await derrubar(reg);
            }
        },
        async listar(usuarioId, sidAtual) {
            const ids = await store.idsDoUsuario(usuarioId);
            const saida: SessaoPublica[] = [];
            for (const id of ids) {
                const reg = await store.ler(id);
                if (!reg || reg.usuarioId !== usuarioId) continue;
                if (await store.estaRevogada(id)) continue;
                saida.push({
                    id: reg.id,
                    dispositivo: rotuloDispositivo(reg.userAgent),
                    ip: mascararIp(reg.ip),
                    inicio: reg.criadoEm,
                    ultimoUso: reg.ultimoUso,
                    atual: sidAtual === reg.id,
                });
            }
            saida.sort((a, b) => (a.atual === b.atual ? b.ultimoUso.localeCompare(a.ultimoUso) : a.atual ? -1 : 1));
            return saida;
        },
        async hashDaSessao(sid) {
            const reg = await store.ler(sid);
            return reg?.tokenHash ?? null;
        },
        async lembrarUa(usuarioId, ua) {
            if (ua) await store.gravarUa(usuarioId, ua, REFRESH_TOKEN_TTL);
        },
        lerUa: (usuarioId) => store.lerUa(usuarioId),
    };
}

export const sessoes = criarSessoes(redisArmazem());
