/**
 * Residual do pagamento parcial carrega o em aberto do título:
 * (líquido − desconto + juros) − quitado, nas duas direções (CP e CR).
 *
 * Antes a base do vínculo era só o líquido: o desconto (e os juros) gravados
 * no título ficavam de fora e o residual nascia com o desconto embutido (ex.
 * TST: residual #20 do lançamento #13).
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {toCents} from "./money.js";
import {decidirVincular, statusAposQuitacao, valorAPagarTituloCents} from "./conciliacao-vincular.js";
import {emAbertoLinhaCents} from "../domains/financial/lancamentos/em-aberto.js";

type Titulo = {
    tipo: "CP" | "CR";
    valor: number;
    retencoes?: number;
    desconto?: number;
    juros?: number;
    quitado?: number;
};

/** Simula persistirVinculo de 1 título: decisão + o que o título grava. */
function pagarParcial(t: Titulo, extrato: number, payload: {desconto?: number; juros?: number} = {}) {
    const liquidoCents = toCents(t.valor) - toCents(t.retencoes ?? 0);
    const d = decidirVincular({
        extratoCents: toCents(extrato),
        lancamentos: [
            {
                lancamento_id: 1,
                valorCents: valorAPagarTituloCents({
                    valorLiquidoCents: liquidoCents,
                    descontoCents: toCents(t.desconto ?? 0),
                    jurosCents: toCents(t.juros ?? 0),
                }),
                descontoCents: toCents(payload.desconto ?? 0),
                jurosMultaCents: toCents(payload.juros ?? 0),
                quitadoAnteriorCents: toCents(t.quitado ?? 0),
            },
        ],
        gerarParcial: true,
    });
    assert.equal(d.ok, true);
    if (!d.ok) throw new Error("decisão recusada");
    const item = d.itens[0]!;
    const quitadoCents = toCents(t.quitado ?? 0) + item.valorVinculadoCents;
    const descontoCents = toCents(t.desconto ?? 0) + item.descontoCents;
    const jurosCents = toCents(t.juros ?? 0) + item.jurosMultaCents;
    const status = statusAposQuitacao({
        tipoExtrato: t.tipo === "CR" ? "credito" : "debito",
        valorLancamentoCents: liquidoCents,
        valorQuitadoAcumuladoCents: quitadoCents,
        descontoAcumuladoCents: descontoCents,
    });
    // Em aberto do título no critério de Lançamentos/Painel (em-aberto.ts),
    // como se não houvesse residual: é o que o residual tem de carregar.
    const emAbertoSemResidual = emAbertoLinhaCents({
        status,
        valor: t.valor,
        valor_liquido: liquidoCents / 100,
        desconto: descontoCents / 100,
        juros: jurosCents / 100,
        valor_quitado: quitadoCents / 100,
        tem_residual_ativo: false,
    });
    const emAbertoComResidual = emAbertoLinhaCents({
        status,
        valor: t.valor,
        valor_liquido: liquidoCents / 100,
        desconto: descontoCents / 100,
        juros: jurosCents / 100,
        valor_quitado: quitadoCents / 100,
        tem_residual_ativo: true,
    });
    return {d, status, residualCents: d.residual?.valorCents ?? null, emAbertoSemResidual, emAbertoComResidual};
}

describe("valor a pagar do título (base do vínculo)", () => {
    it("líquido − desconto + juros", () => {
        assert.equal(valorAPagarTituloCents({valorLiquidoCents: 100000, descontoCents: 10000, jurosCents: 0}), 90000);
        assert.equal(valorAPagarTituloCents({valorLiquidoCents: 100000, descontoCents: 10000, jurosCents: 3000}), 93000);
        assert.equal(valorAPagarTituloCents({valorLiquidoCents: 100000, descontoCents: 0, jurosCents: 0}), 100000);
    });
});

describe("residual desconta o desconto do título", () => {
    for (const tipo of ["CP", "CR"] as const) {
        it(`${tipo} 1000 com desconto 100, pago 400 → residual 500 (não 600), origem pago_parcial`, () => {
            const r = pagarParcial({tipo, valor: 1000, desconto: 100}, 400);
            assert.equal(r.d.ok && r.d.ramo, "falta");
            assert.equal(r.residualCents, toCents(500));
            assert.equal(r.status, "pago_parcial");
            assert.equal(r.residualCents, r.emAbertoSemResidual);
            // Com o residual ativo a origem não conta o restante: o total é só o residual.
            assert.equal(r.emAbertoComResidual, 0);
        });
    }

    it("pagar o líquido menos o desconto fecha o título: sem residual fantasma", () => {
        const r = pagarParcial({tipo: "CP", valor: 1000, desconto: 100}, 900);
        assert.equal(r.d.ok && r.d.ramo, "exato");
        assert.equal(r.residualCents, null);
        assert.equal(r.status, "pago");
    });

    it("com retenção: base é o líquido (bruto − retenções) − desconto", () => {
        const r = pagarParcial({tipo: "CR", valor: 1000, retencoes: 100, desconto: 50}, 300);
        assert.equal(r.residualCents, toCents(550));
        assert.equal(r.status, "pago_parcial");
        assert.equal(r.residualCents, r.emAbertoSemResidual);
    });

    it("desconto deste vínculo e o do título somam uma vez só", () => {
        const r = pagarParcial({tipo: "CP", valor: 1000, desconto: 100}, 400, {desconto: 50});
        assert.equal(r.residualCents, toCents(450));
        assert.equal(r.residualCents, r.emAbertoSemResidual);
    });

    it("Modo B: título já parcial (desconto gravado no 1º vínculo) não volta a cobrar o desconto", () => {
        // 1º vínculo: 400 com desconto 100 → título fica com desconto 100, quitado 400.
        const r = pagarParcial({tipo: "CP", valor: 1000, desconto: 100, quitado: 400}, 300);
        assert.equal(r.residualCents, toCents(200));
        assert.equal(r.residualCents, r.emAbertoSemResidual);
        const fecha = pagarParcial({tipo: "CP", valor: 1000, desconto: 100, quitado: 400}, 500);
        assert.equal(fecha.d.ok && fecha.d.ramo, "exato");
        assert.equal(fecha.status, "pago");
    });
});

describe("residual soma os juros do título", () => {
    for (const tipo of ["CP", "CR"] as const) {
        it(`${tipo} 1000 com juros 30 cadastrados, pago 400 → residual 630`, () => {
            const r = pagarParcial({tipo, valor: 1000, juros: 30}, 400);
            assert.equal(r.residualCents, toCents(630));
            assert.equal(r.status, "pago_parcial");
            assert.equal(r.residualCents, r.emAbertoSemResidual);
        });
    }

    it("desconto e juros juntos: 1000 − 100 + 30, pago 400 → residual 530", () => {
        const r = pagarParcial({tipo: "CP", valor: 1000, desconto: 100, juros: 30}, 400);
        assert.equal(r.residualCents, toCents(530));
        assert.equal(r.residualCents, r.emAbertoSemResidual);
    });

    it("juros cadastrados pagos junto fecham o título (antes sobrava saldo na linha)", () => {
        const r = pagarParcial({tipo: "CR", valor: 1000, juros: 30}, 1030);
        assert.equal(r.d.ok && r.d.ramo, "exato");
        assert.equal(r.d.ok && r.d.valorSaldoCents, 0);
        assert.equal(r.status, "recebido");
    });

    it("juros/multa informados num pagamento parcial entram no residual", () => {
        // Pagou 400, dos quais 10 de multa: o título passa a dever 1010 − 400.
        const r = pagarParcial({tipo: "CP", valor: 1000}, 400, {juros: 10});
        assert.equal(r.residualCents, toCents(610));
        assert.equal(r.residualCents, r.emAbertoSemResidual);
    });
});

describe("Modo A (2+ títulos): residual também usa a base com desconto/juros", () => {
    it("origem com desconto no cadastro", () => {
        const d = decidirVincular({
            extratoCents: toCents(1200),
            lancamentos: [
                {
                    lancamento_id: 1,
                    valorCents: valorAPagarTituloCents({valorLiquidoCents: 100000, descontoCents: 10000, jurosCents: 0}),
                    descontoCents: 0,
                    jurosMultaCents: 0,
                },
                {lancamento_id: 2, valorCents: 50000, descontoCents: 0, jurosMultaCents: 0},
            ],
            gerarParcial: true,
            residuoLancamentoId: 1,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        // Títulos pedem 900 + 500 = 1400; extrato 1200 → falta 200 no título 1.
        assert.deepEqual(d.residual, {origemLancamentoId: 1, valorCents: 20000});
        assert.equal(d.itens.find((i) => i.lancamento_id === 1)?.valorVinculadoCents, 70000);
    });
});
