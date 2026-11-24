import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    avisoBootGovadm,
    decidirDestinoGovadm,
    decodificarPayloadJwt,
    extrairJwtDaResposta,
    lerConfigGovadm,
    parseGovadmOrigens,
    prefixoHashToken,
    urlDestinoGovadm,
    validarTokenGovadm,
    type GovadmConfig,
} from "./govadm.service.js";

const AGORA_MS = Date.UTC(2026, 10, 24, 12, 0, 0);
const AGORA_S = AGORA_MS / 1000;

/** JWT de teste (assinatura falsa: o serviço só decodifica). */
function jwt(payload: Record<string, unknown>): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({alg: "HS256", typ: "JWT"})}.${b64(payload)}.assinatura-falsa`;
}

const config: GovadmConfig = {
    emissor: "govadm-tst",
    tokenUrl: "https://govadm.exemplo.gov.br",
    timeoutMs: 4000,
    maxIdadeS: 43200,
    frontendUrl: "https://financeiro.exemplo.com.br",
    origens: ["https://govadm.exemplo.gov.br"],
    permitirHttp: false,
};

const PAYLOAD = {
    idUsuario: 123,
    login: "fulano",
    email: "fulano@exemplo.gov.br",
    nomeUsuario: "Fulano de Tal",
    siglaUnidade: "DTI",
    idUnidade: 7,
    cpf: "00000000000",
    jti: "abc",
    iat: AGORA_S - 60,
};
const TOKEN = jwt(PAYLOAD);

type Chamada = {url: string; init?: RequestInit};

function fetchFalso(resposta: () => Response | Promise<Response>, chamadas: Chamada[] = []): typeof fetch {
    return (async (url: string | URL | Request, init?: RequestInit) => {
        chamadas.push({url: String(url), init});
        return resposta();
    }) as typeof fetch;
}

const deps = (f: typeof fetch) => ({fetch: f, agora: () => AGORA_MS, producao: true});

describe("validarTokenGovadm", () => {
    it("200 com o JWT puro no corpo -> ok, chamando /authcontroller/token/validar/{token}", async () => {
        const chamadas: Chamada[] = [];
        const r = await validarTokenGovadm(TOKEN, config, deps(fetchFalso(() => new Response(TOKEN, {status: 200}), chamadas)));
        assert.equal(r.ok, true);
        if (!r.ok) return;
        assert.equal(r.usuario.idUsuario, "123");
        assert.equal(r.usuario.login, "fulano");
        assert.equal(r.usuario.siglaUnidade, "DTI");
        assert.equal(r.usuario.idUnidade, "7");
        assert.equal("cpf" in r.usuario, false, "cpf não deve ser repassado");
        assert.equal(chamadas.length, 1);
        assert.equal(chamadas[0]!.url, `https://govadm.exemplo.gov.br/authcontroller/token/validar/${TOKEN}`);
        assert.equal(chamadas[0]!.init?.method, "GET");
        assert.equal(chamadas[0]!.init?.redirect, "error");
        assert.ok(chamadas[0]!.init?.signal, "precisa de AbortSignal (timeout)");
    });

    it("200 com JSON {token} ou string JSON também vale", async () => {
        for (const corpo of [JSON.stringify({token: TOKEN}), JSON.stringify(TOKEN), JSON.stringify({data: {jwt: TOKEN}})]) {
            const r = await validarTokenGovadm(TOKEN, config, deps(fetchFalso(() => new Response(corpo, {status: 200}))));
            assert.equal(r.ok, true, corpo);
        }
    });

    it("200 sem JWT -> token_invalido", async () => {
        for (const corpo of ["", "true", "{\"valido\":true}", "<html>login</html>"]) {
            const r = await validarTokenGovadm(TOKEN, config, deps(fetchFalso(() => new Response(corpo, {status: 200}))));
            assert.equal(r.ok, false, corpo);
            if (!r.ok) assert.equal(r.motivo, "token_invalido");
        }
    });

    it("401 -> token_invalido; 503 -> indisponivel", async () => {
        const r401 = await validarTokenGovadm(TOKEN, config, deps(fetchFalso(() => new Response("", {status: 401}))));
        assert.deepEqual([r401.ok, !r401.ok && r401.motivo], [false, "token_invalido"]);
        const r503 = await validarTokenGovadm(TOKEN, config, deps(fetchFalso(() => new Response("", {status: 503}))));
        assert.deepEqual([r503.ok, !r503.ok && r503.motivo], [false, "indisponivel"]);
    });

    it("timeout / falha de rede -> indisponivel", async () => {
        const timeout = fetchFalso(() => {
            throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        });
        const r = await validarTokenGovadm(TOKEN, config, deps(timeout));
        assert.equal(r.ok, false);
        if (!r.ok) {
            assert.equal(r.motivo, "indisponivel");
            assert.equal(r.detalhe, "timeout");
            assert.equal(r.detalhe.includes(TOKEN), false);
        }
        const rede = fetchFalso(() => {
            throw new TypeError("fetch failed");
        });
        const r2 = await validarTokenGovadm(TOKEN, config, deps(rede));
        assert.equal(!r2.ok && r2.motivo, "indisponivel");
    });

    it("timeout real do AbortSignal com servidor que não responde", async () => {
        // O timer do AbortSignal.timeout é unref: o setTimeout abaixo mantém o loop vivo
        // (como faria um socket aberto) até o abort chegar.
        const pendurado = ((_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
                const vivo = setTimeout(() => reject(new Error("não abortou")), 5000);
                init?.signal?.addEventListener("abort", () => {
                    clearTimeout(vivo);
                    reject(init.signal!.reason);
                });
            })) as typeof fetch;
        const r = await validarTokenGovadm(TOKEN, {...config, timeoutMs: 50}, deps(pendurado));
        assert.equal(!r.ok && r.motivo, "indisponivel");
    });

    it("idUsuario da resposta diferente do token recebido -> token_invalido", async () => {
        const outro = jwt({...PAYLOAD, idUsuario: 999});
        const r = await validarTokenGovadm(TOKEN, config, deps(fetchFalso(() => new Response(outro, {status: 200}))));
        assert.equal(r.ok, false);
        if (!r.ok) {
            assert.equal(r.motivo, "token_invalido");
            assert.equal(r.idDeclarado, "123");
        }
    });

    it("iat mais velho que GOVADM_TOKEN_MAX_IDADE_S -> token_invalido; sem iat passa", async () => {
        const velho = jwt({...PAYLOAD, iat: AGORA_S - 43200 - 1});
        const r = await validarTokenGovadm(velho, config, deps(fetchFalso(() => new Response(velho, {status: 200}))));
        assert.equal(!r.ok && r.motivo, "token_invalido");

        const emMs = jwt({...PAYLOAD, iat: (AGORA_S - 60) * 1000});
        const rMs = await validarTokenGovadm(emMs, config, deps(fetchFalso(() => new Response(emMs, {status: 200}))));
        assert.equal(rMs.ok, true, "iat em milissegundos (Java) é aceito");

        const {iat: _iat, ...semIat} = PAYLOAD;
        const tSemIat = jwt(semIat);
        const rSem = await validarTokenGovadm(tSemIat, config, deps(fetchFalso(() => new Response(tSemIat, {status: 200}))));
        assert.equal(rSem.ok, true);
    });

    it("exp vencido -> token_invalido", async () => {
        const vencido = jwt({...PAYLOAD, exp: AGORA_S - 3600});
        const r = await validarTokenGovadm(vencido, config, deps(fetchFalso(() => new Response(vencido, {status: 200}))));
        assert.equal(!r.ok && r.motivo, "token_invalido");
    });

    it("token recebido que não é JWT com idUsuario nem chega a chamar o GovADM", async () => {
        const chamadas: Chamada[] = [];
        const f = fetchFalso(() => new Response(TOKEN, {status: 200}), chamadas);
        for (const t of ["abc", jwt({login: "sem-id"}), `${TOKEN}/../x`]) {
            const r = await validarTokenGovadm(t, config, deps(f));
            assert.equal(!r.ok && r.motivo, "token_invalido", t);
        }
        assert.equal(chamadas.length, 0);
    });

    it("http:// em produção é recusado sem chamar (fail-closed)", async () => {
        const chamadas: Chamada[] = [];
        const f = fetchFalso(() => new Response(TOKEN, {status: 200}), chamadas);
        const r = await validarTokenGovadm(
            TOKEN,
            {...config, tokenUrl: "http://govadm.exemplo.gov.br", permitirHttp: true},
            deps(f),
        );
        assert.equal(!r.ok && r.motivo, "indisponivel");
        assert.equal(chamadas.length, 0);
    });
});

describe("lerConfigGovadm", () => {
    const base = {
        GOVADM_SSO_HABILITADO: "true",
        GOVADM_EMISSOR: "govadm-tst",
        GOVADM_TOKEN_URL: "https://govadm.exemplo.gov.br/",
        FRONTEND_URL: "https://financeiro.exemplo.com.br",
    };

    it("desligado por padrão, sem aviso", () => {
        assert.deepEqual(lerConfigGovadm({}), {ativo: false, problema: null});
        assert.equal(avisoBootGovadm({}), null);
    });

    it("habilitado com tudo: defaults de timeout/idade e URL sem barra final", () => {
        const r = lerConfigGovadm(base);
        assert.equal(r.ativo, true);
        if (!r.ativo) return;
        assert.equal(r.config.tokenUrl, "https://govadm.exemplo.gov.br");
        assert.equal(r.config.timeoutMs, 4000);
        assert.equal(r.config.maxIdadeS, 43200);
        assert.equal(r.config.permitirHttp, false);
    });

    it("habilitado faltando variável -> desligado com aviso no boot", () => {
        for (const falta of ["GOVADM_EMISSOR", "GOVADM_TOKEN_URL", "FRONTEND_URL"] as const) {
            const env: Record<string, string | undefined> = {...base, [falta]: ""};
            const r = lerConfigGovadm(env);
            assert.equal(r.ativo, false);
            assert.match(avisoBootGovadm(env) ?? "", new RegExp(falta));
        }
    });

    it("http:// só fora de produção e com GOVADM_PERMITIR_HTTP=true", () => {
        const http = {...base, GOVADM_TOKEN_URL: "http://govadm.exemplo.gov.br"};
        assert.equal(lerConfigGovadm(http).ativo, false);
        assert.equal(lerConfigGovadm({...http, GOVADM_PERMITIR_HTTP: "true"}).ativo, true);
        assert.equal(lerConfigGovadm({...http, GOVADM_PERMITIR_HTTP: "true", NODE_ENV: "production"}).ativo, false);
        assert.equal(lerConfigGovadm({...base, NODE_ENV: "production"}).ativo, true);
    });

    it("recusa URL com query/credenciais e valores inválidos de timeout caem no padrão", () => {
        assert.equal(lerConfigGovadm({...base, GOVADM_TOKEN_URL: "https://u:s@govadm.exemplo.gov.br"}).ativo, false);
        assert.equal(lerConfigGovadm({...base, GOVADM_TOKEN_URL: "https://govadm.exemplo.gov.br?x=1"}).ativo, false);
        const r = lerConfigGovadm({...base, GOVADM_INTROSPECCAO_TIMEOUT_MS: "abc", GOVADM_TOKEN_MAX_IDADE_S: "-5"});
        assert.ok(r.ativo && r.config.timeoutMs === 4000 && r.config.maxIdadeS === 43200);
    });

    it("GOVADM_ORIGENS normalizado para origin", () => {
        assert.deepEqual(
            parseGovadmOrigens({GOVADM_ORIGENS: "https://govadm.exemplo.gov.br/app, lixo ,https://outro.gov.br"}),
            ["https://govadm.exemplo.gov.br", "https://outro.gov.br"],
        );
    });
});

describe("extração e decodificação do JWT", () => {
    it("decodifica payload sem verificar assinatura e recusa lixo", () => {
        assert.equal(decodificarPayloadJwt(TOKEN)?.idUsuario, 123);
        assert.equal(decodificarPayloadJwt("a.b"), null);
        assert.equal(decodificarPayloadJwt("a.bm90LWpzb24.c"), null);
    });

    it("extrai de corpo puro, string JSON e objeto JSON", () => {
        assert.equal(extrairJwtDaResposta(`  ${TOKEN}\n`), TOKEN);
        assert.equal(extrairJwtDaResposta(JSON.stringify({accessToken: TOKEN})), TOKEN);
        assert.equal(extrairJwtDaResposta(JSON.stringify({outro: TOKEN})), null);
    });

    it("hash do token: 8 hex, nunca o token", () => {
        const h = prefixoHashToken(TOKEN);
        assert.match(h, /^[0-9a-f]{8}$/);
        assert.equal(TOKEN.includes(h), false);
    });
});

describe("decidirDestinoGovadm", () => {
    const usuarioOk = {bloqueado: false, superadmin: false};
    const vinculo = {ativo: true, empresa_id_padrao: null};

    it("sem vínculo, vínculo inativo ou usuário inexistente -> sem_vinculo", () => {
        assert.deepEqual(decidirDestinoGovadm({vinculo: null, usuario: usuarioOk, empresas: [{id: 1}]}), {tipo: "erro", codigo: "sem_vinculo"});
        assert.deepEqual(decidirDestinoGovadm({vinculo: {ativo: false, empresa_id_padrao: null}, usuario: usuarioOk, empresas: [{id: 1}]}), {tipo: "erro", codigo: "sem_vinculo"});
        assert.deepEqual(decidirDestinoGovadm({vinculo, usuario: null, empresas: []}), {tipo: "erro", codigo: "sem_vinculo"});
    });

    it("bloqueado, superadmin e sem empresa", () => {
        assert.deepEqual(decidirDestinoGovadm({vinculo, usuario: {bloqueado: true, superadmin: false}, empresas: [{id: 1}]}), {tipo: "erro", codigo: "bloqueado"});
        assert.deepEqual(decidirDestinoGovadm({vinculo, usuario: {bloqueado: false, superadmin: true}, empresas: [{id: 1}]}), {tipo: "erro", codigo: "nao_permitido"});
        assert.deepEqual(decidirDestinoGovadm({vinculo, usuario: usuarioOk, empresas: []}), {tipo: "erro", codigo: "sem_empresa"});
    });

    it("uma empresa -> sessão nela; várias -> seleção; padrão válido vence", () => {
        assert.deepEqual(decidirDestinoGovadm({vinculo, usuario: usuarioOk, empresas: [{id: 4}]}), {tipo: "sessao", empresaId: 4});
        assert.deepEqual(decidirDestinoGovadm({vinculo, usuario: usuarioOk, empresas: [{id: 4}, {id: 5}]}), {tipo: "selecao"});
        assert.deepEqual(
            decidirDestinoGovadm({vinculo: {ativo: true, empresa_id_padrao: 5}, usuario: usuarioOk, empresas: [{id: 4}, {id: 5}]}),
            {tipo: "sessao", empresaId: 5},
        );
        // Padrão sem vínculo ativo é ignorado.
        assert.deepEqual(
            decidirDestinoGovadm({vinculo: {ativo: true, empresa_id_padrao: 9}, usuario: usuarioOk, empresas: [{id: 4}, {id: 5}]}),
            {tipo: "selecao"},
        );
        assert.deepEqual(
            decidirDestinoGovadm({vinculo: {ativo: true, empresa_id_padrao: 9}, usuario: usuarioOk, empresas: [{id: 4}]}),
            {tipo: "sessao", empresaId: 4},
        );
    });
});

describe("urlDestinoGovadm", () => {
    const front = "https://financeiro.exemplo.com.br/";

    it("sessão vai para a raiz, sem token na URL", () => {
        assert.equal(urlDestinoGovadm(front, {tipo: "sessao"}), "https://financeiro.exemplo.com.br/");
    });

    it("seleção leva o selectionToken só no fragmento", () => {
        const url = new URL(urlDestinoGovadm(front, {tipo: "selecao", selectionToken: "a.b.c"}));
        assert.equal(url.pathname, "/login");
        assert.equal(url.search, "");
        assert.equal(url.hash, "#sso_selecao=a.b.c");
    });

    it("erro vai para /login?sso_erro=<código>", () => {
        const url = new URL(urlDestinoGovadm(front, {tipo: "erro", codigo: "sem_vinculo"}));
        assert.equal(url.pathname, "/login");
        assert.equal(url.searchParams.get("sso_erro"), "sem_vinculo");
        assert.equal([...url.searchParams.keys()].length, 1);
    });
});
