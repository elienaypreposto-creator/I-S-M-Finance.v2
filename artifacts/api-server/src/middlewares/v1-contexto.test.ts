import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {Request} from "express";
import {resolveAuditEmpresaId} from "../lib/audit-scope.js";
import {popularContexto} from "./v1-contexto.js";

describe("v1Auth.popularContexto (auditoria de token)", () => {
    const tokenRow = {id: 7, empresa_id: 3, escopos: ["v1:bancos:ler"]};

    it("seta req.tokenApiId com o id do token", () => {
        const req = {} as Request;
        popularContexto(req, tokenRow);
        assert.equal(req.tokenApiId, 7);
        assert.deepEqual(req.apiToken, {id: 7, escopos: ["v1:bancos:ler"]});
    });

    it("não preenche req.user (id do token não pode virar usuário real)", () => {
        const req = {} as Request;
        popularContexto(req, tokenRow);
        assert.equal(req.user, undefined);
    });

    it("tenant vem de req.tenant, então a auditoria resolve a empresa do token", () => {
        const req = {} as Request;
        popularContexto(req, tokenRow);
        assert.equal(resolveAuditEmpresaId(req, 200), 3);
    });
});