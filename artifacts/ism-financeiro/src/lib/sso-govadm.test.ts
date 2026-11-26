import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    MENSAGEM_SSO_ERRO_GENERICA,
    MENSAGENS_SSO_ERRO,
    lerErroDaQuery,
    lerSelecaoDoHash,
    mensagemSsoErro,
    urlSemParametrosSso,
} from "./sso-govadm.ts";

describe("entrada pelo GovADM", () => {
    it("lê o selectionToken do hash", () => {
        assert.equal(lerSelecaoDoHash("#sso_selecao=abc.def-123"), "abc.def-123");
        assert.equal(lerSelecaoDoHash("sso_selecao=xyz"), "xyz");
        assert.equal(lerSelecaoDoHash("#sso_selecao="), null);
        assert.equal(lerSelecaoDoHash("#outra=1"), null);
        assert.equal(lerSelecaoDoHash(""), null);
    });

    it("lê o código de erro da query", () => {
        assert.equal(lerErroDaQuery("?sso_erro=sem_vinculo"), "sem_vinculo");
        assert.equal(lerErroDaQuery("?x=1&sso_erro=bloqueado"), "bloqueado");
        assert.equal(lerErroDaQuery("?sso_erro="), null);
        assert.equal(lerErroDaQuery(""), null);
    });

    it("tem mensagem para cada código combinado com a API e genérica para o resto", () => {
        for (const codigo of ["token_invalido", "indisponivel", "sem_vinculo", "bloqueado", "sem_empresa", "nao_permitido"]) {
            assert.equal(mensagemSsoErro(codigo), MENSAGENS_SSO_ERRO[codigo]);
            assert.notEqual(mensagemSsoErro(codigo), MENSAGEM_SSO_ERRO_GENERICA);
        }
        assert.equal(mensagemSsoErro("qualquer"), MENSAGEM_SSO_ERRO_GENERICA);
        assert.equal(mensagemSsoErro("toString"), MENSAGEM_SSO_ERRO_GENERICA);
    });

    it("limpa só os parâmetros do SSO da URL", () => {
        assert.equal(urlSemParametrosSso("/login", "", "#sso_selecao=abc"), "/login");
        assert.equal(urlSemParametrosSso("/login", "?sso_erro=bloqueado", ""), "/login");
        assert.equal(urlSemParametrosSso("/login", "?x=1&sso_erro=bloqueado", ""), "/login?x=1");
        assert.equal(urlSemParametrosSso("/login", "?x=1", "#ancora"), "/login?x=1#ancora");
    });
});
