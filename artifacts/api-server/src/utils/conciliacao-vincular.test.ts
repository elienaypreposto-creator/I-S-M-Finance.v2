import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {centsToDecimalString, toCents} from "./money.js";
import {
    cobertoPorVinculos,
    decidirVincular,
    descreverResiduoParcial,
    mensagemJaQuitado,
    mensagemJaVinculadoEmOutroExtrato,
    principalVinculadoCents,
    quitacaoNoFinalizar,
    quitadoPorInteiro,
    mensagemQuitadoEmOutraConta,
    quitadosEmOutraConta,
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

    it("T3b: Modo B passo 2+ com flag gera residual do saldo já decrescido", () => {
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
        assert.ok(d.residual);
        assert.equal(d.residual!.valorCents, toCents(2000));
        assert.equal(d.itens[0]!.valorQuitadoNesteVinculoCents, 100000);
    });

    it("T3b2: Modo B 12000+15000 sobre 200000 gera dois residuais decrescentes (188000 e 173000)", () => {
        const titulo = toCents(200000);
        const d1 = decidirVincular({
            extratoCents: toCents(12000),
            lancamentos: [{lancamento_id: 1, valorCents: titulo, descontoCents: 0, jurosMultaCents: 0}],
            gerarParcial: true,
        });
        assert.equal(d1.ok, true);
        if (!d1.ok) return;
        assert.equal(d1.residual!.valorCents, toCents(188000));

        const d2 = decidirVincular({
            extratoCents: toCents(15000),
            lancamentos: [{
                lancamento_id: 1,
                valorCents: titulo,
                descontoCents: 0,
                jurosMultaCents: 0,
                quitadoAnteriorCents: toCents(12000),
            }],
            gerarParcial: true,
        });
        assert.equal(d2.ok, true);
        if (!d2.ok) return;
        assert.equal(d2.residual!.valorCents, toCents(173000));
        assert.notEqual(d1.residual!.valorCents, d2.residual!.valorCents);
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

describe("quitacaoNoFinalizar — razão de quitação, sem somar duas vezes", () => {
    const z = {jurosTituloCents: 0, descontoTituloCents: 0, sumJurosCents: 0, sumDescontoCents: 0};

    it("vínculo salvo já quitou o título: finalizar não muda nada", () => {
        const x = toCents(8000);
        const r = quitacaoNoFinalizar({...z, valorQuitadoTituloCents: x, sumVinculadoCents: x});
        assert.equal(r.quitadoCents, x);
    });

    it("legado: vínculo de regra/[+] que não quitou o título → grava a soma dos vínculos", () => {
        // Extrato #15 do clone: título nasceu pendente, vínculo de 40,00 na linha.
        const x = toCents(40);
        const r = quitacaoNoFinalizar({...z, valorQuitadoTituloCents: 0, sumVinculadoCents: x});
        assert.equal(r.quitadoCents, x);
    });

    it("Modo B com dois extratos abertos: finalizar o 1º mantém X1+X2 já quitados", () => {
        // Antes: o finalizar gravava só X1 e o desfazer posterior de X2 zerava o título.
        const x1 = toCents(1000);
        const x2 = toCents(1000);
        const r = quitacaoNoFinalizar({...z, valorQuitadoTituloCents: x1 + x2, sumVinculadoCents: x1 + x2});
        assert.equal(r.quitadoCents, x1 + x2);
    });

    it("título já finalizado em outro extrato + vínculo legado deste → soma dos vínculos", () => {
        const y = toCents(4000);
        const x = toCents(1000);
        const r = quitacaoNoFinalizar({...z, valorQuitadoTituloCents: y, sumVinculadoCents: y + x});
        assert.equal(r.quitadoCents, y + x);
    });

    it("juros e desconto já gravados não dobram", () => {
        const r = quitacaoNoFinalizar({
            valorQuitadoTituloCents: toCents(8000),
            jurosTituloCents: toCents(1162),
            descontoTituloCents: toCents(10),
            sumVinculadoCents: toCents(8000),
            sumJurosCents: toCents(1162),
            sumDescontoCents: toCents(10),
        });
        assert.deepEqual(r, {quitadoCents: toCents(8000), jurosCents: toCents(1162), descontoCents: toCents(10)});
    });
});

describe("quitadosEmOutraConta: um título movimenta uma conta só", () => {
    it("título já pago em outra conta é barrado", () => {
        // Caso do clone: "DEBITO PIX (pagamento parcial)" com 27.000 quitados no
        // Bradesco (9) e vínculo novo num extrato do BRB (8).
        const ids = quitadosEmOutraConta([{id: 10, conta_id: 9, quitadoCents: 2_700_000}], 8);
        assert.deepEqual(ids, [10]);
        assert.match(mensagemQuitadoEmOutraConta(ids), /^O lançamento #10 já tem pagamento registrado em outra conta bancária/);
    });

    it("sem quitação, a conta prevista no cadastro não impede (a conciliação grava a conta do extrato)", () => {
        assert.deepEqual(quitadosEmOutraConta([{id: 1, conta_id: 9, quitadoCents: 0}], 8), []);
    });

    it("quitação na mesma conta segue livre (Modo B: restante em outra linha do mesmo banco)", () => {
        assert.deepEqual(quitadosEmOutraConta([{id: 1, conta_id: 8, quitadoCents: 30_000}], 8), []);
    });

    it("título sem conta não é barrado", () => {
        assert.deepEqual(quitadosEmOutraConta([{id: 1, conta_id: null, quitadoCents: 30_000}], 8), []);
    });

    it("lista só os barrados, no plural", () => {
        const ids = quitadosEmOutraConta(
            [
                {id: 1, conta_id: 9, quitadoCents: 100},
                {id: 2, conta_id: 8, quitadoCents: 100},
                {id: 3, conta_id: 7, quitadoCents: 100},
            ],
            8,
        );
        assert.deepEqual(ids, [1, 3]);
        assert.match(mensagemQuitadoEmOutraConta(ids), /^Os lançamentos #1, #3 já têm pagamento/);
    });
});

describe("título já vinculado em outro extrato (não pagar duas vezes)", () => {
    it("principal vinculado desconta juros/multa e soma desconto", () => {
        assert.equal(
            principalVinculadoCents([
                {valorVinculadoCents: 10_500, jurosCents: 500, descontoCents: 0},
                {valorVinculadoCents: 4_000, jurosCents: 0, descontoCents: 1_000},
            ]),
            15_000,
        );
        assert.equal(principalVinculadoCents([]), 0);
    });

    it("coberto só quando os vínculos alcançam o líquido do título", () => {
        assert.equal(cobertoPorVinculos(15_000, 15_000), true);
        assert.equal(cobertoPorVinculos(15_000, 14_999), false);
        assert.equal(cobertoPorVinculos(0, 0), false);
    });

    it("mensagem aponta o extrato e manda desfazer o vínculo anterior", () => {
        assert.match(mensagemJaVinculadoEmOutroExtrato(7, [15]), /#7 já está vinculado ao extrato #15 pelo valor todo/);
        assert.match(mensagemJaVinculadoEmOutroExtrato(7, [15, 16]), /aos extratos #15, #16/);
        assert.match(mensagemJaVinculadoEmOutroExtrato(7, []), /a outra linha de extrato/);
        assert.match(mensagemJaVinculadoEmOutroExtrato(7, [15]), /desfaça o vínculo anterior/);
    });
});

describe("título já quitado pelo valor todo (inclusive rascunho da tela)", () => {
    it("quitado alcança o líquido menos o desconto concedido", () => {
        assert.equal(quitadoPorInteiro({valorLiquidoCents: 40_000, quitadoCents: 40_000}), true);
        assert.equal(quitadoPorInteiro({valorLiquidoCents: 40_000, quitadoCents: 39_999}), false);
        assert.equal(quitadoPorInteiro({valorLiquidoCents: 10_000, descontoCents: 1_000, quitadoCents: 9_000}), true);
        assert.equal(quitadoPorInteiro({valorLiquidoCents: 0, quitadoCents: 0}), false);
    });

    it("mensagem distingue vínculo em rascunho de quitação gravada", () => {
        assert.match(mensagemJaQuitado(9, true), /#9 já está vinculado pelo valor todo em outra linha deste extrato/);
        assert.match(mensagemJaQuitado(9, false), /#9 já está quitado pelo valor todo/);
    });
});

describe("descrição do residual", () => {
    const base = {valorCents: 7_000_000, vencimento: "2026-11-05", parceiroNome: "Acme", parcelaAtual: null, totalParcelas: null};

    it("aponta o título de origem; CP é Pagamento", () => {
        assert.equal(
            descreverResiduoParcial({...base, origemId: 42, tipo: "CP"}),
            "Residual do lançamento #42 - Pagamento DO(A) ACME NO VALOR R$ 70.000,00 (PARCELA UNICA NO DIA 5)",
        );
    });

    it("CR é Recebimento, com a parcela", () => {
        assert.equal(
            descreverResiduoParcial({...base, origemId: 7, tipo: "CR", parcelaAtual: 2, totalParcelas: 3, valorCents: 12_345}),
            "Residual do lançamento #7 - Recebimento DO(A) ACME NO VALOR R$ 123,45 (PARCELA 2/3 NO DIA 5)",
        );
    });
});
