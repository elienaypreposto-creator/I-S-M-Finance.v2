import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {BANCOS_BR, BANCOS_PRINCIPAIS, bancoPorNome, filtrarBancos, siglaDoNome} from "./bancos-br.ts";

const codigos = (termo: string) => filtrarBancos(BANCOS_BR, termo).map((b) => b.codigo);

describe("BANCOS_BR", () => {
    it("principais primeiro, com os mesmos nomes já gravados nas contas", () => {
        assert.deepEqual(
            BANCOS_BR.slice(0, BANCOS_PRINCIPAIS.length).map((b) => b.nome),
            BANCOS_PRINCIPAIS.map((b) => b.nome),
        );
        assert.equal(bancoPorNome("Itaú Unibanco")?.codigo, "341");
        assert.equal(bancoPorNome("Caixa Econômica Federal")?.logo, "/logos-bancos/104.svg");
        assert.ok(BANCOS_BR.slice(0, BANCOS_PRINCIPAIS.length).every((b) => b.principal && b.logo));
    });

    it("lista completa do BCB, sem código ou nome repetido", () => {
        assert.ok(BANCOS_BR.length > 300);
        assert.equal(new Set(BANCOS_BR.map((b) => b.codigo)).size, BANCOS_BR.length);
        assert.equal(new Set(BANCOS_BR.map((b) => b.nome)).size, BANCOS_BR.length);
        assert.ok(BANCOS_BR.every((b) => /^\d{3}$/.test(b.codigo) && b.nome.trim() && b.sigla));
        const amazonia = BANCOS_BR.find((b) => b.codigo === "003");
        assert.equal(amazonia?.principal, false);
        assert.equal(amazonia?.logo, undefined);
    });

    it("nome que não está na lista não é encontrado (a tela mostra o texto salvo)", () => {
        assert.equal(bancoPorNome("Banco Que Não Existe"), undefined);
        assert.equal(bancoPorNome(""), undefined);
        assert.equal(bancoPorNome(null), undefined);
    });
});

describe("filtrarBancos", () => {
    it("termo vazio devolve a lista inteira na mesma ordem", () => {
        assert.deepEqual(filtrarBancos(BANCOS_BR, "  "), [...BANCOS_BR]);
    });

    it("código com ou sem zeros à esquerda, exato primeiro", () => {
        assert.equal(codigos("1")[0], "001");
        assert.equal(codigos("001")[0], "001");
        assert.equal(codigos("01")[0], "001");
        assert.equal(codigos("341")[0], "341");
        assert.equal(codigos("77")[0], "077");
        assert.ok(codigos("1").includes("104"), "prefixo do código também casa");
    });

    it("nome sem diferenciar maiúsculas e acentos", () => {
        assert.equal(filtrarBancos(BANCOS_BR, "itau")[0].nome, "Itaú Unibanco");
        assert.equal(filtrarBancos(BANCOS_BR, "ITAÚ")[0].nome, "Itaú Unibanco");
        assert.ok(filtrarBancos(BANCOS_BR, "economica").some((b) => b.nome === "Caixa Econômica Federal"));
        assert.ok(filtrarBancos(BANCOS_BR, "amazonia").some((b) => b.codigo === "003"));
    });

    it("várias palavras: todas precisam casar (código ou nome)", () => {
        assert.deepEqual(codigos("banco brasil").slice(0, 1), ["001"]);
        assert.deepEqual(codigos("341 itau"), ["341"]);
        assert.deepEqual(codigos("341 bradesco"), []);
    });

    it("sigla dos principais", () => {
        assert.equal(codigos("bb")[0], "001");
    });

    it("sem resultado", () => {
        assert.deepEqual(filtrarBancos(BANCOS_BR, "zzzz-inexistente"), []);
    });
});

describe("siglaDoNome", () => {
    it("gera sigla curta para o selo", () => {
        assert.equal(siglaDoNome("Banco da Amazonia"), "AM");
        assert.equal(siglaDoNome("BNDES"), "BN");
        assert.equal(siglaDoNome("UBS (Brasil) Corretora de Valores"), "UBS");
        assert.equal(siglaDoNome("Credisan CC"), "CC");
        assert.equal(siglaDoNome("Banco"), "?");
    });
});
