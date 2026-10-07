import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {withEmpresaId} from "./tenant-scope";

describe("withEmpresaId", () => {
    it("injeta o tenant e ignora empresa_id do body do cliente", () => {
        const result = withEmpresaId({nome: "Conta", empresa_id: 99, valor: "10"}, 1);
        assert.equal(result.empresa_id, 1);
        assert.equal(result.nome, "Conta");
        assert.equal(result.valor, "10");
    });

    it("funciona quando o body não traz empresa_id", () => {
        const result = withEmpresaId({descricao: "Lançamento"}, 7);
        assert.equal(result.empresa_id, 7);
        assert.equal(result.descricao, "Lançamento");
    });
});
