import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {isAuthGlobalPath, isEmpresaSelectionPath, parsePositiveEmpresaId, resolveAuditEmpresaId} from "./audit-scope";

describe("resolveAuditEmpresaId", () => {
    it("não usa empresa_id do body no login (pre-tenant)", () => {
        const id = resolveAuditEmpresaId(
            {originalUrl: "/api/auth/login", body: {email: "a@b.c", empresa_id: 99}},
            200,
        );
        assert.equal(id, null);
    });

    it("não audita tenant em refresh/logout sem contexto", () => {
        assert.equal(resolveAuditEmpresaId({originalUrl: "/api/auth/refresh"}, 200), null);
        assert.equal(resolveAuditEmpresaId({originalUrl: "/api/auth/logout"}, 204), null);
    });

    it("usa req.tenant quando já autenticado", () => {
        const id = resolveAuditEmpresaId(
            {originalUrl: "/api/lancamentos", tenant: {empresaId: 1}, body: {empresa_id: 99}},
            201,
        );
        assert.equal(id, 1);
    });

    it("em select-empresa 2xx usa o empresa_id escolhido no body", () => {
        const id = resolveAuditEmpresaId(
            {originalUrl: "/api/auth/select-empresa", body: {selectionToken: "x", empresa_id: 2}},
            200,
        );
        assert.equal(id, 2);
    });

    it("em select-empresa 401 não pega empresa_id do body", () => {
        const id = resolveAuditEmpresaId(
            {originalUrl: "/api/auth/select-empresa", body: {empresa_id: 2}},
            401,
        );
        assert.equal(id, null);
    });

    it("ignora empresa_id inválido", () => {
        assert.equal(parsePositiveEmpresaId(0), null);
        assert.equal(parsePositiveEmpresaId(-1), null);
        assert.equal(parsePositiveEmpresaId("abc"), null);
        assert.equal(parsePositiveEmpresaId(undefined), null);
    });
});

describe("auth path helpers", () => {
    it("reconhece rotas de auth globais e de seleção", () => {
        assert.equal(isAuthGlobalPath("/api/auth/login"), true);
        assert.equal(isAuthGlobalPath("/api/lancamentos"), false);
        assert.equal(isEmpresaSelectionPath("/api/auth/select-empresa"), true);
        assert.equal(isEmpresaSelectionPath("/api/auth/login"), false);
    });
});
