import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    atingimentoPct,
    avaliarMeta,
    caminhoCategoria,
    formatarPct,
    normalizarTipo,
    resumirMetas,
    SEM_CATEGORIA,
    type ItemMetaResumo,
} from "./metas-resumo.ts";
import {periodosDaVisao, periodosSelecionados} from "./periodo-metas.ts";

function item(
    categoria: string | null,
    tipo: string | null,
    mes: number,
    orcado: number,
    realizado: number,
    juros = 0,
    subcategoria: string | null = null,
): ItemMetaResumo {
    return {categoria, tipo, subcategoria, mes, valor_projetado: orcado, valor_realizado: realizado, juros};
}

describe("resumirMetas", () => {
    const itens = [
        item("Vendas", "receita", 1, 1000, 1100),
        item("Vendas", "receita", 4, 1000, 900, 5),
        item("Aluguel", "despesa", 2, 500, 600),
        item("Aluguel", "despesa", 7, 500, 0),
        item("Matéria-prima", "custo", 3, 300, 200),
        item("Rendimento", "receita", 5, 0, 30),
        item("Serviços", "despesa", 8, 0, 70),
    ];

    it("receitas e despesas nunca se somam", () => {
        const r = resumirMetas(itens, periodosDaVisao("ano"));
        assert.deepEqual(r.receitas.total, {orcadoCents: 200000, realizadoCents: 200000, jurosCents: 500});
        // Custos entram no grupo despesas.
        assert.deepEqual(r.despesas.total, {orcadoCents: 130000, realizadoCents: 80000, jurosCents: 0});
        assert.deepEqual(r.receitas.linhas.map((l) => l.categoria), ["Vendas"]);
        assert.deepEqual(r.despesas.linhas.map((l) => [l.categoria, l.tipo]), [
            ["Aluguel", "despesa"],
            ["Matéria-prima", "custo"],
        ]);
    });

    it("realizado sem orçado vai para 'Sem meta' e fica fora do %", () => {
        const r = resumirMetas(itens, periodosDaVisao("ano"));
        assert.deepEqual(r.semMeta.map((l) => [l.categoria, l.grupo]), [
            ["Rendimento", "receitas"],
            ["Serviços", "despesas"],
        ]);
        assert.equal(r.receitas.semMeta.realizadoCents, 3000);
        assert.equal(r.despesas.semMeta.realizadoCents, 7000);
        assert.equal(atingimentoPct(r.receitas.total), 100);
        assert.equal(atingimentoPct(r.semMeta[0].total), null);
    });

    it("resultado = receitas − despesas (realizado inclui o sem meta)", () => {
        const r = resumirMetas(itens, periodosDaVisao("ano"));
        assert.equal(r.resultado.orcadoCents, 200000 - 130000);
        assert.equal(r.resultado.realizadoCents, 200000 + 3000 - 80000 - 7000);
        assert.equal(r.resultado.jurosCents, 500);
    });

    it("cenário do QA: orçado só em receitas, realizado em categorias sem meta", () => {
        // 2º semestre: única meta é Suporte mensal (agosto); o resto foi realizado sem meta.
        const qa = [
            item("Suporte mensal", "receita", 8, 2000, 0),
            item("Rendimento", "receita", 8, 0, 6826),
            item("34343", "custo", 7, 0, 10000),
            item("Serviços", "despesa", 8, 0, 3138.2),
        ];
        const r = resumirMetas(qa, periodosSelecionados({visao: "semestre", periodos: [2]}));
        assert.equal(formatarPct(atingimentoPct(r.receitas.total)), "0,0%");
        assert.equal(atingimentoPct(r.despesas.total), null);
        assert.equal(r.semMeta.length, 3);
    });

    it("separa por período e ignora meses fora da seleção", () => {
        const periodos = periodosSelecionados({visao: "trimestre", periodos: [1, 2]});
        const r = resumirMetas(itens, periodos);
        // Aluguel de julho (3º tri) e Serviços de agosto ficam de fora.
        assert.deepEqual(r.receitas.totalPorPeriodo[0], {orcadoCents: 100000, realizadoCents: 110000, jurosCents: 0});
        assert.deepEqual(r.receitas.totalPorPeriodo[1], {orcadoCents: 100000, realizadoCents: 90000, jurosCents: 500});
        assert.deepEqual(r.despesas.totalPorPeriodo[0], {orcadoCents: 80000, realizadoCents: 80000, jurosCents: 0});
        assert.deepEqual(r.receitas.semMetaPorPeriodo[1], {orcadoCents: 0, realizadoCents: 3000, jurosCents: 0});
        assert.equal(r.resultadoPorPeriodo[0].orcadoCents, 100000 - 80000);
        assert.equal(r.resultadoPorPeriodo[1].realizadoCents, 90000 + 3000);
        assert.equal(r.semMeta.some((l) => l.categoria === "Serviços"), false);
    });

    it("categoria com contas de tipos diferentes vira uma linha por tipo", () => {
        const r = resumirMetas(
            [
                item("34343", "custo", 1, 100, 50, 0, "434"),
                item("34343", "receita", 1, 200, 0, 0, "top"),
                item("Despesas Gerais", "despesa", 1, 1000, 0, 0, "Aluguel"),
                item("Despesas gerais", "receita", 1, 500, 0, 0, "Moradia"),
                item("Despesas gerais", "receita", 2, 300, 0, 0, "Abracadabra"),
            ],
            periodosDaVisao("ano"),
        );
        const rec = r.receitas.linhas.map((l) => l.categoria);
        const desp = r.despesas.linhas.map((l) => l.categoria);
        assert.deepEqual(rec, ["34343", "Despesas gerais"]);
        assert.deepEqual(desp, ["34343", "Despesas Gerais"]);
        assert.ok([...r.receitas.linhas, ...r.despesas.linhas].every((l) => l.nomeParecido));
        const gerais = r.receitas.linhas[1];
        assert.deepEqual(gerais.subcategorias, ["Abracadabra", "Moradia"]);
        assert.equal(caminhoCategoria(gerais), "Receita › Despesas gerais › Abracadabra, Moradia");
        assert.equal(gerais.total.orcadoCents, 80000);
    });

    it("nome único não é marcado como parecido", () => {
        const r = resumirMetas(itens, periodosDaVisao("ano"));
        assert.ok([...r.receitas.linhas, ...r.despesas.linhas, ...r.semMeta].every((l) => !l.nomeParecido));
    });

    it("soma em centavos sem erro de float", () => {
        const r = resumirMetas(
            [item("A", "receita", 1, 0.1, 0.1), item("A", "receita", 1, 0.2, 0.2), item("A", "receita", 2, 0.7, 0.7)],
            periodosDaVisao("ano"),
        );
        assert.equal(r.receitas.total.orcadoCents, 100);
        assert.equal(r.receitas.total.realizadoCents, 100);
    });

    it("tolera realizado/juros nulos e tipo/categoria ausentes", () => {
        const r = resumirMetas(
            [{categoria: null, mes: 3, valor_projetado: 10, valor_realizado: null, juros: null}],
            periodosDaVisao("mes"),
        );
        assert.equal(r.despesas.linhas[0].categoria, SEM_CATEGORIA);
        assert.deepEqual(r.despesas.totalPorPeriodo[2], {orcadoCents: 1000, realizadoCents: 0, jurosCents: 0});
    });

    it("sem itens no período", () => {
        const r = resumirMetas(itens, periodosSelecionados({visao: "mes", periodos: [12]}));
        assert.equal(r.receitas.linhas.length + r.despesas.linhas.length + r.semMeta.length, 0);
        assert.deepEqual(r.resultado, {orcadoCents: 0, realizadoCents: 0, jurosCents: 0});
    });
});

describe("normalizarTipo", () => {
    it("receita/custo/despesa; desconhecido conta como despesa", () => {
        assert.equal(normalizarTipo("Receita"), "receita");
        assert.equal(normalizarTipo("custo"), "custo");
        assert.equal(normalizarTipo("despesa"), "despesa");
        assert.equal(normalizarTipo(null), "despesa");
        assert.equal(normalizarTipo("outro"), "despesa");
    });
});

describe("avaliarMeta", () => {
    it("receita acima da meta é bom", () => {
        assert.equal(avaliarMeta("receitas", 120), "bom");
        assert.equal(avaliarMeta("receitas", 100), "bom");
        assert.equal(avaliarMeta("receitas", 80), "neutro");
    });

    it("despesa acima da meta é alerta", () => {
        assert.equal(avaliarMeta("despesas", 120), "alerta");
        assert.equal(avaliarMeta("despesas", 100), "bom");
        assert.equal(avaliarMeta("despesas", 40), "bom");
    });

    it("sem orçado é neutro", () => {
        assert.equal(avaliarMeta("receitas", null), "neutro");
        assert.equal(avaliarMeta("despesas", null), "neutro");
    });
});

describe("atingimentoPct / formatarPct", () => {
    it("realizado / orçado", () => {
        assert.equal(atingimentoPct({orcadoCents: 1000, realizadoCents: 950}), 95);
        assert.equal(atingimentoPct({orcadoCents: 1000, realizadoCents: 1200}), 120);
    });

    it("orçado zero → sem %", () => {
        assert.equal(atingimentoPct({orcadoCents: 0, realizadoCents: 500}), null);
        assert.equal(formatarPct(null), "—");
    });

    it("formata em pt-BR", () => {
        assert.equal(formatarPct(95.33), "95,3%");
        assert.equal(formatarPct(120, 0), "120%");
        assert.equal(formatarPct(1234.5), "1.234,5%");
    });
});
