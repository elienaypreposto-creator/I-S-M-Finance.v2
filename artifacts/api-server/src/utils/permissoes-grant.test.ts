import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {PERMISSOES_ADMIN, codigoPermissaoCatalogoSchema} from "../constants/permissoes.js";
import {validatePermissoesGrant} from "./permissoes-grant.js";

const ACTOR_ID = 10;
const TARGET_ID = 20;

describe("validatePermissoesGrant (Card 91)", () => {
    it("rejeita auto-atribuição de '*' no próprio utilizador", () => {
        const result = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: ACTOR_ID,
            actorPermissions: ["admin:usuarios:editar"],
            requested: ["*"],
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 403);
            assert.equal(result.code, "SELF_PERMISSION_EDIT_FORBIDDEN");
        }
    });

    it("rejeita conceder '*' sempre — inclusive se o actor já for superutilizador", () => {
        const semCuringa = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: ["admin:permissoes:conceder", "admin:usuarios:listar"],
            requested: ["*"],
        });
        assert.equal(semCuringa.ok, false);
        if (!semCuringa.ok) {
            assert.equal(semCuringa.status, 403);
            assert.equal(semCuringa.code, "PRIVILEGE_ESCALATION");
        }

        const superuser = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: ["*"],
            requested: ["*"],
        });
        assert.equal(superuser.ok, false);
        if (!superuser.ok) {
            assert.equal(superuser.status, 403);
            assert.equal(superuser.code, "PRIVILEGE_ESCALATION");
        }
    });

    it("rejeita conceder permissão que o actor não possui", () => {
        const result = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: ["admin:usuarios:editar"],
            requested: ["admin:usuarios:editar", "admin:usuarios:deletar"],
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 403);
            assert.equal(result.code, "PRIVILEGE_ESCALATION");
        }
    });

    it("rejeita código fora do catálogo", () => {
        const result = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: ["admin:usuarios:editar", "sudo:root"],
            requested: ["sudo:root"],
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.status, 400);
            assert.equal(result.code, "VALIDATION_ERROR");
        }
    });

    it("bloqueia reescrever um alvo que já tem '*' — inclusive pelo próprio superutilizador", () => {
        const comum = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: ["admin:permissoes:conceder"],
            requested: ["admin:usuarios:editar"],
            targetCurrentPermissions: ["*"],
        });
        assert.equal(comum.ok, false);
        if (!comum.ok) {
            assert.equal(comum.status, 403);
            assert.equal(comum.code, "FORBIDDEN");
        }

        const superuser = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: ["*"],
            requested: ["dashboard:ver"],
            targetCurrentPermissions: ["*"],
        });
        assert.equal(superuser.ok, false);
        if (!superuser.ok) {
            assert.equal(superuser.status, 403);
            assert.equal(superuser.code, "FORBIDDEN");
        }
    });

    it("permite Admin com catálogo completo conceder subset a outro utilizador", () => {
        const requested = ["dashboard:ver", "admin:usuarios:listar", "financeiro:lancamentos:listar"];
        const result = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: PERMISSOES_ADMIN,
            requested,
            targetCurrentPermissions: ["dashboard:ver"],
        });
        assert.deepEqual(result, {ok: true, permissoes: requested});
    });

    it("z.enum do catálogo rejeita '*' e aceita admin:permissoes:conceder", () => {
        assert.equal(codigoPermissaoCatalogoSchema.safeParse("*").success, false);
        assert.equal(codigoPermissaoCatalogoSchema.safeParse("sudo:root").success, false);
        assert.equal(codigoPermissaoCatalogoSchema.safeParse("admin:permissoes:conceder").success, true);
        assert.ok(PERMISSOES_ADMIN.includes("admin:permissoes:conceder"));
    });

    it("nunca permite superutilizador conceder '*' via API (só seed)", () => {
        const result = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: ["*"],
            requested: ["*"],
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.code, "PRIVILEGE_ESCALATION");
        }
    });

    it("deduplica códigos e aceita lista vazia (revogar todas as permissões do alvo)", () => {
        const result = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: PERMISSOES_ADMIN,
            requested: ["dashboard:ver", " dashboard:ver ", "dashboard:ver"],
        });
        assert.deepEqual(result, {ok: true, permissoes: ["dashboard:ver"]});

        const cleared = validatePermissoesGrant({
            actorUserId: ACTOR_ID,
            targetUserId: TARGET_ID,
            actorPermissions: PERMISSOES_ADMIN,
            requested: [],
        });
        assert.deepEqual(cleared, {ok: true, permissoes: []});
    });
});
