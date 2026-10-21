import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    TIPOS_CONTA_BANCARIA,
    createContaBancariaBodySchema,
    updateContaBancariaBodySchema,
} from "./schemas";

const base = {nome: "CDB Itaú", data_inicio: "2026-01-01", banco: "Itaú", agencia: "1234", conta: "56789-0"};

describe("createContaBancariaBodySchema.tipo", () => {
    it("aceita os 4 tipos, inclusive Conta Aplicação", () => {
        assert.deepEqual([...TIPOS_CONTA_BANCARIA], [
            "Conta Corrente",
            "Conta Poupança",
            "Conta Movimento",
            "Conta Aplicação",
        ]);
        for (const tipo of TIPOS_CONTA_BANCARIA) {
            assert.equal(createContaBancariaBodySchema.safeParse({...base, tipo}).success, true, tipo);
        }
    });

    it("recusa tipo inventado ou vazio, com mensagem útil", () => {
        for (const tipo of ["Conta Salário", "corrente", ""]) {
            const r = createContaBancariaBodySchema.safeParse({...base, tipo});
            assert.equal(r.success, false, tipo);
        }
        const r = createContaBancariaBodySchema.safeParse({...base, tipo: "Conta Salário"});
        assert.ok(!r.success && /Conta Aplicação/.test(r.error.issues[0]!.message));
    });
});

describe("updateContaBancariaBodySchema.tipo", () => {
    it("tipo é opcional e aceita texto (o serviço confere contra o valor gravado)", () => {
        assert.equal(updateContaBancariaBodySchema.safeParse({nome: "Novo nome"}).success, true);
        assert.equal(updateContaBancariaBodySchema.safeParse({tipo: "corrente"}).success, true);
        assert.equal(updateContaBancariaBodySchema.safeParse({tipo: "  "}).success, false);
    });
});