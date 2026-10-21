/**
 * TLS do Postgres sem desligar a validação do certificado no processo inteiro.
 *
 * O `pg` deixa os parâmetros `ssl*` da connectionString sobrescreverem o objeto
 * `ssl` do Pool/Client. Por isso os parâmetros saem da URL e o TLS é montado aqui:
 *
 * - Sem SSL pedido (banco na rede interna do compose): `ssl` indefinido.
 * - SSL pedido (`DB_REQUIRE_SSL=true`, `sslmode=require|verify-*` na URL ou host
 *   supabase.co): valida a cadeia e o hostname. CA privada (ex.: Supabase) entra
 *   por `DB_SSL_CA` (PEM) ou `DB_SSL_CA_FILE` / `sslrootcert` (caminho), só nesta conexão.
 */

import fs from "node:fs";
import type {ConnectionOptions} from "node:tls";

const SSL_URL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"] as const;
const SSL_MODES_ON = new Set(["require", "verify-ca", "verify-full"]);

export type PgTlsConfig = {
    connectionString: string;
    ssl: ConnectionOptions | undefined;
};

type Env = Record<string, string | undefined>;

export function pgTlsConfig(connectionString: string, env: Env = process.env): PgTlsConfig {
    let url: URL;
    try {
        url = new URL(connectionString);
    } catch {
        return {connectionString, ssl: undefined};
    }

    const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
    const rootCertPath = url.searchParams.get("sslrootcert") ?? undefined;
    for (const p of SSL_URL_PARAMS) url.searchParams.delete(p);
    const cleaned = url.toString();

    const wantSsl =
        sslmode !== "disable" &&
        (env.DB_REQUIRE_SSL === "true" || (sslmode !== undefined && SSL_MODES_ON.has(sslmode)) || url.hostname.endsWith("supabase.co"));

    if (!wantSsl) {
        return {connectionString: cleaned, ssl: undefined};
    }

    const caFile = env.DB_SSL_CA_FILE || rootCertPath;
    const ca = env.DB_SSL_CA?.replace(/\\n/g, "\n") || (caFile ? fs.readFileSync(caFile, "utf8") : undefined);

    return {
        connectionString: cleaned,
        ssl: {rejectUnauthorized: true, ...(ca ? {ca} : {})},
    };
}
