import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    AGENCIA_REGEX,
    chaveContaBancaria,
    encontrarContaDuplicada,
    idsContasDuplicadas,
    formatarSaldoComSinal,
    inverterSinalSaldo,
    mascararAgenciaConta,
    saldoApiParaBr,
    saldoBrParaApi,
} from "./conta-bancaria.ts";

describe("mascararAgenciaConta", () => {
    it("4 dígitos e dígito opcional depois do hífen", () => {
        assert.equal(mascararAgenciaConta("12"), "12");
        assert.equal(mascararAgenciaConta("1234"), "1234");
        assert.equal(mascararAgenciaConta("12345"), "1234-5");
        assert.equal(mascararAgenciaConta("1234-5678"), "1234-5");
        assert.equal(mascararAgenciaConta("ab12c"), "12");
        assert.ok(AGENCIA_REGEX.test("1234-5"));
        assert.ok(AGENCIA_REGEX.test("0001"));
        assert.ok(!AGENCIA_REGEX.test("12345"));
        assert.ok(!AGENCIA_REGEX.test("1234-56"));
    });
});

describe("saldo inicial com sinal", () => {
    it("mantém o sinal de menos ao digitar", () => {
        assert.equal(formatarSaldoComSinal("-"), "-");
        assert.equal(formatarSaldoComSinal("-1"), "-0,01");
        assert.equal(formatarSaldoComSinal("-123456"), "-1.234,56");
        assert.equal(formatarSaldoComSinal("1.234,567"), "12.345,67");
        assert.equal(formatarSaldoComSinal(""), "");
    });

    it("inverte o sinal", () => {
        assert.equal(inverterSinalSaldo("1.234,56"), "-1.234,56");
        assert.equal(inverterSinalSaldo("-1.234,56"), "1.234,56");
        assert.equal(inverterSinalSaldo(""), "-");
    });

    it("converte para a API e de volta sem perder o sinal", () => {
        assert.equal(saldoBrParaApi("-1.234,56"), "-1234.56");
        assert.equal(saldoBrParaApi("1.234,56"), "1234.56");
        assert.equal(saldoBrParaApi("-0,00"), "0.00");
        assert.equal(saldoBrParaApi("-"), "");
        assert.equal(saldoApiParaBr("-1234.5"), "-1.234,50");
        assert.equal(saldoApiParaBr("1234.56"), "1.234,56");
        assert.equal(saldoApiParaBr(-150), "-150,00");
        assert.equal(saldoApiParaBr("0.00"), "0,00");
    });
});

describe("conta duplicada", () => {
    const existentes = [
        {id: 1, nome: "Itaú PJ", banco: "Itaú Unibanco", agencia: "1234", conta: "98765-4"},
        {id: 2, nome: "Caixinha", banco: null, agencia: null, conta: null},
    ];

    it("acha mesmo banco + agência + conta, ignorando formato e o dígito da agência", () => {
        assert.equal(encontrarContaDuplicada({banco: "itaú unibanco", agencia: "1234-0", conta: "0987654"}, existentes)?.id, 1);
        assert.equal(encontrarContaDuplicada({banco: "Itaú Unibanco", agencia: "01234", conta: "98765-4"}, existentes)?.id, 1);
    });

    it("não acusa conta diferente, a própria conta ou conta sem banco", () => {
        assert.equal(encontrarContaDuplicada({banco: "Itaú Unibanco", agencia: "1234", conta: "98765-5"}, existentes), undefined);
        assert.equal(encontrarContaDuplicada({banco: "Bradesco", agencia: "1234", conta: "98765-4"}, existentes), undefined);
        assert.equal(encontrarContaDuplicada({banco: "Itaú Unibanco", agencia: "1234", conta: "98765-4"}, existentes, 1), undefined);
        assert.equal(encontrarContaDuplicada({banco: null, agencia: null, conta: null}, existentes), undefined);
        assert.equal(chaveContaBancaria({banco: "Itaú", agencia: "", conta: "1"}), null);
    });
});

describe("idsContasDuplicadas", () => {
    it("marca todas as contas que repetem banco + agência + conta", () => {
        const contas = [
            {id: 1, banco: "Itaú Unibanco", agencia: "1234", conta: "98765-4"},
            {id: 2, banco: "itaú unibanco", agencia: "01234-0", conta: "0987654"},
            {id: 3, banco: "Bradesco", agencia: "1234", conta: "98765-4"},
            {id: 4, banco: null, agencia: null, conta: null},
            {id: 5, banco: null, agencia: null, conta: null},
        ];
        assert.deepEqual([...idsContasDuplicadas(contas)].sort(), [1, 2]);
        assert.equal(idsContasDuplicadas([]).size, 0);
    });
});
