/**
 * Núcleo dos filtros padronizados (ISMF-32/33).
 * Run: npx tsx --test src/components/shared/filtros/filtros-core.test.ts
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    atualizarRascunho,
    casaMulti,
    chipsDosFiltros,
    contarFiltrosAtivos,
    contemBusca,
    lerValoresDaQuery,
    moedaDigitadaParaUrl,
    moedaUrlParaDigitada,
    patchDosValores,
    removerFiltro,
    validarFaixa,
    type DefinicaoFiltro,
} from "./filtros-core.ts";

const defs: DefinicaoFiltro[] = [
    {
        chave: "status",
        rotulo: "Status",
        tipo: "multi",
        opcoes: [
            {valor: "pendente", rotulo: "Pendente"},
            {valor: "atrasado", rotulo: "Atrasado"},
        ],
    },
    {chave: "valor", rotulo: "Valor (R$)", tipo: "faixa-moeda"},
    {chave: "conta_id", rotulo: "Conta bancária", tipo: "select", opcoes: [{valor: "3", rotulo: "Itaú"}]},
    {chave: "departamento_id", rotulo: "Departamento", tipo: "select", opcoes: [{valor: "1", rotulo: "TI"}]},
    {
        chave: "centro_custo_id",
        rotulo: "Centro de custo",
        tipo: "select",
        dependeDe: "departamento_id",
        opcoes: (r) => (r.departamento_id === "1" ? [{valor: "9", rotulo: "Infra"}] : []),
    },
];

describe("lerValoresDaQuery", () => {
    it("lê só as chaves das definições e normaliza o multi", () => {
        const params = new URLSearchParams("status=atrasado,,atrasado&conta_id=3&q=abc&pagina=2&valor_min=10");
        assert.deepEqual(lerValoresDaQuery(defs, params), {status: "atrasado", conta_id: "3", valor_min: "10"});
    });

    it("descarta faixa inválida da URL", () => {
        const params = new URLSearchParams("valor_min=-5&valor_max=abc");
        assert.deepEqual(lerValoresDaQuery(defs, params), {});
    });
});

describe("patchDosValores", () => {
    it("remove (null) as chaves sem valor, inclusive as da faixa", () => {
        assert.deepEqual(patchDosValores(defs, {status: "pendente", valor_max: "50"}), {
            status: "pendente",
            valor_min: null,
            valor_max: "50",
            conta_id: null,
            departamento_id: null,
            centro_custo_id: null,
        });
    });
});

describe("contagem, chips e remoção", () => {
    const valores = {status: "pendente,atrasado", valor_min: "100", conta_id: "3", departamento_id: "1", centro_custo_id: "9"};

    it("conta um por filtro (a faixa conta uma vez)", () => {
        assert.equal(contarFiltrosAtivos(defs, valores), 5);
        assert.equal(contarFiltrosAtivos(defs, {valor_min: "1", valor_max: "2"}), 1);
    });

    it("monta o texto dos chips com rótulos das opções", () => {
        const chips = chipsDosFiltros(defs, valores);
        assert.deepEqual(chips.map((c) => `${c.rotulo}: ${c.texto}`), [
            "Status: Pendente, Atrasado",
            "Valor (R$): a partir de R$ 100,00",
            "Conta bancária: Itaú",
            "Departamento: TI",
            "Centro de custo: Infra",
        ]);
        assert.equal(
            chipsDosFiltros(defs, {valor_min: "10", valor_max: "20"})[0].texto,
            "R$ 10,00 a R$ 20,00",
        );
        assert.equal(chipsDosFiltros(defs, {valor_max: "20"})[0].texto, "até R$ 20,00");
    });

    it("remover o pai remove o dependente", () => {
        const r = removerFiltro(defs, valores, "departamento_id");
        assert.equal(r.departamento_id, undefined);
        assert.equal(r.centro_custo_id, undefined);
        assert.equal(r.conta_id, "3");
    });

    it("trocar o pai no rascunho limpa o dependente; repetir o mesmo valor não", () => {
        assert.equal(atualizarRascunho(defs, valores, "departamento_id", "2").centro_custo_id, undefined);
        assert.equal(atualizarRascunho(defs, valores, "departamento_id", "1").centro_custo_id, "9");
    });
});

describe("moeda", () => {
    it("aceita formatos brasileiros e com ponto decimal", () => {
        assert.equal(moedaDigitadaParaUrl("1.234,56"), "1234.56");
        assert.equal(moedaDigitadaParaUrl("1.000"), "1000");
        assert.equal(moedaDigitadaParaUrl("12.000.000"), "12000000");
        assert.equal(moedaDigitadaParaUrl("R$ 99,9"), "99.9");
        assert.equal(moedaDigitadaParaUrl("1234.5"), "1234.5");
        assert.equal(moedaDigitadaParaUrl(""), "");
        assert.equal(moedaDigitadaParaUrl("abc"), "");
        assert.equal(moedaDigitadaParaUrl("-3"), "");
    });

    it("formata de volta para o campo", () => {
        assert.equal(moedaUrlParaDigitada("1234.5"), "1.234,50");
        assert.equal(moedaUrlParaDigitada(undefined), "");
    });

    it("valida mín ≤ máx", () => {
        assert.equal(validarFaixa("10", "5"), "O valor mínimo não pode ser maior que o máximo.");
        assert.equal(validarFaixa("5", "5"), null);
        assert.equal(validarFaixa("", "5"), null);
    });
});

describe("filtro no navegador", () => {
    it("busca sem acento e sem caixa em vários campos", () => {
        assert.equal(contemBusca("joao", "João da Silva", null), true);
        assert.equal(contemBusca("123", "Fulano", 98123), true);
        assert.equal(contemBusca("xyz", "Fulano"), false);
        assert.equal(contemBusca("  ", "qualquer"), true);
    });

    it("multi vazio não restringe", () => {
        assert.equal(casaMulti("", "ativo"), true);
        assert.equal(casaMulti("ativo,inativo", "inativo"), true);
        assert.equal(casaMulti("ativo", "inativo"), false);
        assert.equal(casaMulti("ativo", null), false);
    });
});
