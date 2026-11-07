import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {contaAnteriorParaRestaurar, contasAnterioresDoVinculo} from "./conciliacao-conta-anterior";

const hist = (id: number, item: number, acao: string, contas?: Record<string, number | null>) => ({
    id,
    item_conciliacao_id: item,
    acao,
    detalhes: JSON.stringify({linha_id: 1, ...(contas ? {contas_anteriores: contas} : {})}),
});

describe("contasAnterioresDoVinculo", () => {
    it("guarda a conta do título sem quitação que muda para a conta do extrato", () => {
        assert.deepEqual(
            contasAnterioresDoVinculo(
                [
                    {id: 10, conta_id: 1, quitadoCents: 0},
                    {id: 11, conta_id: null, quitadoCents: 0},
                    {id: 12, conta_id: 2, quitadoCents: 0},
                ],
                2,
            ),
            {"10": 1, "11": null},
        );
    });

    it("título já com quitação (2º pagamento parcial) não guarda nada", () => {
        assert.deepEqual(contasAnterioresDoVinculo([{id: 10, conta_id: 2, quitadoCents: 4000}], 3), {});
    });
});

describe("contaAnteriorParaRestaurar", () => {
    it("sem registro guardado: não restaura", () => {
        assert.deepEqual(contaAnteriorParaRestaurar([hist(1, 100, "vincular")], 10), {encontrada: false});
        assert.deepEqual(contaAnteriorParaRestaurar([], 10), {encontrada: false});
    });

    it("restaura a conta guardada no vínculo", () => {
        assert.deepEqual(contaAnteriorParaRestaurar([hist(1, 100, "vincular", {"10": 7})], 10), {encontrada: true, conta_id: 7});
        assert.deepEqual(
            contaAnteriorParaRestaurar([hist(1, 100, "criar_residuo_parcial", {"10": null})], 10),
            {encontrada: true, conta_id: null},
        );
    });

    it("dois pagamentos do mesmo título: vale o do primeiro (conta original)", () => {
        // 1º pagamento guardou a conta 7; o 2º não guardou (título já na conta do extrato).
        const h = [hist(1, 100, "vincular", {"10": 7}), hist(2, 101, "vincular")];
        assert.deepEqual(contaAnteriorParaRestaurar(h, 10), {encontrada: true, conta_id: 7});
    });

    it("item desfeito e vinculado de novo: vale só o último registro do item", () => {
        const h = [hist(1, 100, "vincular", {"10": 7}), hist(2, 100, "desfazer_vinculo"), hist(3, 100, "vincular")];
        assert.deepEqual(contaAnteriorParaRestaurar(h, 10), {encontrada: false});
    });

    it("ignora outros títulos, outras ações e detalhes inválidos", () => {
        const h = [
            hist(1, 100, "vincular", {"11": 7}),
            hist(2, 101, "ignorar", {"10": 8}),
            {id: 3, item_conciliacao_id: 102, acao: "vincular", detalhes: "não é json"},
        ];
        assert.deepEqual(contaAnteriorParaRestaurar(h, 10), {encontrada: false});
    });
});
