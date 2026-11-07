import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {z} from "zod";
import {MENSAGEM_PAYLOAD_INVALIDO, mensagemDeValidacao} from "./validate";

const issues = (schema: z.ZodTypeAny, valor: unknown) => {
    const r = schema.safeParse(valor);
    assert.equal(r.success, false);
    return r.success ? [] : r.error.issues;
};

describe("mensagemDeValidacao", () => {
    it("usa a mensagem escrita no schema (refine/custom e min com texto)", () => {
        const s = z.object({chave: z.string()}).superRefine((_v, ctx) =>
            ctx.addIssue({code: z.ZodIssueCode.custom, message: "Chave PIX: CPF inválido.", path: ["chave"]}),
        );
        assert.equal(mensagemDeValidacao(issues(s, {chave: "1"})), "Chave PIX: CPF inválido.");
        assert.equal(mensagemDeValidacao(issues(z.string().min(1, "Agência é obrigatória."), "")), "Agência é obrigatória.");
    });

    it("pula as mensagens padrão do Zod (inglês) e cai no genérico sem nenhuma escrita", () => {
        const s = z.object({nome: z.string().min(1), conta: z.string().min(1, "Conta é obrigatória.")});
        assert.equal(mensagemDeValidacao(issues(s, {nome: "", conta: ""})), "Conta é obrigatória.");
        assert.equal(mensagemDeValidacao(issues(z.object({nome: z.string()}), {})), MENSAGEM_PAYLOAD_INVALIDO);
        assert.equal(mensagemDeValidacao(issues(z.enum(["a", "b"]), "c")), MENSAGEM_PAYLOAD_INVALIDO);
        assert.equal(mensagemDeValidacao([]), MENSAGEM_PAYLOAD_INVALIDO);
    });
});
