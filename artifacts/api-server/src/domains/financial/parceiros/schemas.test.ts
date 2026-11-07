import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {createParceiroBodySchema, updateParceiroBodySchema} from "./schemas";

// Números sintéticos gerados para teste (dígito verificador calculado), não pertencem a ninguém conhecido.
const CPF_OK = "39053344705";
const CNPJ_OK = "47583092000143";

const base = {nome: "QA-R4 Parceiro", tipos: ["Fornecedor"]};

function mensagens(r: ReturnType<typeof createParceiroBodySchema.safeParse>): string[] {
    return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("createParceiroBodySchema: CPF/CNPJ", () => {
    it("aceita CPF para PF e CNPJ para PJ com dígito correto", () => {
        assert.equal(createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PF", cpf_cnpj: CPF_OK}).success, true);
        assert.equal(createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PJ", cpf_cnpj: CNPJ_OK}).success, true);
        assert.equal(createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PJ", cpf_cnpj: null}).success, true);
    });

    it("recusa dígito verificador errado e sequência repetida", () => {
        const r1 = createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PF", cpf_cnpj: "39053344706"});
        assert.ok(mensagens(r1).some((m) => /CPF inválido/.test(m)));
        const r2 = createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PJ", cpf_cnpj: "11111111000111"});
        assert.ok(mensagens(r2).some((m) => /CNPJ inválido/.test(m)));
        const r3 = createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PF", cpf_cnpj: "11111111111"});
        assert.equal(r3.success, false);
    });

    it("recusa documento do tipo trocado (CNPJ em PF)", () => {
        assert.equal(createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PF", cpf_cnpj: CNPJ_OK}).success, false);
        assert.equal(createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PJ", cpf_cnpj: CPF_OK}).success, false);
    });

    it("valida chave PIX do tipo CPF/CNPJ", () => {
        const pix = (tipo_chave: string, chave: string) => ({
            ...base,
            tipo_pessoa: "PF",
            cpf_cnpj: CPF_OK,
            dados_bancarios: [{tipo: "PIX", tipo_chave, chave}],
        });
        assert.equal(createParceiroBodySchema.safeParse(pix("cpf", "390.533.447-05")).success, true);
        assert.equal(createParceiroBodySchema.safeParse(pix("cnpj", CNPJ_OK)).success, true);
        assert.equal(createParceiroBodySchema.safeParse(pix("email", "qa@exemplo.com.br")).success, true);
        assert.equal(createParceiroBodySchema.safeParse(pix("cpf", "390.533.447-00")).success, false);
        assert.equal(createParceiroBodySchema.safeParse(pix("cnpj", "47583092000100")).success, false);
    });
});

// 12.ABC.345/01DE-35: exemplo oficial da Receita (IN RFB 2.229/2024), DV conferido pelo cálculo.
describe("CNPJ alfanumérico", () => {
    it("aceita PJ com CNPJ alfanumérico e grava em maiúsculas", () => {
        const r = createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PJ", cpf_cnpj: "12abc34501de35"});
        assert.equal(r.success, true);
        assert.equal(r.success && r.data.cpf_cnpj, "12ABC34501DE35");
        assert.equal(createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PJ", cpf_cnpj: "12.ABC.345/01DE-35"}).success, true);
    });

    it("recusa DV errado e alfanumérico em PF", () => {
        const r = createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PJ", cpf_cnpj: "12ABC34501DE36"});
        assert.ok(mensagens(r).some((m) => /CNPJ inválido/.test(m)));
        assert.equal(createParceiroBodySchema.safeParse({...base, tipo_pessoa: "PF", cpf_cnpj: "12ABC34501DE35"}).success, false);
    });

    it("chave PIX CNPJ alfanumérica", () => {
        const pix = (chave: string) => ({
            ...base,
            tipo_pessoa: "PJ",
            cpf_cnpj: CNPJ_OK,
            dados_bancarios: [{tipo: "PIX", tipo_chave: "cnpj", chave}],
        });
        assert.equal(createParceiroBodySchema.safeParse(pix("12.ABC.345/01DE-35")).success, true);
        assert.equal(createParceiroBodySchema.safeParse(pix("12.abc.345/01de-35")).success, true);
        assert.equal(createParceiroBodySchema.safeParse(pix("12.ABC.345/01DE-36")).success, false);
    });

    it("chave PIX CNPJ é gravada em maiúsculas, como o cpf_cnpj; as outras ficam como vieram", () => {
        const r = createParceiroBodySchema.safeParse({
            ...base,
            tipo_pessoa: "PJ",
            cpf_cnpj: CNPJ_OK,
            dados_bancarios: [
                {tipo: "PIX", tipo_chave: "cnpj", chave: " 12.abc.345/01de-35 "},
                {tipo: "PIX", tipo_chave: "email", chave: "Financeiro@Exemplo.com"},
                {tipo: "TED", banco_codigo: "341", banco_nome: "Itaú", agencia: "1234", conta: "5678-9"},
            ],
        });
        assert.equal(r.success, true);
        const itens = r.success ? r.data.dados_bancarios ?? [] : [];
        assert.deepEqual(itens.map((i) => (i.tipo === "PIX" ? i.chave : i.conta)), ["12.ABC.345/01DE-35", "Financeiro@Exemplo.com", "5678-9"]);
        const u = updateParceiroBodySchema.safeParse({dados_bancarios: [{tipo: "PIX", tipo_chave: "cnpj", chave: "12abc34501de35"}]});
        assert.equal(u.success && u.data.dados_bancarios?.[0]?.tipo === "PIX" && u.data.dados_bancarios[0].chave, "12ABC34501DE35");
    });

    it("sem tipo_pessoa, documento com letra é tratado como CNPJ (mesmo com 11 dígitos)", () => {
        assert.equal(updateParceiroBodySchema.safeParse({cpf_cnpj: "12ABC34501DE35"}).success, true);
        // 3 letras + 11 dígitos: só pelos dígitos pareceria CPF; a mensagem tem de falar de CNPJ.
        const r = updateParceiroBodySchema.safeParse({cpf_cnpj: "1A2B3C45678900"});
        assert.ok(!r.success && r.error.issues.some((i) => /CNPJ/.test(i.message)));
    });
});

describe("updateParceiroBodySchema", () => {
    it("só status passa sem documento", () => {
        assert.equal(updateParceiroBodySchema.safeParse({status: "inativo"}).success, true);
    });

    it("sem tipo_pessoa, decide CPF/CNPJ pelo tamanho", () => {
        assert.equal(updateParceiroBodySchema.safeParse({cpf_cnpj: CPF_OK}).success, true);
        assert.equal(updateParceiroBodySchema.safeParse({cpf_cnpj: CNPJ_OK}).success, true);
        assert.equal(updateParceiroBodySchema.safeParse({cpf_cnpj: "39053344706"}).success, false);
        assert.equal(updateParceiroBodySchema.safeParse({cpf_cnpj: "123"}).success, false);
    });
});
