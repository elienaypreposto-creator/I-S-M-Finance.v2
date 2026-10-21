import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import type {NextFunction, Request, Response} from "express";
import {AppError} from "../utils/app-error.js";
import {withSuperadmin} from "./withSuperadmin.js";

function run(user: unknown): unknown {
    const req = {user} as unknown as Request;
    let received: unknown = "next-não-chamado";
    const next: NextFunction = (err?: unknown) => {
        received = err;
    };
    withSuperadmin(req, {} as Response, next);
    return received;
}

describe("withSuperadmin (Onda 2, Card 4)", () => {
    it("sem req.user → 401 UNAUTHORIZED", () => {
        const err = run(undefined);
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, "UNAUTHORIZED");
    });

    it("não-superadmin com TODAS as permissões do catálogo → 403 FORBIDDEN", () => {
        const err = run({
            superadmin: false,
            permissions: ["admin:empresas:listar", "admin:empresas:criar", "admin:empresas:editar"],
        });
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, "FORBIDDEN");
    });

    it("superadmin ausente/undefined no payload → 403 (nega por padrão)", () => {
        const err = run({permissions: []});
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 403);
    });

    it("superadmin=true → next() sem erro", () => {
        assert.equal(run({superadmin: true, permissions: []}), undefined);
    });
});

describe("wiring de routes/empresas.ts", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../routes/empresas.ts"), "utf8");

    it("GET e POST /empresas usam withSuperadmin, não withPermission", () => {
        assert.match(src, /router\.get\("\/empresas",\s*withSuperadmin\b/);
        assert.match(src, /router\.post\("\/empresas",\s*withSuperadmin\b/);
        assert.doesNotMatch(src, /withPermission\(PERM\.ADMIN_EMPRESAS_(LISTAR|CRIAR)\)/);
    });
});