import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    alternarPeriodo,
    descricaoDaSelecao,
    lerSelecaoDaUrl,
    mesesDaSelecao,
    periodoDoMes,
    periodosDaVisao,
    resumoDaSelecao,
    selecaoParaUrl,
    selecaoPadrao,
    sufixoArquivoDaSelecao,
    todosMarcados,
} from "./periodo-metas.ts";

describe("periodosDaVisao", () => {
    it("cobre os 12 meses sem buracos em toda visão", () => {
        for (const visao of ["ano", "semestre", "trimestre", "mes"] as const) {
            const meses = periodosDaVisao(visao).flatMap((p) => p.meses);
            assert.deepEqual(meses, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], visao);
        }
    });

    it("quantidade e rótulos", () => {
        assert.equal(periodosDaVisao("ano").length, 1);
        assert.equal(periodosDaVisao("semestre").length, 2);
        assert.equal(periodosDaVisao("trimestre").length, 4);
        assert.equal(periodosDaVisao("mes").length, 12);
        assert.equal(periodosDaVisao("trimestre")[1].rotulo, "2º trimestre");
        assert.deepEqual(periodosDaVisao("trimestre")[1].meses, [4, 5, 6]);
        assert.equal(periodosDaVisao("semestre")[1].rotulo, "2º semestre");
        assert.deepEqual(periodosDaVisao("semestre")[1].meses, [7, 8, 9, 10, 11, 12]);
        assert.equal(periodosDaVisao("mes")[2].rotulo, "Março");
        assert.equal(periodosDaVisao("mes")[2].rotuloCurto, "Mar");
    });
});

describe("periodoDoMes / selecaoPadrao", () => {
    it("acha o período que contém o mês", () => {
        assert.equal(periodoDoMes("trimestre", 1), 1);
        assert.equal(periodoDoMes("trimestre", 3), 1);
        assert.equal(periodoDoMes("trimestre", 4), 2);
        assert.equal(periodoDoMes("trimestre", 12), 4);
        assert.equal(periodoDoMes("semestre", 6), 1);
        assert.equal(periodoDoMes("semestre", 7), 2);
        assert.equal(periodoDoMes("mes", 11), 11);
    });

    it("padrão é o período do mês de referência", () => {
        assert.deepEqual(selecaoPadrao("trimestre", 11), {visao: "trimestre", periodos: [4]});
        assert.deepEqual(selecaoPadrao("mes", 2), {visao: "mes", periodos: [2]});
    });
});

describe("mesesDaSelecao", () => {
    it("ano inteiro = 12 meses", () => {
        assert.deepEqual(mesesDaSelecao({visao: "ano", periodos: [1]}), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it("une os meses dos períodos marcados, em ordem", () => {
        assert.deepEqual(mesesDaSelecao({visao: "trimestre", periodos: [1, 3]}), [1, 2, 3, 7, 8, 9]);
        assert.deepEqual(mesesDaSelecao({visao: "semestre", periodos: [2]}), [7, 8, 9, 10, 11, 12]);
        assert.deepEqual(mesesDaSelecao({visao: "mes", periodos: [12, 1]}), [1, 12]);
    });
});

describe("lerSelecaoDaUrl / selecaoParaUrl", () => {
    it("sem parâmetros = ano inteiro", () => {
        assert.deepEqual(lerSelecaoDaUrl("", "", 5), {visao: "ano", periodos: [1]});
        assert.deepEqual(lerSelecaoDaUrl(null, null, 5), {visao: "ano", periodos: [1]});
    });

    it("visão inválida cai no ano inteiro", () => {
        assert.deepEqual(lerSelecaoDaUrl("bimestre", "1", 5), {visao: "ano", periodos: [1]});
    });

    it("lê, ordena e remove repetidos", () => {
        assert.deepEqual(lerSelecaoDaUrl("trimestre", "3,1,3", 5), {visao: "trimestre", periodos: [1, 3]});
        assert.deepEqual(lerSelecaoDaUrl("mes", "12, 2", 5), {visao: "mes", periodos: [2, 12]});
    });

    it("descarta períodos fora da faixa ou lixo; vazio vira o período do mês de referência", () => {
        assert.deepEqual(lerSelecaoDaUrl("trimestre", "0,5,x,2", 5), {visao: "trimestre", periodos: [2]});
        assert.deepEqual(lerSelecaoDaUrl("semestre", "3", 8), {visao: "semestre", periodos: [2]});
        assert.deepEqual(lerSelecaoDaUrl("mes", "", 8), {visao: "mes", periodos: [8]});
        assert.deepEqual(lerSelecaoDaUrl("mes", "1.5,-1", 8), {visao: "mes", periodos: [8]});
    });

    it("serializa e volta igual", () => {
        assert.deepEqual(selecaoParaUrl({visao: "ano", periodos: [1]}), {visao: null, periodos: null});
        const sel = {visao: "trimestre" as const, periodos: [3, 1]};
        const url = selecaoParaUrl(sel);
        assert.deepEqual(url, {visao: "trimestre", periodos: "1,3"});
        assert.deepEqual(lerSelecaoDaUrl(url.visao, url.periodos, 5), {visao: "trimestre", periodos: [1, 3]});
    });
});

describe("alternarPeriodo", () => {
    it("marca e desmarca mantendo a ordem", () => {
        const sel = {visao: "trimestre" as const, periodos: [2]};
        const marcado = alternarPeriodo(sel, 1);
        assert.deepEqual(marcado.periodos, [1, 2]);
        assert.deepEqual(alternarPeriodo(marcado, 2).periodos, [1]);
    });

    it("não deixa a seleção vazia", () => {
        const sel = {visao: "mes" as const, periodos: [4]};
        assert.deepEqual(alternarPeriodo(sel, 4), sel);
    });

    it("todosMarcados", () => {
        assert.equal(todosMarcados({visao: "semestre", periodos: [1, 2]}), true);
        assert.equal(todosMarcados({visao: "trimestre", periodos: [1, 2, 3]}), false);
    });
});

describe("rótulos", () => {
    it("resumo do botão", () => {
        assert.equal(resumoDaSelecao({visao: "ano", periodos: [1]}), "Ano inteiro");
        assert.equal(resumoDaSelecao({visao: "trimestre", periodos: [2]}), "2º trimestre");
        assert.equal(resumoDaSelecao({visao: "trimestre", periodos: [1, 3]}), "1º, 3º tri");
        assert.equal(resumoDaSelecao({visao: "trimestre", periodos: [1, 2, 3, 4]}), "Os 4 trimestres");
        assert.equal(resumoDaSelecao({visao: "semestre", periodos: [1, 2]}), "Os 2 semestres");
        assert.equal(resumoDaSelecao({visao: "mes", periodos: [1, 2]}), "Jan, Fev");
        assert.equal(resumoDaSelecao({visao: "mes", periodos: [1, 2, 3, 4]}), "4 meses");
        assert.equal(resumoDaSelecao({visao: "mes", periodos: [3]}), "Março");
    });

    it("descrição para título/PDF", () => {
        assert.equal(descricaoDaSelecao({visao: "ano", periodos: [1]}, 2026), "2026");
        assert.equal(descricaoDaSelecao({visao: "trimestre", periodos: [2]}, 2026), "2º trimestre 2026");
        assert.equal(descricaoDaSelecao({visao: "trimestre", periodos: [1, 3]}, 2026), "1º e 3º trimestres 2026");
        assert.equal(descricaoDaSelecao({visao: "semestre", periodos: [1, 2]}, 2025), "1º e 2º semestres 2025");
        assert.equal(descricaoDaSelecao({visao: "mes", periodos: [1, 2, 3]}, 2026), "Jan, Fev e Mar 2026");
        assert.equal(descricaoDaSelecao({visao: "mes", periodos: [5]}, 2026), "Maio 2026");
    });

    it("sufixo do arquivo", () => {
        assert.equal(sufixoArquivoDaSelecao({visao: "ano", periodos: [1]}), "");
        assert.equal(sufixoArquivoDaSelecao({visao: "trimestre", periodos: [2]}), "2T");
        assert.equal(sufixoArquivoDaSelecao({visao: "trimestre", periodos: [1, 3]}), "1T-3T");
        assert.equal(sufixoArquivoDaSelecao({visao: "semestre", periodos: [1]}), "1S");
        assert.equal(sufixoArquivoDaSelecao({visao: "mes", periodos: [1, 2]}), "Jan-Fev");
    });
});
