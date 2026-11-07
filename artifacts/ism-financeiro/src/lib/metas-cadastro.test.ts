import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    acaoAoSalvarCelula,
    entradaMetaParaApi,
    resumirCadastroMetas,
    rotuloCelulaMeta,
    rotuloLinhaMeta,
    rotuloPeriodoMetas,
    valorMeta,
    type MetaCadastro,
    type PlanoContaCadastro,
} from "./metas-cadastro.ts";
import {formatValorBrInput} from "../validations/lancamentos.schema.ts";

const TODOS = Array.from({length: 12}, (_, i) => i + 1);

const planos: PlanoContaCadastro[] = [
    {id: 1, tipo: "receita", ativo: true},
    {id: 2, tipo: "despesa", ativo: true},
    {id: 3, tipo: "custo", ativo: true},
    {id: 4, tipo: "despesa", ativo: false},
];

function meta(plano_conta_id: number, mes: number, valor_projetado: string): MetaCadastro {
    return {plano_conta_id, mes, valor_projetado};
}

describe("resumirCadastroMetas — contagem", () => {
    it("meta zerada não conta como categoria com meta", () => {
        const r = resumirCadastroMetas([meta(1, 1, "100.00"), meta(2, 1, "0.00"), meta(3, 2, "0")], planos, TODOS);
        assert.equal(r.categoriasComMeta, 1);
        assert.equal(r.categoriasAtivas, 3);
    });

    it("conta cada plano uma vez, mesmo com vários meses", () => {
        const r = resumirCadastroMetas([meta(1, 1, "10.00"), meta(1, 2, "20.00"), meta(1, 3, "0.00")], planos, TODOS);
        assert.equal(r.categoriasComMeta, 1);
    });

    it("plano inativo não entra na contagem (o card é X / ativos)", () => {
        const r = resumirCadastroMetas([meta(4, 1, "50.00")], planos, TODOS);
        assert.equal(r.categoriasComMeta, 0);
    });

    it("valor inválido vale zero", () => {
        assert.equal(valorMeta("abc"), 0);
        assert.equal(valorMeta(undefined), 0);
        assert.equal(valorMeta("1500.50"), 1500.5);
    });
});

describe("resumirCadastroMetas — filtro de mês", () => {
    const metas = [
        meta(1, 1, "1000.00"),
        meta(1, 2, "2000.00"),
        meta(2, 1, "300.00"),
        meta(3, 3, "200.00"),
    ];

    it("sem filtro (todos os meses) soma o ano", () => {
        const r = resumirCadastroMetas(metas, planos, TODOS);
        assert.equal(r.receitas, 3000);
        assert.equal(r.saidas, 500);
        assert.equal(r.resultado, 2500);
        assert.equal(r.categoriasComMeta, 3);
    });

    it("com meses escolhidos, soma e conta só esses meses", () => {
        const r = resumirCadastroMetas(metas, planos, [2, 3]);
        assert.equal(r.receitas, 2000);
        assert.equal(r.saidas, 200);
        assert.equal(r.resultado, 1800);
        assert.equal(r.categoriasComMeta, 2);
    });

    it("mês sem meta nenhuma zera os cards", () => {
        const r = resumirCadastroMetas(metas, planos, [12]);
        assert.deepEqual(
            {receitas: r.receitas, saidas: r.saidas, resultado: r.resultado, n: r.categoriasComMeta},
            {receitas: 0, saidas: 0, resultado: 0, n: 0},
        );
    });
});

describe("digitação de moeda na célula", () => {
    it("máscara de centavos pt-BR (mesma dos outros campos)", () => {
        assert.equal(formatValorBrInput("1"), "0,01");
        assert.equal(formatValorBrInput("150000"), "1.500,00");
        assert.equal(formatValorBrInput("R$ 1.234,5x6"), "1.234,56");
        assert.equal(formatValorBrInput(""), "");
    });

    it("texto mascarado vira valor da API; vazio vira 0.00", () => {
        assert.equal(entradaMetaParaApi("1.500,00"), "1500.00");
        assert.equal(entradaMetaParaApi("0,05"), "0.05");
        assert.equal(entradaMetaParaApi(""), "0.00");
    });
});

describe("acaoAoSalvarCelula", () => {
    it("abrir e fechar célula vazia não cria meta 0", () => {
        assert.equal(acaoAoSalvarCelula(undefined, ""), "nada");
        assert.equal(acaoAoSalvarCelula("0.00", ""), "nada");
    });

    it("mesmo valor em formatos diferentes não salva de novo", () => {
        assert.equal(acaoAoSalvarCelula("1500.00", "1.500,00"), "nada");
        assert.equal(acaoAoSalvarCelula("1500", "1.500,00"), "nada");
    });

    it("apagar uma meta existente é remoção (com aviso na tela)", () => {
        assert.equal(acaoAoSalvarCelula("1500.00", ""), "remover");
        assert.equal(acaoAoSalvarCelula("1500.00", "0,00"), "remover");
    });

    it("valor novo ou alterado salva", () => {
        assert.equal(acaoAoSalvarCelula(undefined, "10,00"), "salvar");
        assert.equal(acaoAoSalvarCelula("10.00", "10,01"), "salvar");
    });
});

describe("rótulos", () => {
    it("período dos cards", () => {
        assert.equal(rotuloPeriodoMetas(TODOS, 2026), "2026");
        assert.equal(rotuloPeriodoMetas([], 2026), "2026");
        assert.equal(rotuloPeriodoMetas([3], 2026), "Mar 2026");
        assert.equal(rotuloPeriodoMetas([3, 1, 2], 2026), "Jan–Mar 2026");
        assert.equal(rotuloPeriodoMetas([1, 3, 6], 2026), "Jan, Mar, Jun 2026");
    });

    it("célula com categoria, mês e valor", () => {
        assert.equal(
            rotuloCelulaMeta("Vendas / Produtos", 3, 2026, "R$ 1.500,00"),
            "Meta de Vendas / Produtos em Março de 2026: R$ 1.500,00",
        );
        assert.equal(rotuloCelulaMeta("Aluguel", 12, 2026, null), "Meta de Aluguel em Dezembro de 2026: sem meta");
    });

    it("linhas de mesmo nome em receita e despesa têm rótulos diferentes", () => {
        const receita = rotuloLinhaMeta("Serviços", "Consultoria", "receita");
        const despesa = rotuloLinhaMeta("Serviços", "Consultoria", "despesa");
        assert.equal(receita, "Serviços / Consultoria (receita)");
        assert.equal(despesa, "Serviços / Consultoria (despesa)");
        assert.notEqual(rotuloCelulaMeta(receita, 1, 2026, null), rotuloCelulaMeta(despesa, 1, 2026, null));
        assert.equal(rotuloLinhaMeta("Aluguel", null, "custo"), "Aluguel (custo)");
    });
});
