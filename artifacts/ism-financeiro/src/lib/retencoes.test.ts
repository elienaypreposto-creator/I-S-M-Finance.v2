import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {somaRetencoesCents, valorAPagarTitulo, valorLiquidoTitulo} from "./retencoes.ts";
import {
    getLancamentoModalDefaultValues,
    lancamentoModalFormSchema,
    mapModalFormToApiBody,
} from "../validations/lancamentos.schema.ts";

function form(retencoes: Record<string, string>, valorBr = "1.000,00") {
    const base = getLancamentoModalDefaultValues(null);
    return {
        ...base,
        vencimento: "2026-10-01",
        valorBr,
        retencoesBr: {...base.retencoesBr, ...retencoes},
    };
}

describe("retenções na fonte (front)", () => {
    it("soma em centavos e líquido do título", () => {
        assert.equal(somaRetencoesCents({retencao_ir: "15.00", retencao_iss: 85}), 10000);
        assert.equal(valorLiquidoTitulo({valor: "1000.00", valor_liquido: "900.00"}), 900);
        assert.equal(valorLiquidoTitulo({valor: 250}), 250);
    });

    it("valor a pagar na conciliação = líquido − desconto + juros do título", () => {
        assert.equal(valorAPagarTitulo({valor: "1000.00", valor_liquido: "900.00", desconto: "100.00", juros: "30.00"}), 830);
        assert.equal(valorAPagarTitulo({valor: 500, desconto: "50.00"}), 450);
        assert.equal(valorAPagarTitulo({valor: 500}), 500);
        // A API manda pronto: vale o dela.
        assert.equal(valorAPagarTitulo({valor: 500, desconto: "50.00", valor_a_pagar: "450.00"}), 450);
    });

    it("formulário aceita retenções e envia decimais da API", () => {
        const values = form({retencao_ir: "15,00", retencao_iss: "85,00"});
        assert.equal(lancamentoModalFormSchema.safeParse(values).success, true);
        const body = mapModalFormToApiBody(values);
        assert.equal(body.retencao_ir, "15.00");
        assert.equal(body.retencao_iss, "85.00");
        assert.equal(body.retencao_pis, "0.00");
    });

    it("formulário rejeita soma das retenções acima do valor", () => {
        const r = lancamentoModalFormSchema.safeParse(form({retencao_ir: "600,00", retencao_cofins: "400,01"}));
        assert.equal(r.success, false);
        if (r.success) return;
        assert.ok(r.error.issues.some((i) => i.path[0] === "retencoesBr" && i.message.includes("soma das retenções")));
    });

    it("edição abre com as retenções do título (zeros ficam vazios)", () => {
        const v = getLancamentoModalDefaultValues({
            id: 1,
            tipo: "CR",
            vencimento: "2026-10-01",
            competencia: null,
            conta_id: null,
            parceiro_id: null,
            descricao: "NF 1",
            valor: 1000,
            status: "pendente",
            plano_conta_id: null,
            retencao_ir: 15,
            retencao_pis: 0,
        });
        assert.equal(v.retencoesBr.retencao_ir, "15,00");
        assert.equal(v.retencoesBr.retencao_pis, "");
    });
});
