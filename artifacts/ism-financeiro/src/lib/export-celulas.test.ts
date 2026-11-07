import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    FORMATO_DATA_XLSX,
    FORMATO_MOEDA_XLSX,
    celulaXlsx,
    layoutTabelaPdf,
    numeroMoeda,
    serialExcel,
    textoMoeda,
    textoPdf,
} from "./export-celulas";
import {montarCorpoPdf, montarPlanilhaExport, type ExportColumn} from "./export";

describe("export-celulas", () => {
    it("moeda: lê number, texto da API e texto pt-BR; sai sempre com centavos", () => {
        assert.equal(numeroMoeda(14654.5), 14654.5);
        assert.equal(numeroMoeda("1234.56"), 1234.56);
        assert.equal(numeroMoeda("R$ 14.654,50"), 14654.5);
        assert.equal(numeroMoeda("-R$ 1.000,00"), -1000);
        assert.equal(numeroMoeda("216"), 216);
        assert.equal(numeroMoeda(""), null);
        assert.equal(numeroMoeda("12,5%"), null);
        assert.equal(numeroMoeda("—"), null);
        assert.equal(numeroMoeda(Number.NaN), null);

        assert.equal(textoMoeda(216), "216,00");
        assert.equal(textoMoeda(14654.5), "14.654,50");
        assert.equal(textoMoeda(-0.1), "-0,10");
        assert.equal(textoMoeda(-0), "0,00");
    });

    it("data: série do Excel sem fuso, para data civil, dd/mm/aaaa e Date", () => {
        assert.equal(serialExcel("2026-01-01"), 46023);
        assert.equal(serialExcel("2026-08-02"), 46236);
        assert.equal(serialExcel("02/08/2026"), 46236);
        assert.equal(serialExcel(new Date(2026, 7, 2, 23, 59)), 46236);
        assert.equal(serialExcel("2026-02-30"), null);
        assert.equal(serialExcel("Aluguel"), null);
        assert.equal(serialExcel(""), null);
        assert.equal(serialExcel(null), null);
    });

    it("célula do XLSX: moeda e data viram número com formato; o resto sai como veio", () => {
        assert.deepEqual(celulaXlsx("moeda", 14654.5, () => "x"), {v: 14654.5, z: FORMATO_MOEDA_XLSX});
        assert.deepEqual(celulaXlsx("data", "2026-08-02", () => "x"), {v: 46236, z: FORMATO_DATA_XLSX});
        assert.deepEqual(celulaXlsx("data", null, () => "—"), {v: "—"});
        assert.deepEqual(celulaXlsx(undefined, "Aluguel", () => "Aluguel"), {v: "Aluguel"});
    });

    it("texto do PDF: centavos e dd/mm/aaaa; texto não é mexido", () => {
        assert.equal(textoPdf("moeda", 216, () => ""), "216,00");
        assert.equal(textoPdf("data", "2026-08-02", () => ""), "02/08/2026");
        assert.equal(textoPdf(undefined, "12,5%", () => "12,5%"), "12,5%");
        assert.equal(textoPdf(undefined, "", () => ""), "");
        // Antes, texto que parecia número ("1.234" de um documento) virava outro número.
        assert.equal(textoPdf(undefined, "1.234", () => "1.234"), "1.234");
    });

    it("layout do PDF: mantém o padrão 2:1 quando cabe e reduz a fonte quando não cabe", () => {
        const pouco = layoutTabelaPdf(535, [{corpo: 10, cabecalho: 4}, {corpo: 5, cabecalho: 4}]);
        assert.equal(pouco.fonte, 7);
        assert.deepEqual(pouco.larguras.map((l) => Math.round(l)), [357, 178]);

        // 17 colunas de valores largos (metas com 4 períodos) numa página paisagem.
        const colunas = [{corpo: 12, cabecalho: 5}, ...Array.from({length: 16}, () => ({corpo: 6.2, cabecalho: 4}))];
        const apertado = layoutTabelaPdf(782, colunas);
        assert.ok(apertado.fonte < 7 && apertado.fonte >= 5);
        const soma = apertado.larguras.reduce((s, l) => s + l, 0);
        assert.ok(Math.abs(soma - 782) < 0.01);
        apertado.larguras.slice(1).forEach((l) => assert.ok(l >= 6.2 * apertado.fonte + 6 - 1e-9));
    });
});

describe("export.ts (montagem, sem gerar arquivo)", () => {
    const colunas: ExportColumn[] = [
        {header: "Categoria", key: "categoria"},
        {header: "Orçado", key: "orcado", tipo: "moeda"},
        {header: "Atingimento %", key: "pct"},
        {header: "Vencimento", key: "vencimento", tipo: "data", formatter: () => "—"},
    ];
    const linhas = [
        {categoria: "Ocupação", orcado: 216, pct: "50,0%", vencimento: "2026-08-02"},
        {categoria: "TOTAL", orcado: 14654.5, pct: "—", vencimento: null},
    ];

    it("PDF com centavos (Relatório de Metas: 216,00 e 14.654,50)", () => {
        assert.deepEqual(montarCorpoPdf(linhas, colunas), [
            ["Ocupação", "216,00", "50,0%", "02/08/2026"],
            ["TOTAL", "14.654,50", "—", "—"],
        ]);
    });

    it("XLSX com moeda numérica e data de verdade", () => {
        const planilha = montarPlanilhaExport(linhas, colunas);
        assert.deepEqual(planilha[0], colunas.map((c) => ({v: c.header})));
        assert.deepEqual(planilha[1], [
            {v: "Ocupação"},
            {v: 216, z: FORMATO_MOEDA_XLSX},
            {v: "50,0%"},
            {v: 46236, z: FORMATO_DATA_XLSX},
        ]);
        assert.deepEqual(planilha[2]![1], {v: 14654.5, z: FORMATO_MOEDA_XLSX});
        assert.deepEqual(planilha[2]![3], {v: "—"});
    });
});
