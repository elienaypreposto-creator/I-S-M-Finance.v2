import assert from "node:assert/strict";
import crypto from "node:crypto";
import {describe, it} from "node:test";
import {aplicarIdentidadeToken, hashConfere, identidadeAuditoria} from "./api-token-identity";
import {shouldAuditRequest} from "./audit-routes";

const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

describe("identidade de token da API v1", () => {
    it("popula tenant, escopos e tokenApiId sem criar identidade de usuário", () => {
        const req: Record<string, unknown> = {};
        aplicarIdentidadeToken(req, {id: 7, empresa_id: 3, escopos: ["v1:bancos:ler"]});
        assert.deepEqual(req.tenant, {empresaId: 3});
        assert.deepEqual(req.apiToken, {id: 7, escopos: ["v1:bancos:ler"]});
        assert.equal(req.tokenApiId, 7);
        assert.equal(req.user, undefined);
    });

    it("descarta req.user pré-existente (token não herda usuário)", () => {
        const req: Record<string, unknown> = {user: {id: 7, email: "x@y", empresaId: 3}};
        aplicarIdentidadeToken(req, {id: 7, empresa_id: 3, escopos: null});
        assert.equal(req.user, undefined);
        assert.deepEqual(req.apiToken, {id: 7, escopos: []});
    });

    it("auditoria de GET v1 grava token_api_id e usuario_id null", () => {
        const req: {method: string; originalUrl: string; tokenApiId?: number; user?: {id?: number}} = {
            method: "GET",
            originalUrl: "/api/v1/contasPagar?limit=10",
        };
        aplicarIdentidadeToken(req, {id: 1, empresa_id: 1, escopos: ["v1:lancamentos:ler"]});
        assert.equal(shouldAuditRequest(req.method, req.originalUrl), true);
        // id do token = 1 coincide com um usuário real (admin id 1): não pode virar usuario_id.
        assert.deepEqual(identidadeAuditoria(req), {usuario_id: null, token_api_id: 1});
    });

    it("token prevalece mesmo se algo setar req.user depois", () => {
        assert.deepEqual(identidadeAuditoria({tokenApiId: 5, user: {id: 5}}), {usuario_id: null, token_api_id: 5});
        assert.deepEqual(identidadeAuditoria({apiToken: {id: 9}}), {usuario_id: null, token_api_id: 9});
    });

    it("request de usuário (JWE) mantém usuario_id e token_api_id null", () => {
        assert.deepEqual(identidadeAuditoria({user: {id: 42}}), {usuario_id: 42, token_api_id: null});
        assert.deepEqual(identidadeAuditoria({user: {id: 0}}), {usuario_id: null, token_api_id: null});
        assert.deepEqual(identidadeAuditoria({}), {usuario_id: null, token_api_id: null});
    });
});

describe("hashConfere (tempo constante)", () => {
    it("aceita o segredo correto", () => {
        assert.equal(hashConfere("segredo", sha("segredo")), true);
        assert.equal(hashConfere("segredo", sha("segredo").toUpperCase()), true);
    });

    it("recusa segredo errado, hash ausente ou malformado", () => {
        assert.equal(hashConfere("outro", sha("segredo")), false);
        assert.equal(hashConfere("segredo", null), false);
        assert.equal(hashConfere("segredo", ""), false);
        assert.equal(hashConfere("segredo", "abc"), false);
        assert.equal(hashConfere("segredo", "z".repeat(64)), false);
    });
});
