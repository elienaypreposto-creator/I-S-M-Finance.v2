import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {pgTlsConfig} from "./db-ssl";

const LOCAL = "postgresql://ism_app:x@postgres:5432/ismfinance";

describe("pgTlsConfig", () => {
    it("banco interno sem sslmode: sem TLS e URL intacta", () => {
        const cfg = pgTlsConfig(LOCAL, {});
        assert.equal(cfg.ssl, undefined);
        assert.equal(cfg.connectionString, LOCAL);
    });

    it("sslmode=require: valida certificado e remove sslmode da URL", () => {
        const cfg = pgTlsConfig(`${LOCAL}?sslmode=require`, {});
        assert.deepEqual(cfg.ssl, {rejectUnauthorized: true});
        assert.ok(!cfg.connectionString.includes("sslmode"));
    });

    it("DB_REQUIRE_SSL=true liga TLS validado", () => {
        assert.deepEqual(pgTlsConfig(LOCAL, {DB_REQUIRE_SSL: "true"}).ssl, {rejectUnauthorized: true});
    });

    it("host supabase.co liga TLS validado mesmo sem sslmode", () => {
        const cfg = pgTlsConfig("postgresql://u:p@aws-0-sa.pooler.supabase.co:6543/postgres", {});
        assert.equal(cfg.ssl?.rejectUnauthorized, true);
    });

    it("sslmode=disable vence DB_REQUIRE_SSL", () => {
        assert.equal(pgTlsConfig(`${LOCAL}?sslmode=disable`, {DB_REQUIRE_SSL: "true"}).ssl, undefined);
    });

    it("CA própria por DB_SSL_CA (PEM com \\n escapado) só nesta conexão", () => {
        const cfg = pgTlsConfig(`${LOCAL}?sslmode=require`, {DB_SSL_CA: "-----BEGIN-----\\nabc\\n-----END-----"});
        assert.equal(cfg.ssl?.rejectUnauthorized, true);
        assert.equal(cfg.ssl?.ca, "-----BEGIN-----\nabc\n-----END-----");
    });

    it("CA própria por DB_SSL_CA_FILE ou sslrootcert", () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dbssl-")), "ca.pem");
        fs.writeFileSync(file, "PEM-DO-ARQUIVO");
        assert.equal(pgTlsConfig(`${LOCAL}?sslmode=require`, {DB_SSL_CA_FILE: file}).ssl?.ca, "PEM-DO-ARQUIVO");
        const viaUrl = pgTlsConfig(`${LOCAL}?sslmode=verify-full&sslrootcert=${encodeURIComponent(file)}`, {});
        assert.equal(viaUrl.ssl?.ca, "PEM-DO-ARQUIVO");
        assert.ok(!viaUrl.connectionString.includes("sslrootcert"));
    });

    it("nunca devolve rejectUnauthorized=false", () => {
        for (const env of [{}, {DB_REQUIRE_SSL: "true"}, {DB_SSL_CA: "x"}]) {
            assert.notEqual(pgTlsConfig(`${LOCAL}?sslmode=require`, env).ssl?.rejectUnauthorized, false);
        }
    });
});
