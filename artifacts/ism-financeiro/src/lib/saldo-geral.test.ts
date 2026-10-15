import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    descricaoConta,
    formatarSaldo,
    resumirSaldoGeral,
    rotuloQuantidadeContas,
    saldoEmCentavos,
    type ContaComSaldo,
} from "./saldo-geral.ts";

function conta(id: number, nome: string, saldo: string | number, status = "ativo"): ContaComSaldo {
    return {
        id, nome, saldo_atual: saldo, status,
        banco: "Banco do Brasil", agencia: "1234", conta: "5445456-6",
        tipo: "Conta Corrente", cor: "#3BA8DC",
    };
}

describe("resumirSaldoGeral", () => {
    it("soma só as contas ativas, em centavos", () => {
        const r = resumirSaldoGeral([
            conta(1, "A", "53464.53"),
            conta(2, "B", "6416.44"),
            conta(3, "C", "2446.40"),
            conta(4, "D", "0"),
            conta(5, "E", "-22000.00"),
            conta(6, "Bloqueada", "999999.99", "bloqueado"),
        ]);
        assert.equal(r.totalCentavos, 4032737);
        assert.equal(r.contas.length, 5);
        assert.ok(!r.contas.some((c) => c.nome === "Bloqueada"));
    });

    it("não acumula erro de ponto flutuante", () => {
        const r = resumirSaldoGeral([conta(1, "A", "0.10"), conta(2, "B", "0.20")]);
        assert.equal(r.totalCentavos, 30);
    });

    it("ordena do maior saldo para o menor (empate por nome)", () => {
        const r = resumirSaldoGeral([
            conta(1, "Zeta", "10"),
            conta(2, "Negativa", "-5"),
            conta(3, "Alfa", "10"),
            conta(4, "Grande", 1000),
        ]);
        assert.deepEqual(r.contas.map((c) => c.nome), ["Grande", "Alfa", "Zeta", "Negativa"]);
    });

    it("lista vazia dá total zero", () => {
        assert.deepEqual(resumirSaldoGeral([]), {totalCentavos: 0, contas: []});
    });
});

describe("saldoEmCentavos", () => {
    it("aceita string, número, vírgula e vazio", () => {
        assert.equal(saldoEmCentavos("1234.56"), 123456);
        assert.equal(saldoEmCentavos("12,5"), 1250);
        assert.equal(saldoEmCentavos(-0.015), -1);
        assert.equal(saldoEmCentavos(null), 0);
        assert.equal(saldoEmCentavos("abc"), 0);
    });
});

describe("formatarSaldo", () => {
    it("negativo leva o sinal − (U+2212)", () => {
        assert.match(formatarSaldo(-2200000), /^−R\$\s22\.000,00$/);
    });
    it("positivo e zero sem sinal", () => {
        assert.match(formatarSaldo(4032737), /^R\$\s40\.327,37$/);
        assert.match(formatarSaldo(0), /^R\$\s0,00$/);
    });
});

describe("descricaoConta", () => {
    it("banco, agência e conta", () => {
        assert.equal(descricaoConta(conta(1, "A", 0)), "Banco do Brasil · Ag 1234 / CC 5445456-6");
    });
    it("junta dígito separado e cai no tipo sem banco", () => {
        assert.equal(
            descricaoConta({...conta(1, "A", 0), banco: null, agencia: null, conta: "123", digito_conta: "4"}),
            "Conta Corrente · CC 123-4",
        );
        assert.equal(
            descricaoConta({...conta(1, "A", 0), banco: null, agencia: null, conta: null, tipo: "Conta Movimento"}),
            "Conta Movimento",
        );
    });
});

describe("rotuloQuantidadeContas", () => {
    it("singular e plural", () => {
        assert.equal(rotuloQuantidadeContas(1), "1 conta ativa");
        assert.equal(rotuloQuantidadeContas(5), "5 contas ativas");
    });
});
