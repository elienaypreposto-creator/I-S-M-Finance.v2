import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {AUDIT_SENSITIVE_GET_PREFIXES, shouldAuditRequest} from "./audit-routes";

describe("shouldAuditRequest", () => {
    it("audita mutações independentemente do path", () => {
        assert.equal(shouldAuditRequest("POST", "/api/lancamentos"), true);
        assert.equal(shouldAuditRequest("PUT", "/api/usuarios/1"), true);
        assert.equal(shouldAuditRequest("PATCH", "/api/tokens-api/1"), true);
        assert.equal(shouldAuditRequest("DELETE", "/api/lancamentos/9"), true);
    });

    it("audita GETs sensíveis da constante (relatorios/dre, dashboard, usuarios, auditoria, tokens-api)", () => {
        assert.ok(AUDIT_SENSITIVE_GET_PREFIXES.includes("/relatorios"));
        assert.equal(shouldAuditRequest("GET", "/api/relatorios/dre"), true);
        assert.equal(shouldAuditRequest("GET", "/api/dashboard/kpis"), true);
        assert.equal(shouldAuditRequest("GET", "/api/usuarios"), true);
        assert.equal(shouldAuditRequest("GET", "/api/auditoria"), true);
        assert.equal(shouldAuditRequest("GET", "/api/tokens-api"), true);
        assert.equal(shouldAuditRequest("GET", "/api/relatorios/dre/export"), true);
    });

    it("não audita GET de listagem comum", () => {
        assert.equal(shouldAuditRequest("GET", "/api/lancamentos"), false);
        assert.equal(shouldAuditRequest("GET", "/api/healthz"), false);
        assert.equal(shouldAuditRequest("OPTIONS", "/api/relatorios/dre"), false);
    });
});
