import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {assertSegredosJwt} from "./token.service";

const SAIU = new Error("saiu");
const sair = ((code: number) => {
    assert.equal(code, 1);
    throw SAIU;
}) as (code: number) => never;

describe("assertSegredosJwt", () => {
    it("recusa em produção quando JWT_SECRET é igual a JWT_ENCRYPT_SECRET", () => {
        assert.throws(
            () => assertSegredosJwt({NODE_ENV: "production", JWT_SECRET: "a", JWT_ENCRYPT_SECRET: "a"}, sair),
            SAIU,
        );
    });

    it("recusa em produção quando falta JWT_ENCRYPT_SECRET", () => {
        assert.throws(() => assertSegredosJwt({NODE_ENV: "production", JWT_SECRET: "a"}, sair), SAIU);
    });

    it("aceita segredos distintos em produção", () => {
        assertSegredosJwt({NODE_ENV: "production", JWT_SECRET: "a", JWT_ENCRYPT_SECRET: "b"}, sair);
    });

    it("não interfere fora de produção", () => {
        assertSegredosJwt({NODE_ENV: "development", JWT_SECRET: "a", JWT_ENCRYPT_SECRET: "a"}, sair);
    });
});
