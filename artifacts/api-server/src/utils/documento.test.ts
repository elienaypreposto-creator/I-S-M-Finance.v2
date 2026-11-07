import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {cnpjValido, cpfValido, erroDocumento, normalizarCnpj, tipoPorDocumento} from "./documento";

// Números sintéticos gerados para teste (dígito verificador calculado), não pertencem a ninguém conhecido.
describe("documento (API)", () => {
    it("CPF: dígito verificador, sequência repetida e tamanho", () => {
        assert.equal(cpfValido("39053344705"), true);
        assert.equal(cpfValido("390.533.447-05"), true);
        assert.equal(cpfValido("39053344706"), false);
        assert.equal(cpfValido("00000000000"), false);
        assert.equal(cpfValido("390533447"), false);
    });

    it("CNPJ: dígito verificador, sequência repetida e tamanho (empresas e parceiros)", () => {
        assert.equal(cnpjValido("47583092000143"), true);
        assert.equal(cnpjValido("11222333000181"), true);
        assert.equal(cnpjValido("47583092000144"), false);
        assert.equal(cnpjValido("22222222000122"), false);
        assert.equal(cnpjValido("11111111111111"), false);
        assert.equal(cnpjValido("4758309200014"), false);
    });

    it("erroDocumento por tipo de pessoa", () => {
        assert.equal(erroDocumento("39053344705", "PF"), null);
        assert.equal(erroDocumento("47583092000143", "PJ"), null);
        assert.match(erroDocumento("47583092000143", "PF")!, /CPF incompleto/);
        assert.match(erroDocumento("47583092000144", "PJ")!, /CNPJ inválido/);
    });

    // 12.ABC.345/01DE-35: exemplo oficial da Receita (IN RFB 2.229/2024); DV 35 conferido por este cálculo.
    it("CNPJ alfanumérico: válido, DV errado, minúsculas e letra no DV", () => {
        assert.equal(cnpjValido("12ABC34501DE35"), true);
        assert.equal(cnpjValido("12.ABC.345/01DE-35"), true);
        assert.equal(cnpjValido("12.abc.345/01de-35"), true);
        assert.equal(normalizarCnpj("12.abc.345/01de-35"), "12ABC34501DE35");
        assert.equal(cnpjValido("12ABC34501DE36"), false);
        assert.equal(cnpjValido("12ABC34501DEA5"), false);
        assert.equal(cnpjValido("ZZZZZZZZZZZZZZ"), false);
        assert.equal(erroDocumento("12abc34501de35", "PJ"), null);
        assert.match(erroDocumento("12ABC34501DE36", "PJ")!, /CNPJ inválido/);
    });

    it("tipoPorDocumento: letra indica CNPJ; sem letra, 11 dígitos é CPF", () => {
        assert.equal(tipoPorDocumento("39053344705"), "PF");
        assert.equal(tipoPorDocumento("47583092000143"), "PJ");
        assert.equal(tipoPorDocumento("1A2B3C45678901"), "PJ");
    });
});
