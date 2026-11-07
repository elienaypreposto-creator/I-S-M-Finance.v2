import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    ehStatusQuitacao,
    getLancamentoModalDefaultValues,
    mapModalFormToApiBody,
    type LancamentoEditItem,
} from "./lancamentos.schema.ts";

const titulo: LancamentoEditItem = {
    id: 10,
    tipo: "CP",
    vencimento: "2026-10-01",
    competencia: null,
    conta_id: 3,
    parceiro_id: null,
    descricao: "Fornecedor",
    valor: 150,
    valor_quitado: "150.00",
    data_quitacao: "2026-10-02",
    conta_nome: "Banco X",
    tem_conciliacao: true,
    status: "pago",
    plano_conta_id: null,
};

describe("status do lançamento no formulário (quitação só pela conciliação)", () => {
    it("status de quitação não é enviado no PUT (só leitura no formulário)", () => {
        for (const status of ["pago", "recebido", "pago_parcial"]) {
            const values = getLancamentoModalDefaultValues({...titulo, status});
            const body = mapModalFormToApiBody(values);
            assert.equal(body.status, undefined, status);
            // O resto do título segue no body, inclusive a conta (sem troca).
            assert.equal(body.conta_id, 3);
            assert.equal(body.descricao, "Fornecedor");
        }
    });

    it("pendente, atrasado e cancelado seguem para a API", () => {
        for (const status of ["pendente", "atrasado", "cancelado"] as const) {
            const values = {...getLancamentoModalDefaultValues({...titulo, status: "pendente"}), status};
            assert.equal(mapModalFormToApiBody(values).status, status);
        }
    });

    it("novo lançamento nasce pendente", () => {
        const values = {...getLancamentoModalDefaultValues(null), vencimento: "2026-10-01", valorBr: "10,00"};
        assert.equal(mapModalFormToApiBody(values).status, "pendente");
    });

    it("ehStatusQuitacao", () => {
        assert.equal(ehStatusQuitacao("pago"), true);
        assert.equal(ehStatusQuitacao("pago_parcial"), true);
        assert.equal(ehStatusQuitacao("recebido"), true);
        assert.equal(ehStatusQuitacao("atrasado"), false);
        assert.equal(ehStatusQuitacao(undefined), false);
    });
});
