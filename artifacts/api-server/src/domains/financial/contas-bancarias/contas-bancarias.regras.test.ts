import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {chaveContaBancaria, dataInicioNoFuturo, encontrarContaDuplicada} from "./contas-bancarias.regras";
import {createContaBancariaBodySchema, updateContaBancariaBodySchema} from "./schemas";

describe("encontrarContaDuplicada", () => {
    const existentes = [
        {id: 1, nome: "Itaú PJ", banco: "Itaú Unibanco", agencia: "1234", conta: "98765-4"},
        {id: 2, nome: "Caixinha", banco: null, agencia: null, conta: null},
    ];

    it("acha mesmo banco + agência + conta, ignorando formato e o dígito da agência", () => {
        assert.equal(encontrarContaDuplicada({banco: " itaú unibanco ", agencia: "1234-0", conta: "0987654"}, existentes)?.id, 1);
        assert.equal(encontrarContaDuplicada({banco: "Itaú Unibanco", agencia: "01234", conta: "98765-4"}, existentes)?.id, 1);
    });

    it("não acusa conta diferente, a própria conta na edição ou conta sem banco", () => {
        assert.equal(encontrarContaDuplicada({banco: "Itaú Unibanco", agencia: "1234", conta: "98765-5"}, existentes), undefined);
        assert.equal(encontrarContaDuplicada({banco: "Bradesco", agencia: "1234", conta: "98765-4"}, existentes), undefined);
        assert.equal(encontrarContaDuplicada({banco: "Itaú Unibanco", agencia: "1234", conta: "98765-4"}, existentes, 1), undefined);
        assert.equal(encontrarContaDuplicada({banco: null, agencia: null, conta: null}, existentes), undefined);
        assert.equal(chaveContaBancaria({banco: "Itaú", agencia: "1234", conta: ""}), null);
    });
});

describe("dataInicioNoFuturo", () => {
    it("hoje e passado valem; amanhã não", () => {
        assert.equal(dataInicioNoFuturo("2026-11-07", "2026-11-07"), false);
        assert.equal(dataInicioNoFuturo("2026-01-01", "2026-11-07"), false);
        assert.equal(dataInicioNoFuturo("2026-11-08", "2026-11-07"), true);
        assert.equal(dataInicioNoFuturo("2027-01-01", "2026-11-07"), true);
        assert.equal(dataInicioNoFuturo(undefined, "2026-11-07"), false);
    });
});

describe("createContaBancariaBodySchema: agência, data e saldo", () => {
    const base = {tipo: "Conta Corrente", nome: "QA-R4 Conta", data_inicio: "2026-01-01", banco: "Itaú", conta: "56789-0"};

    it("agência com até 4 dígitos e dígito opcional", () => {
        for (const agencia of ["1234", "0001", "1234-5", "1234-X", "12"]) {
            assert.equal(createContaBancariaBodySchema.safeParse({...base, agencia}).success, true, agencia);
        }
        for (const agencia of ["12345", "1234-56", "abcd", "1234567890"]) {
            assert.equal(createContaBancariaBodySchema.safeParse({...base, agencia}).success, false, agencia);
        }
    });

    it("data de início no formato AAAA-MM-DD", () => {
        assert.equal(createContaBancariaBodySchema.safeParse({...base, data_inicio: "01/01/2026"}).success, false);
        assert.equal(updateContaBancariaBodySchema.safeParse({data_inicio: "2026-13"}).success, false);
        assert.equal(updateContaBancariaBodySchema.safeParse({nome: "Só o nome"}).success, true);
    });

    it("saldo inicial pode ser negativo (cheque especial)", () => {
        const r = createContaBancariaBodySchema.safeParse({...base, saldo_inicial: "-1500.00"});
        assert.ok(r.success);
        assert.equal(r.data.saldo_inicial, "-1500.00");
    });
});
