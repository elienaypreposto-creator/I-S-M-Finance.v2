/**
 * Login vindo do GovADM (Fase 1) — validação do token de sessão do GovADM.
 *
 * O GovADM abre módulos externos com `?passport=<base64 login+senha>&token=<JWT>`.
 * O `passport` carrega a SENHA do usuário: este módulo nunca lê, usa, grava ou loga esse
 * parâmetro. Só o `token` é usado, e ele também nunca vai para log (só os 8 primeiros hex
 * do sha256, para correlacionar eventos).
 *
 * Validação (igual ao FISAC, TokenRestFeiginService): chamada servidor a servidor
 * `GET {GOVADM_TOKEN_URL}/authcontroller/token/validar/{token}`. O token é válido só se:
 *   - a resposta for 200 e o corpo trouxer um JWT. Formatos aceitos:
 *       a) corpo = o JWT puro (é o que o GovADM devolve hoje; o FISAC lê assim);
 *       b) corpo = string JSON com o JWT (`"eyJ..."`);
 *       c) corpo = objeto JSON com o JWT em `token`, `jwt`, `access_token`, `accessToken`
 *          ou `id_token` (também dentro de `data`). Qualquer outro formato é recusado;
 *   - o `idUsuario` do payload da resposta for igual ao do token recebido (decodificado);
 *   - o `iat` (da resposta; se faltar, do token recebido), quando existir, não for mais
 *     velho que GOVADM_TOKEN_MAX_IDADE_S nem estar no futuro além da tolerância de relógio;
 *   - `exp`/`nbf`, quando existirem, não estiverem vencidos/no futuro.
 * O payload é só decodificado em base64 (sem verificar assinatura): a confiança vem da
 * chamada ao GovADM por HTTPS. Qualquer erro = recusa (fail-closed).
 *
 * Tudo aqui é puro (sem banco): a rota injeta `fetch`/relógio nos testes.
 */

import crypto from "node:crypto";

// ─── Configuração ────────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

export const GOVADM_TIMEOUT_PADRAO_MS = 4000;
export const GOVADM_MAX_IDADE_PADRAO_S = 43200;
/** Tolerância de relógio entre ISM e GovADM para iat/nbf no futuro e exp no passado. */
export const GOVADM_TOLERANCIA_RELOGIO_S = 300;
/** Token maior que isso nem é enviado ao GovADM. */
export const GOVADM_TOKEN_MAX_CHARS = 8192;
/** Corpo de resposta maior que isso é recusado. */
const GOVADM_RESPOSTA_MAX_CHARS = 64 * 1024;

export interface GovadmConfig {
    emissor: string;
    /** Base do serviço do GovADM, sem barra final (o caminho /authcontroller/... é acrescentado). */
    tokenUrl: string;
    timeoutMs: number;
    maxIdadeS: number;
    frontendUrl: string;
    /** Origens aceitas no POST /api/auth/govadm (GOVADM_ORIGENS). */
    origens: string[];
    /** http:// permitido (só fora de produção, com GOVADM_PERMITIR_HTTP=true). */
    permitirHttp: boolean;
}

export type GovadmConfigResultado =
    | { ativo: true; config: GovadmConfig }
    /** `problema` null = desligado de propósito (GOVADM_SSO_HABILITADO != "true"). */
    | { ativo: false; problema: string | null };

const naoVazio = (v: string | undefined): string | null => {
    const t = v?.trim();
    return t ? t : null;
};

function inteiroPositivo(v: string | undefined, padrao: number, min: number, max: number): number {
    const n = Number(v);
    if (!v?.trim() || !Number.isInteger(n) || n < min) return padrao;
    return Math.min(n, max);
}

/** Normaliza para o formato do header Origin; descarta o que não for http(s). */
function paraOrigem(valor: string): string | null {
    try {
        const u = new URL(valor);
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        return u.origin;
    } catch {
        return null;
    }
}

/** GOVADM_ORIGENS (vírgula) normalizado para origin. */
export function parseGovadmOrigens(env: Env = process.env): string[] {
    const lista = (env.GOVADM_ORIGENS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(paraOrigem)
        .filter((o): o is string => o !== null);
    return [...new Set(lista)];
}

/** HTTPS sempre; HTTP só fora de produção e com GOVADM_PERMITIR_HTTP=true. */
export function protocoloPermitido(url: URL, permitirHttp: boolean, producao: boolean): boolean {
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && permitirHttp && !producao;
}

export function lerConfigGovadm(env: Env = process.env): GovadmConfigResultado {
    if (env.GOVADM_SSO_HABILITADO !== "true") return {ativo: false, problema: null};

    const emissor = naoVazio(env.GOVADM_EMISSOR);
    const tokenUrlBruta = naoVazio(env.GOVADM_TOKEN_URL);
    const frontendUrl = naoVazio(env.FRONTEND_URL);
    const faltando = [
        !emissor && "GOVADM_EMISSOR",
        !tokenUrlBruta && "GOVADM_TOKEN_URL",
        !frontendUrl && "FRONTEND_URL",
    ].filter(Boolean);
    if (faltando.length > 0) {
        return {ativo: false, problema: `faltando ${faltando.join(", ")}`};
    }

    let url: URL;
    try {
        url = new URL(tokenUrlBruta!);
    } catch {
        return {ativo: false, problema: "GOVADM_TOKEN_URL não é uma URL válida"};
    }
    const producao = env.NODE_ENV === "production";
    const permitirHttp = env.GOVADM_PERMITIR_HTTP === "true" && !producao;
    if (!protocoloPermitido(url, permitirHttp, producao)) {
        return {
            ativo: false,
            problema: producao
                ? "GOVADM_TOKEN_URL precisa ser https:// em produção"
                : "GOVADM_TOKEN_URL precisa ser https:// (http só com GOVADM_PERMITIR_HTTP=true fora de produção)",
        };
    }
    if (url.username || url.password || url.search || url.hash) {
        return {ativo: false, problema: "GOVADM_TOKEN_URL não pode ter usuário/senha, query ou fragmento"};
    }

    try {
        new URL(frontendUrl!);
    } catch {
        return {ativo: false, problema: "FRONTEND_URL não é uma URL válida"};
    }

    return {
        ativo: true,
        config: {
            emissor: emissor!,
            tokenUrl: url.toString().replace(/\/+$/, ""),
            timeoutMs: inteiroPositivo(env.GOVADM_INTROSPECCAO_TIMEOUT_MS, GOVADM_TIMEOUT_PADRAO_MS, 100, 30000),
            maxIdadeS: inteiroPositivo(env.GOVADM_TOKEN_MAX_IDADE_S, GOVADM_MAX_IDADE_PADRAO_S, 1, 7 * 24 * 3600),
            frontendUrl: frontendUrl!,
            origens: parseGovadmOrigens(env),
            permitirHttp,
        },
    };
}

/** Aviso do boot (null quando desligado de propósito ou tudo certo). */
export function avisoBootGovadm(env: Env = process.env): string | null {
    const r = lerConfigGovadm(env);
    if (r.ativo || r.problema === null) return null;
    return (
        `[boot] GOVADM_SSO_HABILITADO=true, mas ${r.problema}: o login vindo do GovADM ` +
        "(GET/POST /api/auth/govadm) fica DESLIGADO (404) até a configuração ser corrigida."
    );
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export function pareceJwt(valor: unknown): valor is string {
    return typeof valor === "string" && valor.length <= GOVADM_TOKEN_MAX_CHARS && JWT_RE.test(valor);
}

/** Decodifica (sem verificar assinatura) o payload de um JWT. null se não for objeto JSON. */
export function decodificarPayloadJwt(jwt: string): Record<string, unknown> | null {
    if (!pareceJwt(jwt)) return null;
    try {
        const json = Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8");
        const payload: unknown = JSON.parse(json);
        return payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

const CAMPOS_JWT_NA_RESPOSTA = ["token", "jwt", "access_token", "accessToken", "id_token"] as const;

/** Extrai o JWT do corpo da resposta do GovADM (formatos no cabeçalho do arquivo). */
export function extrairJwtDaResposta(corpo: string): string | null {
    const texto = corpo.trim();
    if (pareceJwt(texto)) return texto;

    let json: unknown;
    try {
        json = JSON.parse(texto);
    } catch {
        return null;
    }
    if (pareceJwt(json)) return json;
    const procurar = (obj: unknown): string | null => {
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
        for (const campo of CAMPOS_JWT_NA_RESPOSTA) {
            const v = (obj as Record<string, unknown>)[campo];
            if (pareceJwt(v)) return v;
        }
        return null;
    };
    return procurar(json) ?? procurar((json as Record<string, unknown> | null)?.data);
}

/** idUsuario do GovADM como texto (Long no Java; aceita número ou string simples). */
export function normalizarIdExterno(v: unknown): string | null {
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return String(v);
    if (typeof v === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(v.trim())) return v.trim();
    return null;
}

const textoCurto = (v: unknown, max = 200): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : (typeof v === "number" ? String(v) : null);

/** Data numérica do JWT em segundos; aceita milissegundos (valor > 1e12). */
function segundos(v: unknown): number | null {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0) return null;
    return n > 1e12 ? Math.floor(n / 1000) : n;
}

// ─── Validação ───────────────────────────────────────────────────────────────

/** Dados do usuário GovADM (sem cpf/matrícula: não são usados nem guardados). */
export interface UsuarioGovadm {
    idUsuario: string;
    login: string | null;
    email: string | null;
    nomeUsuario: string | null;
    siglaUnidade: string | null;
    idUnidade: string | null;
    jti: string | null;
    iat: number | null;
}

export type MotivoRecusaToken = "token_invalido" | "indisponivel";

export type ResultadoValidacaoGovadm =
    | { ok: true; usuario: UsuarioGovadm }
    | {
    ok: false;
    motivo: MotivoRecusaToken;
    /** Motivo técnico para o log (sem dado pessoal, sem token). */
    detalhe: string;
    /** idUsuario declarado no token recebido (não confirmado), para correlacionar na auditoria. */
    idDeclarado: string | null;
};

export interface DepsValidacaoGovadm {
    fetch?: typeof fetch;
    /** Relógio em ms (Date.now). */
    agora?: () => number;
    producao?: boolean;
}

export type ValidarTokenGovadm = (
    token: string,
    config: GovadmConfig,
    deps?: DepsValidacaoGovadm,
) => Promise<ResultadoValidacaoGovadm>;

function montarUsuario(payload: Record<string, unknown>, idUsuario: string, iat: number | null): UsuarioGovadm {
    return {
        idUsuario,
        login: textoCurto(payload.login ?? payload.username),
        email: textoCurto(payload.email),
        nomeUsuario: textoCurto(payload.nomeUsuario),
        siglaUnidade: textoCurto(payload.siglaUnidade, 50),
        idUnidade: normalizarIdExterno(payload.idUnidade),
        jti: textoCurto(payload.jti, 100),
        iat,
    };
}

export const validarTokenGovadm: ValidarTokenGovadm = async (token, config, deps = {}) => {
    const doFetch = deps.fetch ?? globalThis.fetch;
    const agoraS = Math.floor((deps.agora ?? Date.now)() / 1000);
    const producao = deps.producao ?? process.env.NODE_ENV === "production";

    const declarado = decodificarPayloadJwt(token);
    const idDeclarado = normalizarIdExterno(declarado?.idUsuario);
    const recusa = (motivo: MotivoRecusaToken, detalhe: string): ResultadoValidacaoGovadm =>
        ({ok: false, motivo, detalhe, idDeclarado});

    if (!declarado || !idDeclarado) return recusa("token_invalido", "token recebido não é JWT com idUsuario");

    let base: URL;
    try {
        base = new URL(config.tokenUrl);
    } catch {
        return recusa("indisponivel", "GOVADM_TOKEN_URL inválida");
    }
    if (!protocoloPermitido(base, config.permitirHttp, producao)) {
        return recusa("indisponivel", "protocolo da GOVADM_TOKEN_URL não permitido");
    }
    const url = `${config.tokenUrl.replace(/\/+$/, "")}/authcontroller/token/validar/${encodeURIComponent(token)}`;

    let status: number;
    let corpo: string;
    try {
        const resp = await doFetch(url, {
            method: "GET",
            headers: {Accept: "application/json, text/plain, */*"},
            redirect: "error",
            signal: AbortSignal.timeout(config.timeoutMs),
        });
        status = resp.status;
        corpo = status === 200 ? await resp.text() : "";
    } catch (e) {
        const nome = e instanceof Error ? e.name : "erro";
        return recusa("indisponivel", nome === "TimeoutError" ? "timeout" : `falha de rede (${nome})`);
    }

    if (status !== 200) {
        // 5xx / 429 / 408: o GovADM está com problema, não o token.
        if (status >= 500 || status === 429 || status === 408) return recusa("indisponivel", `HTTP ${status}`);
        return recusa("token_invalido", `HTTP ${status}`);
    }
    if (corpo.length > GOVADM_RESPOSTA_MAX_CHARS) return recusa("token_invalido", "resposta grande demais");

    const jwtResposta = extrairJwtDaResposta(corpo);
    const payload = jwtResposta ? decodificarPayloadJwt(jwtResposta) : null;
    if (!payload) return recusa("token_invalido", "resposta 200 sem JWT");

    const idResposta = normalizarIdExterno(payload.idUsuario);
    if (!idResposta) return recusa("token_invalido", "resposta sem idUsuario");
    if (idResposta !== idDeclarado) return recusa("token_invalido", "idUsuario da resposta difere do token");

    const iat = segundos(payload.iat) ?? segundos(declarado.iat);
    if (iat !== null) {
        if (agoraS - iat > config.maxIdadeS) return recusa("token_invalido", "token antigo demais (iat)");
        if (iat - agoraS > GOVADM_TOLERANCIA_RELOGIO_S) return recusa("token_invalido", "iat no futuro");
    }
    const exp = segundos(payload.exp);
    if (exp !== null && exp + GOVADM_TOLERANCIA_RELOGIO_S < agoraS) return recusa("token_invalido", "token expirado (exp)");
    const nbf = segundos(payload.nbf);
    if (nbf !== null && nbf - agoraS > GOVADM_TOLERANCIA_RELOGIO_S) return recusa("token_invalido", "token ainda não válido (nbf)");

    return {ok: true, usuario: montarUsuario(payload, idResposta, iat)};
};

/** 8 primeiros hex do sha256 do token: correlaciona eventos sem guardar o token. */
export function prefixoHashToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex").slice(0, 8);
}

// ─── Decisão de destino (pura) ───────────────────────────────────────────────

export const CODIGOS_ERRO_SSO = [
    "token_invalido",
    "indisponivel",
    "sem_vinculo",
    "bloqueado",
    "sem_empresa",
    "nao_permitido",
] as const;
export type CodigoErroSso = (typeof CODIGOS_ERRO_SSO)[number];
export type ResultadoSso = "ok" | CodigoErroSso;

export interface EntradaDecisaoGovadm {
    vinculo: { ativo: boolean; empresa_id_padrao: number | null } | null;
    usuario: { bloqueado: boolean; superadmin: boolean } | null;
    /** Empresas ativas com vínculo ativo do usuário (listEmpresasAtivasDoUsuario). */
    empresas: ReadonlyArray<{ id: number }>;
}

export type DecisaoGovadm =
    | { tipo: "sessao"; empresaId: number }
    | { tipo: "selecao" }
    | { tipo: "erro"; codigo: CodigoErroSso };

/** Regras do login GovADM depois que o token foi validado. Sem I/O. */
export function decidirDestinoGovadm({vinculo, usuario, empresas}: EntradaDecisaoGovadm): DecisaoGovadm {
    if (!vinculo || !vinculo.ativo || !usuario) return {tipo: "erro", codigo: "sem_vinculo"};
    if (usuario.bloqueado) return {tipo: "erro", codigo: "bloqueado"};
    // Superadmin só entra por senha: o acesso irrestrito não pode depender de um sistema externo.
    if (usuario.superadmin) return {tipo: "erro", codigo: "nao_permitido"};
    if (empresas.length === 0) return {tipo: "erro", codigo: "sem_empresa"};

    const padrao = vinculo.empresa_id_padrao;
    if (padrao != null && empresas.some((e) => e.id === padrao)) return {tipo: "sessao", empresaId: padrao};
    if (empresas.length === 1) return {tipo: "sessao", empresaId: empresas[0]!.id};
    return {tipo: "selecao"};
}

/** Raiz do front (FRONTEND_URL sem barra final). */
function baseFront(frontendUrl: string): string {
    return frontendUrl.trim().replace(/\/+$/, "");
}

/** Destino do 303. Nunca leva access token nem dado pessoal; o selectionToken vai no fragmento. */
export function urlDestinoGovadm(
    frontendUrl: string,
    destino: { tipo: "sessao" } | { tipo: "selecao"; selectionToken: string } | { tipo: "erro"; codigo: CodigoErroSso },
): string {
    const base = baseFront(frontendUrl);
    switch (destino.tipo) {
        case "sessao":
            return `${base}/`;
        case "selecao":
            return `${base}/login#sso_selecao=${encodeURIComponent(destino.selectionToken)}`;
        case "erro":
            return `${base}/login?sso_erro=${encodeURIComponent(destino.codigo)}`;
    }
}
