import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    cnpjValido,
    cpfValido,
    erroDocumento,
    mascararCnpj,
    mascararCpf,
    mascararDocumento,
    normalizarCnpj,
    normalizarDocumento,
} from "./documento.ts";

// Números sintéticos gerados para teste (dígito verificador calculado), não pertencem a ninguém conhecido.
const CPF_OK = "39053344705";
const CNPJ_OK = "47583092000143";

describe("cpfValido", () => {
    it("aceita CPF com dígitos corretos, com ou sem máscara", () => {
        assert.equal(cpfValido(CPF_OK), true);
        assert.equal(cpfValido("390.533.447-05"), true);
        assert.equal(cpfValido("84712093650"), true);
    });

    it("recusa dígito verificador errado, sequência repetida e tamanho errado", () => {
        assert.equal(cpfValido("39053344706"), false);
        assert.equal(cpfValido("39053344715"), false);
        assert.equal(cpfValido("11111111111"), false);
        assert.equal(cpfValido("00000000000"), false);
        assert.equal(cpfValido("3905334470"), false);
        assert.equal(cpfValido(""), false);
        assert.equal(cpfValido(null), false);
    });
});

describe("cnpjValido", () => {
    it("aceita CNPJ com dígitos corretos, com ou sem máscara", () => {
        assert.equal(cnpjValido(CNPJ_OK), true);
        assert.equal(cnpjValido("47.583.092/0001-43"), true);
        assert.equal(cnpjValido("90341765000188"), true);
    });

    it("recusa dígito verificador errado, sequência repetida e tamanho errado", () => {
        assert.equal(cnpjValido("47583092000144"), false);
        assert.equal(cnpjValido("47583092000153"), false);
        assert.equal(cnpjValido("11111111111111"), false);
        assert.equal(cnpjValido("4758309200014"), false);
        assert.equal(cnpjValido(CPF_OK), false);
    });
});

describe("erroDocumento", () => {
    it("diferencia incompleto de dígito errado e respeita PF/PJ", () => {
        assert.equal(erroDocumento(CPF_OK, "PF"), null);
        assert.equal(erroDocumento(CNPJ_OK, "PJ"), null);
        assert.match(erroDocumento("390.533", "PF")!, /incompleto/);
        assert.match(erroDocumento("39053344706", "PF")!, /inválido/);
        assert.match(erroDocumento(CPF_OK, "PJ")!, /CNPJ incompleto/);
        assert.match(erroDocumento("47583092000144", "PJ")!, /CNPJ inválido/);
    });
});

describe("máscaras", () => {
    it("formata CPF e CNPJ enquanto digita e corta excesso", () => {
        assert.equal(mascararCpf(CPF_OK), "390.533.447-05");
        assert.equal(mascararCpf("3905"), "390.5");
        assert.equal(mascararCnpj(CNPJ_OK), "47.583.092/0001-43");
        assert.equal(mascararCnpj("4758309200014399"), "47.583.092/0001-43");
        assert.equal(mascararDocumento(CPF_OK, "PF"), "390.533.447-05");
        assert.equal(mascararDocumento(CNPJ_OK, "PJ"), "47.583.092/0001-43");
    });
});

// CNPJ alfanumérico (IN RFB 2.229/2024). 12.ABC.345/01DE-35 é o exemplo oficial da Receita:
// o DV 35 foi conferido com o cálculo daqui (caractere vale ASCII − 48, 'A' = 17).
describe("CNPJ alfanumérico", () => {
    it("aceita o exemplo oficial com e sem máscara, normalizando minúsculas", () => {
        assert.equal(cnpjValido("12ABC34501DE35"), true);
        assert.equal(cnpjValido("12.ABC.345/01DE-35"), true);
        assert.equal(cnpjValido("12.abc.345/01de-35"), true);
        assert.equal(normalizarCnpj("12.abc.345/01de-35"), "12ABC34501DE35");
        assert.equal(normalizarDocumento("12.abc.345/01de-35", "PJ"), "12ABC34501DE35");
        assert.equal(normalizarDocumento("390.533.447-05", "PF"), "39053344705");
        assert.equal(erroDocumento("12.abc.345/01de-35", "PJ"), null);
    });

    it("recusa DV errado, letra no DV e sequência repetida", () => {
        assert.equal(cnpjValido("12ABC34501DE36"), false);
        assert.equal(cnpjValido("12ABC34501DE53"), false);
        assert.equal(cnpjValido("12ABC34501DEA5"), false);
        assert.equal(cnpjValido("AAAAAAAAAAAAAA"), false);
        assert.match(erroDocumento("12ABC34501DE36", "PJ")!, /CNPJ inválido/);
        assert.match(erroDocumento("12ABC34501DEAB", "PJ")!, /DV/);
        assert.match(erroDocumento("12ABC345", "PJ")!, /CNPJ incompleto/);
    });

    it("numérico antigo continua igual e CPF segue só numérico", () => {
        assert.equal(cnpjValido(CNPJ_OK), true);
        assert.equal(cnpjValido("47583092000144"), false);
        assert.equal(cpfValido("39053344705"), true);
        assert.equal(mascararCpf("390abc533"), "390.533");
    });

    it("máscara AA.AAA.AAA/AAAA-DD em maiúsculas, DV só com dígitos", () => {
        assert.equal(mascararCnpj("12abc34501de35"), "12.ABC.345/01DE-35");
        assert.equal(mascararCnpj("12ab"), "12.AB");
        assert.equal(mascararCnpj("12ABC34501DEX3Y5"), "12.ABC.345/01DE-35");
        assert.equal(mascararDocumento("12abc34501de35", "PJ"), "12.ABC.345/01DE-35");
        assert.equal(mascararDocumento("12abc34501de35", "PF"), "123.450.135");
    });
});
