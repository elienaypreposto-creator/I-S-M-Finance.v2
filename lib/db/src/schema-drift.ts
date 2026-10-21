/**
 * Compara o schema Drizzle com um banco criado só pelas migrations.
 * Falha (exit 1) se faltar ou sobrar tabela, coluna ou índice, ou se tipo /
 * NOT NULL divergirem: é a trava de "schema alterado sem migration".
 *
 * Uso: DATABASE_MIGRATE_URL=... pnpm --filter @workspace/db run schema:drift
 */

import {is} from "drizzle-orm";
import {getTableConfig, PgTable} from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

/** Tabelas mantidas só por SQL (fora do Drizzle). */
const TABELAS_FORA_DO_SCHEMA = new Set(["logs_auditoria_arquivo"]);

type ColunaBanco = {tabela: string; coluna: string; tipo: string; not_null: boolean};
type IndiceBanco = {tabela: string; indice: string; de_constraint: boolean};

/** Normaliza o tipo do Drizzle para o texto de `format_type` do Postgres. */
function tipoDrizzle(sqlType: string): string {
    const t = sqlType.toLowerCase().trim().replace(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/, "($1,$2)");
    const base: Record<string, string> = {
        serial: "integer",
        bigserial: "bigint",
        smallserial: "smallint",
        timestamp: "timestamp without time zone",
        "timestamp with time zone": "timestamp with time zone",
        time: "time without time zone",
        "double precision": "double precision",
    };
    if (base[t]) return base[t];
    const varchar = t.match(/^varchar(\(\d+\))?$/);
    if (varchar) return `character varying${varchar[1] ?? ""}`;
    const char = t.match(/^char(\(\d+\))?$/);
    if (char) return `character${char[1] ?? ""}`;
    const ts = t.match(/^timestamp \((\d)\)$/);
    if (ts) return `timestamp(${ts[1]}) without time zone`;
    return t;
}

async function main(): Promise<void> {
    const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("Defina DATABASE_MIGRATE_URL.");

    const client = new pg.Client({connectionString: url});
    await client.connect();
    const erros: string[] = [];
    try {
        const {rows: colunas} = await client.query<ColunaBanco>(`
            SELECT c.relname AS tabela, a.attname AS coluna,
                   format_type(a.atttypid, a.atttypmod) AS tipo, a.attnotnull AS not_null
            FROM pg_attribute a
                     JOIN pg_class c ON c.oid = a.attrelid
                     JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped`);
        const {rows: indices} = await client.query<IndiceBanco>(`
            SELECT t.relname AS tabela, i.relname AS indice,
                   EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.oid) AS de_constraint
            FROM pg_index x
                     JOIN pg_class i ON i.oid = x.indexrelid
                     JOIN pg_class t ON t.oid = x.indrelid
                     JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'`);

        const colunasPorTabela = new Map<string, Map<string, ColunaBanco>>();
        for (const c of colunas) {
            if (!colunasPorTabela.has(c.tabela)) colunasPorTabela.set(c.tabela, new Map());
            colunasPorTabela.get(c.tabela)!.set(c.coluna, c);
        }

        const tabelasSchema = new Set<string>();
        for (const valor of Object.values(schema)) {
            if (!is(valor, PgTable)) continue;
            const cfg = getTableConfig(valor);
            if (tabelasSchema.has(cfg.name)) continue;
            tabelasSchema.add(cfg.name);

            const doBanco = colunasPorTabela.get(cfg.name);
            if (!doBanco) {
                erros.push(`tabela ausente no banco: ${cfg.name}`);
                continue;
            }

            const nomesSchema = new Set<string>();
            for (const col of cfg.columns) {
                nomesSchema.add(col.name);
                const b = doBanco.get(col.name);
                if (!b) {
                    erros.push(`coluna ausente no banco: ${cfg.name}.${col.name}`);
                    continue;
                }
                const esperado = tipoDrizzle(col.getSQLType());
                if (esperado !== b.tipo) {
                    erros.push(`tipo divergente: ${cfg.name}.${col.name} schema=${esperado} banco=${b.tipo}`);
                }
                if (col.notNull !== b.not_null) {
                    erros.push(`NOT NULL divergente: ${cfg.name}.${col.name} schema=${col.notNull} banco=${b.not_null}`);
                }
            }
            for (const nome of doBanco.keys()) {
                if (!nomesSchema.has(nome)) erros.push(`coluna sem declaração no schema: ${cfg.name}.${nome}`);
            }

            const indicesSchema = new Set<string>();
            for (const idx of cfg.indexes) {
                const nome = idx.config.name;
                if (!nome) {
                    erros.push(`índice sem nome em ${cfg.name}: declare o nome explicitamente`);
                    continue;
                }
                if (indicesSchema.has(nome)) erros.push(`índice declarado duas vezes: ${cfg.name}.${nome}`);
                indicesSchema.add(nome);
            }
            const indicesBanco = indices.filter((i) => i.tabela === cfg.name);
            for (const nome of indicesSchema) {
                if (!indicesBanco.some((i) => i.indice === nome)) erros.push(`índice ausente no banco: ${cfg.name}.${nome}`);
            }
            for (const i of indicesBanco) {
                if (!i.de_constraint && !indicesSchema.has(i.indice)) {
                    erros.push(`índice sem declaração no schema: ${cfg.name}.${i.indice}`);
                }
            }
        }

        for (const tabela of colunasPorTabela.keys()) {
            if (!tabelasSchema.has(tabela) && !TABELAS_FORA_DO_SCHEMA.has(tabela)) erros.push(`tabela sem declaração no schema: ${tabela}`);
        }
    } finally {
        await client.end();
    }

    if (erros.length > 0) {
        console.error(`[schema:drift] ${erros.length} divergência(s) entre schema e migrations:`);
        for (const e of erros.sort()) console.error(`  - ${e}`);
        process.exit(1);
    }
    console.log("[schema:drift] OK - schema Drizzle e banco migrado estão alinhados.");
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
