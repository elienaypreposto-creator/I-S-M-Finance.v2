import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {maskChavePix, opcoesTipoChavePix, tipoChaveDocumento} from "./pix-ted-masks.ts";

describe("maskChavePix: CNPJ", () => {
    it("numérico e alfanumérico com a mesma máscara, em maiúsculas", () => {
        assert.equal(maskChavePix("47583092000143", "cnpj"), "47.583.092/0001-43");
        assert.equal(maskChavePix("12abc34501de35", "cnpj"), "12.ABC.345/01DE-35");
        assert.equal(maskChavePix("390abc53344705", "cpf"), "390.533.447-05");
    });
});

const valores = (o: { value: string }[]) => o.map((x) => x.value);

describe("opcoesTipoChavePix", () => {
    it("pessoa física oferece CPF e não CNPJ", () => {
        assert.deepEqual(valores(opcoesTipoChavePix("PF")), ["cpf", "email", "telefone", "aleatoria"]);
        assert.equal(tipoChaveDocumento("PF"), "cpf");
    });

    it("pessoa jurídica oferece CNPJ e não CPF", () => {
        assert.deepEqual(valores(opcoesTipoChavePix("PJ")), ["cnpj", "email", "telefone", "aleatoria"]);
        assert.equal(tipoChaveDocumento("PJ"), "cnpj");
    });

    it("mantém na lista o tipo já gravado fora da regra (edição de cadastro antigo)", () => {
        assert.deepEqual(valores(opcoesTipoChavePix("PF", "cnpj")), ["cpf", "cnpj", "email", "telefone", "aleatoria"]);
        assert.deepEqual(valores(opcoesTipoChavePix("PF", "email")), ["cpf", "email", "telefone", "aleatoria"]);
    });
});
