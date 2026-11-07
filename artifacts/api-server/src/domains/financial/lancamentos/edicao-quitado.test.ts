/**
 * Edição de título quitado: o que mexe no dinheiro fica travado.
 * Run: npx tsx --test src/domains/financial/lancamentos/edicao-quitado.test.ts
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {camposTravadosAlterados, mensagemCamposTravados, origemQueTrava} from "./edicao-quitado";

// Título do QA: valor 1.600, retenções 97,50, quitado 1.502,50 pela conciliação.
const atual = {
    tipo: "CP",
    valor: 1600,
    desconto: "0.00",
    juros: "0.00",
    retencao_ir: 24,
    retencao_pis: 10.4,
    retencao_cofins: 48,
    retencao_csll: 15.1,
    retencao_inss: 0,
    retencao_iss: 0,
    conta_id: 7,
};

describe("origemQueTrava", () => {
    it("vínculo de conciliação e transferência travam sempre", () => {
        assert.equal(origemQueTrava({temVinculoConciliacao: true, ehTransferencia: false, quitadoCents: 150250, reabrindo: false}), "conciliacao");
        assert.equal(origemQueTrava({temVinculoConciliacao: false, ehTransferencia: true, quitadoCents: 10000, reabrindo: false}), "transferencia");
    });

    it("quitação registrada sem vínculo trava, salvo se o mesmo PUT reabre o título", () => {
        assert.equal(origemQueTrava({temVinculoConciliacao: false, ehTransferencia: false, quitadoCents: 30000, reabrindo: false}), "registro");
        assert.equal(origemQueTrava({temVinculoConciliacao: false, ehTransferencia: false, quitadoCents: 30000, reabrindo: true}), null);
    });

    it("título aberto (ou 'pago' sem pagamento registrado) fica livre", () => {
        assert.equal(origemQueTrava({temVinculoConciliacao: false, ehTransferencia: false, quitadoCents: 0, reabrindo: false}), null);
    });
});

describe("camposTravadosAlterados", () => {
    it("formulário reenviando o título inteiro sem mudança não acusa nada", () => {
        const body = {
            tipo: "CP",
            valor: "1600.00",
            desconto: "0.00",
            juros: "0",
            retencao_ir: "24.00",
            retencao_pis: "10.40",
            retencao_cofins: "48.00",
            retencao_csll: "15.10",
            retencao_inss: "0.00",
            retencao_iss: "0.00",
            conta_id: 7,
        };
        assert.deepEqual(camposTravadosAlterados(atual, body), []);
    });

    it("cenário do QA: valor 1.600 -> 1.700 é detectado", () => {
        assert.deepEqual(camposTravadosAlterados(atual, {valor: "1700.00"}), ["valor"]);
    });

    it("tipo, conta, desconto, juros e retenções", () => {
        assert.deepEqual(camposTravadosAlterados(atual, {tipo: "CR"}), ["tipo"]);
        assert.deepEqual(camposTravadosAlterados(atual, {conta_id: 8}), ["conta_id"]);
        assert.deepEqual(camposTravadosAlterados(atual, {conta_id: null}), ["conta_id"]);
        assert.deepEqual(camposTravadosAlterados(atual, {desconto: "10.00", juros: "1.00"}), ["desconto", "juros"]);
        assert.deepEqual(camposTravadosAlterados(atual, {retencao_iss: "5.00"}), ["retencao_iss"]);
    });

    it("campos descritivos não entram na trava", () => {
        const descritivos = {descricao: "x", plano_conta_id: 3, departamento_id: 2, observacao: "y", vencimento: "2026-12-01", parceiro_id: 9};
        assert.deepEqual(camposTravadosAlterados(atual, descritivos as never), []);
    });
});

describe("mensagemCamposTravados", () => {
    it("conciliação orienta a desfazer o vínculo na Conciliação", () => {
        const msg = mensagemCamposTravados("conciliacao", ["valor"]);
        assert.match(msg, /desfaça o vínculo na Conciliação/);
        assert.match(msg, /alterado: valor\)/);
    });

    it("lista os campos alterados em português", () => {
        assert.match(mensagemCamposTravados("transferencia", ["tipo", "conta_id", "retencao_ir"]), /alterado: tipo, conta bancária e retenção de IR\)/);
        assert.match(mensagemCamposTravados("transferencia", ["valor"]), /transferência/);
        assert.match(mensagemCamposTravados("registro", ["juros"]), /Volte o status para Pendente/);
    });
});
