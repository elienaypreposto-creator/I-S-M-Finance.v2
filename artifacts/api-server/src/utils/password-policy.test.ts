import assert from "node:assert/strict";
import crypto from "node:crypto";
import {describe, it} from "node:test";
import {checkLocalRules, isPasswordPwned, validatePasswordPolicy} from "./password-policy";

const ctx = {email: "joana.prates@exemplo.com", nome: "Joana Prates"};

/** fetch falso da HIBP: devolve o sufixo do SHA-1 de `vazada` com contagem `n`. */
const hibpFake = (vazada: string, n = 42): typeof fetch =>
    (async () => {
        const sufixo = crypto.createHash("sha1").update(vazada, "utf8").digest("hex").toUpperCase().slice(5);
        return new Response(`${"0".repeat(35)}:0\n${sufixo}:${n}\n`, {status: 200});
    }) as unknown as typeof fetch;

describe("política de senha (regras locais)", () => {
    it("recusa curta (< 12)", () => {
        assert.equal(checkLocalRules("curta123", ctx)?.code, "TOO_SHORT");
    });

    it("recusa acima de 72 bytes UTF-8", () => {
        assert.equal(checkLocalRules("ç".repeat(40), ctx)?.code, "TOO_LONG");
    });

    it("recusa senha com o e-mail ou a parte antes do @", () => {
        assert.equal(checkLocalRules("x-joana.prates@exemplo.com", ctx)?.code, "CONTAINS_EMAIL");
        assert.equal(checkLocalRules("abc-joana.prates-123", ctx)?.code, "CONTAINS_EMAIL");
    });

    it("recusa senha com o nome (sem acento/maiúscula)", () => {
        assert.equal(checkLocalRules("Planalto-PRATES-2026", ctx)?.code, "CONTAINS_NAME");
        assert.equal(checkLocalRules("zz-jóána-zz-2026", {nome: "Joana"})?.code, "CONTAINS_NAME");
    });

    it("aceita frase longa sem dados pessoais e sem exigir composição", () => {
        assert.equal(checkLocalRules("cavalo correto bateria grampo", ctx), null);
    });
});

describe("política de senha (HIBP)", () => {
    it("recusa senha vazada", async () => {
        const v = await validatePasswordPolicy("cavalo correto bateria grampo", ctx, hibpFake("cavalo correto bateria grampo"));
        assert.equal(v?.code, "PWNED");
    });

    it("aceita quando o sufixo não aparece ou só aparece com contagem 0 (padding)", async () => {
        assert.equal(await validatePasswordPolicy("cavalo correto bateria grampo", ctx, hibpFake("outra senha qualquer")), null);
        assert.equal(await validatePasswordPolicy("cavalo correto bateria grampo", ctx, hibpFake("cavalo correto bateria grampo", 0)), null);
    });

    it("fail-open: HIBP fora do ar não bloqueia", async () => {
        const quebrado = (async () => {
            throw new Error("offline");
        }) as unknown as typeof fetch;
        const original = console.warn;
        console.warn = () => {};
        try {
            assert.equal(await isPasswordPwned("qualquer coisa longa", quebrado), null);
        } finally {
            console.warn = original;
        }
    });

    it("só o prefixo de 5 caracteres do SHA-1 sai do servidor", async () => {
        let url = "";
        const espiao = (async (u: string) => {
            url = u;
            return new Response("", {status: 200});
        }) as unknown as typeof fetch;
        const senha = "cavalo correto bateria grampo";
        await isPasswordPwned(senha, espiao);
        const sha1 = crypto.createHash("sha1").update(senha, "utf8").digest("hex").toUpperCase();
        assert.ok(url.endsWith(`/range/${sha1.slice(0, 5)}`));
        assert.ok(!url.includes(sha1.slice(5)));
    });
});
