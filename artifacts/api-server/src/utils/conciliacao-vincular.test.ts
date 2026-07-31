import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {centsToDecimalString, toCents} from "./money.js";
import {
    decidirVincular,
    statusAbertoPorVencimento,
    statusAposDesfazerVinculo,
    statusAposQuitacao,
} from "./conciliacao-vincular.js";

describe("decidirVincular - T1–T7 (auditoria)", () => {
    it("T1: extrato 8000 × lançamento 10000 + gerar_parcial -> residual 2000, pago_parcial", () => {
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(10000), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: true,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.deltaCents, -200000);
        assert.equal(d.ramo, "falta");
        assert.equal(d.faltaCents, 200000);
        assert.ok(d.residual);
        assert.equal(d.residual!.origemLancamentoId, 1);
        assert.equal(d.residual!.valorCents, 200000);
        assert.equal(centsToDecimalString(d.residual!.valorCents), "2000.00");
        assert.equal(d.itens[0]!.valorQuitadoNesteVinculoCents, 800000);
        assert.equal(
            statusAposQuitacao({
                tipoExtrato: "debito",
                valorLancamentoCents: toCents(10000),
                valorQuitadoAcumuladoCents: d.itens[0]!.valorQuitadoNesteVinculoCents,
            }),
            "pago_parcial",
        );
    });

    it("T1b: mesma falta sem flag -> sem residual, ainda pago_parcial", () => {
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(10000), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: false,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.residual, null);
        assert.equal(d.itens[0]!.valorQuitadoNesteVinculoCents, 800000);
    });

    it("T2: extrato 8000 × lançamento 6838 + juros explícitos 1162 -> excedente resolvido", () => {
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {
                    lancamento_id: 1,
                    valorCents: toCents(6838),
                    descontoCents: 0,
                    jurosMultaCents: toCents(1162),
                },
            ],
            gerarParcial: true,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.deltaCents, 116200);
        assert.equal(d.ramo, "excedente_juros");
        assert.equal(d.residual, null);
        assert.equal(d.itens[0]!.jurosMultaCents, 116200);
        assert.equal(centsToDecimalString(d.itens[0]!.jurosMultaCents), "1162.00");
        assert.equal(d.itens[0]!.valorQuitadoNesteVinculoCents, 800000);
        assert.equal(d.valorSaldoCents, 0);
    });

    it("T2b: extrato 8000 × lançamento 6838 sem juros -> cobertura parcial (saldo 1162)", () => {
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(6838), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: false,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.ramo, "falta");
        assert.equal(d.valorSaldoCents, 116200);
        assert.equal(d.itens[0]!.valorVinculadoCents, toCents(6838));
        assert.equal(d.itens[0]!.jurosMultaCents, 0);
        assert.equal(d.residual, null);
    });

    it("T3: Modo B - 5×1000 sobre 4000 acumula quitado e no 5º gera juros 1000", () => {
        const valorTitulo = toCents(4000);
        let acumulado = 0;
        let jurosTotal = 0;

        for (let i = 0; i < 5; i++) {
            const d = decidirVincular({
                extratoCents: toCents(1000),
                lancamentos: [
                    {
                        lancamento_id: 99,
                        valorCents: valorTitulo,
                        descontoCents: 0,
                        jurosMultaCents: 0,
                        quitadoAnteriorCents: acumulado,
                    },
                ],
                gerarParcial: false,
            });
            assert.equal(d.ok, true);
            if (!d.ok) return;
            assert.equal(d.residual, null);

            if (i < 3) {
                assert.equal(d.ramo, "falta");
            } else if (i === 3) {
                assert.equal(d.ramo, "exato");
            } else {
                assert.equal(d.ramo, "excedente_juros");
                assert.equal(d.itens[0]!.jurosMultaCents, 100000);
                jurosTotal += d.itens[0]!.jurosMultaCents;
            }

            acumulado += d.itens[0]!.valorQuitadoNesteVinculoCents;
        }

        assert.equal(acumulado, 500000);
        assert.equal(jurosTotal, 100000);
        assert.equal(
            statusAposQuitacao({
                tipoExtrato: "credito",
                valorLancamentoCents: valorTitulo,
                valorQuitadoAcumuladoCents: acumulado,
            }),
            "recebido",
        );
    });

    it("T3b: Modo B passo 2+ com flag NÃO cria residual (quitacaoMultiLinha)", () => {
        const d = decidirVincular({
            extratoCents: toCents(1000),
            lancamentos: [
                {
                    lancamento_id: 99,
                    valorCents: toCents(4000),
                    descontoCents: 0,
                    jurosMultaCents: 0,
                    quitadoAnteriorCents: toCents(1000),
                },
            ],
            gerarParcial: true,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.quitacaoMultiLinha, true);
        assert.equal(d.ramo, "falta");
        assert.equal(d.residual, null);
        assert.equal(d.itens[0]!.valorQuitadoNesteVinculoCents, 100000);
    });

    it("T3c: Modo B 5º vínculo -> Δ=+1000 juros, nunca residual mesmo com flag", () => {
        const d = decidirVincular({
            extratoCents: toCents(1000),
            lancamentos: [
                {
                    lancamento_id: 99,
                    valorCents: toCents(4000),
                    descontoCents: 0,
                    jurosMultaCents: 0,
                    quitadoAnteriorCents: toCents(4000),
                },
            ],
            gerarParcial: true,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.ramo, "excedente_juros");
        assert.equal(d.deltaCents, 100000);
        assert.equal(d.itens[0]!.jurosMultaCents, 100000);
        assert.equal(d.residual, null);
    });

    it("T4: residual usa origem e valor da falta (vencimento é responsabilidade do endpoint)", () => {
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 7, valorCents: toCents(10000), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: true,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.residual!.origemLancamentoId, 7);
        assert.equal(d.residual!.valorCents, 200000);
    });

    it("T5: gap 1447.95 com 3 lançamentos = 6552.05 - cobertura parcial (Modo A incremental)", () => {
        // Sem juros explícitos: vincula os títulos e deixa saldo aberto na linha.
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(2000), descontoCents: 0, jurosMultaCents: 0},
                {lancamento_id: 2, valorCents: toCents(3000), descontoCents: 0, jurosMultaCents: 0},
                {lancamento_id: 3, valorCents: toCents("1552.05"), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: false,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.ramo, "falta");
        assert.equal(d.valorSaldoCents, 144795);
        assert.equal(d.residual, null);
        assert.equal(
            d.itens.reduce((s, i) => s + i.valorVinculadoCents, 0),
            toCents("6552.05"),
        );
    });

    it("T5b: com juros alocados cobrindo o gap -> exato/excedente resolvido, sem residual", () => {
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(2000), descontoCents: 0, jurosMultaCents: 0},
                {lancamento_id: 2, valorCents: toCents(3000), descontoCents: 0, jurosMultaCents: 0},
                {
                    lancamento_id: 3,
                    valorCents: toCents("1552.05"),
                    descontoCents: 0,
                    jurosMultaCents: toCents("1447.95"),
                },
            ],
            gerarParcial: false,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.ramo, "excedente_juros");
        assert.equal(d.residual, null);
        assert.equal(d.deltaCents, 144795);
    });

    it("T6: 2 lançamentos + residual exige residuo_lancamento_id", () => {
        const semId = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(5000), descontoCents: 0, jurosMultaCents: 0},
                {lancamento_id: 2, valorCents: toCents(5000), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: true,
        });
        assert.equal(semId.ok, false);
        if (semId.ok) return;
        assert.equal(semId.status, 400);
        assert.match(semId.message, /residuo_lancamento_id/);

        const comId = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(5000), descontoCents: 0, jurosMultaCents: 0},
                {lancamento_id: 2, valorCents: toCents(5000), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: true,
            residuoLancamentoId: 2,
        });
        assert.equal(comId.ok, true);
        if (!comId.ok) return;
        assert.equal(comId.residual!.origemLancamentoId, 2);
        assert.equal(comId.residual!.valorCents, 200000);
        // sem rateio: só a origem absorve a falta
        assert.equal(comId.itens.find((i) => i.lancamento_id === 1)!.valorQuitadoNesteVinculoCents, 500000);
        assert.equal(comId.itens.find((i) => i.lancamento_id === 2)!.valorQuitadoNesteVinculoCents, 300000);
    });

    it("T7: ultrapasse (lançamentos > extrato) NÃO é erro - é falta/residual", () => {
        const d = decidirVincular({
            extratoCents: toCents(8000),
            lancamentos: [
                {lancamento_id: 1, valorCents: toCents(10000), descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: false,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.ramo, "falta");
    });
});

describe("statusAposQuitacao - desconto (DEF-08)", () => {
    it("título 1000 com desconto 100 quitado a 900 -> pago (não pago_parcial eterno)", () => {
        assert.equal(
            statusAposQuitacao({
                tipoExtrato: "debito",
                valorLancamentoCents: toCents(1000),
                valorQuitadoAcumuladoCents: toCents(900),
                descontoAcumuladoCents: toCents(100),
            }),
            "pago",
        );
    });

    it("título 1000 com desconto 100 quitado a 800 -> pago_parcial", () => {
        assert.equal(
            statusAposQuitacao({
                tipoExtrato: "debito",
                valorLancamentoCents: toCents(1000),
                valorQuitadoAcumuladoCents: toCents(800),
                descontoAcumuladoCents: toCents(100),
            }),
            "pago_parcial",
        );
    });
});

describe("ciclo de vida - status adiado até finalizar", () => {
    it("statusAbertoPorVencimento: vencido -> atrasado", () => {
        assert.equal(statusAbertoPorVencimento("2020-01-01", "2026-07-22"), "atrasado");
        assert.equal(statusAbertoPorVencimento("2099-01-01", "2026-07-22"), "pendente");
    });

    it("desfazer no ciclo adiado não promove pago_parcial", () => {
        assert.equal(
            statusAposDesfazerVinculo({
                statusAtual: "pendente",
                tipoExtrato: "debito",
                valorLancamentoCents: toCents(1000),
                valorQuitadoAcumuladoCents: toCents(400),
                hojeIso: "2026-07-22",
                vencimento: "2099-01-01",
            }),
            "pendente",
        );
    });

    it("desfazer com status já quitado reavalia pago_parcial/pago", () => {
        assert.equal(
            statusAposDesfazerVinculo({
                statusAtual: "pago_parcial",
                tipoExtrato: "debito",
                valorLancamentoCents: toCents(1000),
                valorQuitadoAcumuladoCents: toCents(400),
                hojeIso: "2026-07-22",
                vencimento: "2099-01-01",
            }),
            "pago_parcial",
        );
        assert.equal(
            statusAposDesfazerVinculo({
                statusAtual: "pago",
                tipoExtrato: "debito",
                valorLancamentoCents: toCents(1000),
                valorQuitadoAcumuladoCents: 0,
                hojeIso: "2026-07-22",
                vencimento: "2099-01-01",
            }),
            "pendente",
        );
    });
});
