import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {contaBancariaFormSchema, parceiroFormSchema} from "./cadastros.schema.ts";
import {dataCivilIso, hojeIsoLocal} from "../lib/datas.ts";

// Números sintéticos gerados para teste (dígito verificador calculado), não pertencem a ninguém conhecido.
const CPF_OK = "390.533.447-05";
const CNPJ_OK = "47.583.092/0001-43";

const parceiro = (extra: Record<string, unknown>) => ({
    tipoPessoa: "PF",
    nomeRazao: "QA-R4 Parceiro",
    documento: CPF_OK,
    tiposParceiro: ["Fornecedor"],
    ...extra,
});

const erroEm = (r: ReturnType<typeof parceiroFormSchema.safeParse>, campo: string) =>
    r.success ? undefined : r.error.issues.find((i) => i.path.join(".") === campo)?.message;

describe("parceiroFormSchema: documento", () => {
    it("aceita CPF/CNPJ com dígito verificador correto", () => {
        assert.equal(parceiroFormSchema.safeParse(parceiro({})).success, true);
        assert.equal(parceiroFormSchema.safeParse(parceiro({tipoPessoa: "PJ", documento: CNPJ_OK})).success, true);
    });

    it("recusa dígito verificador errado com mensagem clara", () => {
        const r = parceiroFormSchema.safeParse(parceiro({documento: "390.533.447-06"}));
        assert.match(erroEm(r, "documento") ?? "", /CPF inválido/);
        const r2 = parceiroFormSchema.safeParse(parceiro({tipoPessoa: "PJ", documento: "11.111.111/1111-11"}));
        assert.match(erroEm(r2, "documento") ?? "", /CNPJ inválido/);
    });

    it("documento incompleto ou vazio", () => {
        assert.match(erroEm(parceiroFormSchema.safeParse(parceiro({documento: "390.533"})), "documento") ?? "", /incompleto/);
        assert.match(erroEm(parceiroFormSchema.safeParse(parceiro({documento: ""})), "documento") ?? "", /Informe/);
    });
});

describe("parceiroFormSchema: chave PIX", () => {
    const comPix = (tipo_chave: string, chave: string) =>
        parceiro({dadosBancarios: [{formasPagamento: ["PIX"], pix: [{tipo_chave, chave}], ted: []}]});

    it("chave CPF/CNPJ precisa de dígito verificador válido", () => {
        assert.equal(parceiroFormSchema.safeParse(comPix("cpf", CPF_OK)).success, true);
        assert.equal(parceiroFormSchema.safeParse(comPix("cnpj", CNPJ_OK)).success, true);
        const r = parceiroFormSchema.safeParse(comPix("cpf", "390.533.447-00"));
        assert.match(erroEm(r, "dadosBancarios.0.pix.0.chave") ?? "", /CPF inválido/);
        assert.equal(parceiroFormSchema.safeParse(comPix("cnpj", "47.583.092/0001-00")).success, false);
    });

    it("chave CNPJ alfanumérica (IN RFB 2.229/2024)", () => {
        assert.equal(parceiroFormSchema.safeParse(comPix("cnpj", "12.ABC.345/01DE-35")).success, true);
        assert.equal(parceiroFormSchema.safeParse(comPix("cnpj", "12.ABC.345/01DE-36")).success, false);
    });
});

describe("parceiroFormSchema: CNPJ alfanumérico", () => {
    it("aceita PJ com CNPJ alfanumérico válido, inclusive em minúsculas", () => {
        assert.equal(parceiroFormSchema.safeParse(parceiro({tipoPessoa: "PJ", documento: "12.ABC.345/01DE-35"})).success, true);
        assert.equal(parceiroFormSchema.safeParse(parceiro({tipoPessoa: "PJ", documento: "12.abc.345/01de-35"})).success, true);
    });

    it("recusa DV errado e CNPJ alfanumérico em PF", () => {
        const r = parceiroFormSchema.safeParse(parceiro({tipoPessoa: "PJ", documento: "12.ABC.345/01DE-36"}));
        assert.match(erroEm(r, "documento") ?? "", /CNPJ inválido/);
        assert.equal(parceiroFormSchema.safeParse(parceiro({tipoPessoa: "PF", documento: "12.ABC.345/01DE-35"})).success, false);
    });
});

describe("contaBancariaFormSchema", () => {
    const conta = (extra: Record<string, unknown>) => ({
        tipo: "Conta Corrente",
        nome: "QA-R4 Conta",
        banco: "Itaú Unibanco",
        agencia: "1234",
        conta: "98765-4",
        saldo_inicial_br: "1.000,00",
        data_inicio: "2026-01-02",
        cor: "#3BA8DC",
        ...extra,
    });
    const erroDe = (r: ReturnType<typeof contaBancariaFormSchema.safeParse>, campo: string) =>
        r.success ? undefined : r.error.issues.find((i) => i.path.join(".") === campo)?.message;

    it("recusa data de início no futuro e aceita hoje", () => {
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        const r = contaBancariaFormSchema.safeParse(conta({data_inicio: dataCivilIso(amanha)}));
        assert.match(erroDe(r, "data_inicio") ?? "", /futuro/);
        assert.equal(contaBancariaFormSchema.safeParse(conta({data_inicio: hojeIsoLocal()})).success, true);
    });

    it("aceita saldo inicial negativo e recusa só o sinal", () => {
        assert.equal(contaBancariaFormSchema.safeParse(conta({saldo_inicial_br: "-1.500,00"})).success, true);
        assert.equal(contaBancariaFormSchema.safeParse(conta({saldo_inicial_br: "-"})).success, false);
    });

    it("agência com até 4 dígitos e dígito opcional", () => {
        assert.equal(contaBancariaFormSchema.safeParse(conta({agencia: "1234-5"})).success, true);
        assert.match(erroDe(contaBancariaFormSchema.safeParse(conta({agencia: "12345"})), "agencia") ?? "", /Agência inválida/);
    });
});
