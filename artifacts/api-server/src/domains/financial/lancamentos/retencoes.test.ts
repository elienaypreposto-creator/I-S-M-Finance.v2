/**
 * Retenções na fonte: validação do body de lançamentos e quitação pelo líquido.
 * Run: npx tsx --test src/domains/financial/lancamentos/retencoes.test.ts
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {createLancamentoBodySchema, updateLancamentoBodySchema} from "./schemas";
import {decidirVincular, statusAposDesfazerVinculo, statusAposQuitacao} from "../../../utils/conciliacao-vincular";
import {retencoesAlteradas, somaRetencoesCents, valorLiquidoCents} from "../../../utils/retencoes";
import {toCents} from "../../../utils/money";

const base = {tipo: "CR", vencimento: "2026-10-01", valor: "1000.00"};

function mensagens(r: {success: boolean; error?: {issues: {message: string}[]}}): string[] {
    return r.success ? [] : (r.error?.issues ?? []).map((i) => i.message);
}

describe("schema de retenções (create/update de lançamento)", () => {
    it("aceita retenções válidas e normaliza para 2 casas", () => {
        const r = createLancamentoBodySchema.safeParse({...base, retencao_ir: 15, retencao_iss: "50.5", retencao_pis: ""});
        assert.equal(r.success, true);
        if (!r.success) return;
        assert.equal(r.data.retencao_ir, "15.00");
        assert.equal(r.data.retencao_iss, "50.50");
        assert.equal(r.data.retencao_pis, "0.00");
        assert.equal(r.data.retencao_cofins, undefined);
    });

    it("sem retenções continua válido (campos opcionais)", () => {
        assert.equal(createLancamentoBodySchema.safeParse(base).success, true);
    });

    it("rejeita retenção negativa", () => {
        const r = createLancamentoBodySchema.safeParse({...base, retencao_inss: -1});
        assert.equal(r.success, false);
        assert.ok(mensagens(r).some((m) => m.includes("INSS") && m.includes("negativa")));
    });

    it("rejeita retenção com 3 casas decimais", () => {
        const r = createLancamentoBodySchema.safeParse({...base, retencao_csll: "1.005"});
        assert.equal(r.success, false);
        assert.ok(mensagens(r).some((m) => m.includes("CSLL") && m.includes("2 casas")));
    });

    it("rejeita soma das retenções maior que o valor", () => {
        const r = createLancamentoBodySchema.safeParse({...base, retencao_ir: "600", retencao_cofins: "400.01"});
        assert.equal(r.success, false);
        assert.ok(mensagens(r).some((m) => m.includes("soma das retenções")));
    });

    it("aceita soma igual ao valor (líquido zero)", () => {
        const r = createLancamentoBodySchema.safeParse({...base, retencao_ir: "600", retencao_cofins: "400"});
        assert.equal(r.success, true);
    });

    it("update parcial valida cada campo (a soma é validada no service com o título mesclado)", () => {
        assert.equal(updateLancamentoBodySchema.safeParse({retencao_pis: -0.01}).success, false);
        assert.equal(updateLancamentoBodySchema.safeParse({retencao_pis: "6.50"}).success, true);
    });
});

describe("helpers de retenção", () => {
    it("soma e líquido em centavos", () => {
        const l = {valor: "1000.00", retencao_ir: "15.00", retencao_pis: "6.50", retencao_cofins: "30.00", retencao_csll: "10.00", retencao_inss: "0", retencao_iss: "38.50"};
        assert.equal(somaRetencoesCents(l), 10000);
        assert.equal(valorLiquidoCents(l), 90000);
        // Coluna gerada vinda do banco tem precedência.
        assert.equal(valorLiquidoCents({...l, valor_liquido: "900.00"}), 90000);
        assert.equal(valorLiquidoCents({valor: "250.00"}), 25000);
    });

    it("retencoesAlteradas só considera campos presentes no payload e compara em centavos", () => {
        const atual = {retencao_ir: "15.00", retencao_iss: 0};
        assert.equal(retencoesAlteradas(atual, {}), false);
        assert.equal(retencoesAlteradas(atual, {retencao_ir: "15.00", retencao_iss: "0.00"}), false);
        assert.equal(retencoesAlteradas(atual, {retencao_ir: "15.01"}), true);
    });
});

describe("quitação pelo líquido (NF 1000 com 100 retidos, extrato de 900)", () => {
    const liquido = valorLiquidoCents({valor: "1000.00", retencao_ir: "15.00", retencao_iss: "85.00"});

    it("vínculo 1:1 fecha exato, sem desconto", () => {
        const d = decidirVincular({
            extratoCents: toCents(900),
            lancamentos: [{lancamento_id: 1, valorCents: liquido, descontoCents: 0, jurosMultaCents: 0}],
            gerarParcial: false,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.ramo, "exato");
        assert.equal(d.deltaCents, 0);
        assert.equal(d.residual, null);
        assert.equal(d.itens[0]!.descontoCents, 0);
        assert.equal(d.itens[0]!.valorVinculadoCents, toCents(900));
    });

    it("status vira recebido com quitado 900 e desconto 0", () => {
        assert.equal(
            statusAposQuitacao({tipoExtrato: "credito", valorLancamentoCents: liquido, valorQuitadoAcumuladoCents: toCents(900)}),
            "recebido",
        );
        // Com o bruto (comportamento antigo) ficaria pago_parcial.
        assert.equal(
            statusAposQuitacao({tipoExtrato: "credito", valorLancamentoCents: toCents(1000), valorQuitadoAcumuladoCents: toCents(900)}),
            "pago_parcial",
        );
    });

    it("pagamento parcial gera residual pelo líquido restante", () => {
        const d = decidirVincular({
            extratoCents: toCents(600),
            lancamentos: [{lancamento_id: 7, valorCents: liquido, descontoCents: 0, jurosMultaCents: 0}],
            gerarParcial: true,
        });
        assert.equal(d.ok, true);
        if (!d.ok) return;
        assert.equal(d.residual?.valorCents, toCents(300));
    });

    it("desfazer parcial volta a pago_parcial pelo líquido", () => {
        assert.equal(
            statusAposDesfazerVinculo({
                statusAtual: "recebido",
                tipoExtrato: "credito",
                valorLancamentoCents: liquido,
                valorQuitadoAcumuladoCents: toCents(450),
                vencimento: "2026-10-01",
                hojeIso: "2026-10-26",
            }),
            "pago_parcial",
        );
    });
});
