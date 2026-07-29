/**
 * B5 / DEF-01 — saneamento de fantasmas `residuo_parcial`.
 *
 * Espelha `scripts/cleanup-residuo-parcial-fantasma.sql`:
 * 1) residual pendente/atrasado cuja origem já está pago/recebido com quitado ≥ valor
 *    -> soma o valor do residual em origem.juros e cancela o residual
 * 2) residual sem origem (lancamento_origem_id nulo ou origem deletada)
 *    -> cancela o residual
 *
 * Uso (a partir de lib/db):
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED='0'
 *   node sanear-residuos-fantasma.mjs          # dry-run (default)
 *   node sanear-residuos-fantasma.mjs --apply  # aplica em transação
 */
import {readFileSync} from "fs";
import {fileURLToPath} from "url";
import {dirname, join} from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../../.env");
const env = readFileSync(envPath, "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!url) throw new Error(`DATABASE_URL ausente em ${envPath}`);

const apply = process.argv.includes("--apply");

const c = new pg.Client({connectionString: url, ssl: {rejectUnauthorized: false}});
await c.connect();

const excedenteSql = `
    SELECT r.id    AS residuo_id,
           r.valor AS residuo_valor,
           r.lancamento_origem_id,
           o.juros AS origem_juros,
           o.status::text AS origem_status
    FROM lancamentos r
             INNER JOIN lancamentos o ON o.id = r.lancamento_origem_id
    WHERE (r.origem = 'residuo_parcial' OR r.is_residuo_parcial = true)
      AND r.status IN ('pendente', 'atrasado')
      AND o.valor_quitado IS NOT NULL
      AND o.valor_quitado::numeric >= o.valor::numeric
    AND o.status IN ('pago', 'recebido')
    ORDER BY r.id
`;

const orfaosSql = `
    SELECT r.id AS residuo_id, r.valor AS residuo_valor, r.lancamento_origem_id
    FROM lancamentos r
             LEFT JOIN lancamentos o ON o.id = r.lancamento_origem_id
    WHERE (r.origem = 'residuo_parcial' OR r.is_residuo_parcial = true)
      AND r.status IN ('pendente', 'atrasado')
      AND (r.lancamento_origem_id IS NULL OR o.id IS NULL)
    ORDER BY r.id
`;

const excedente = await c.query(excedenteSql);
const orfaos = await c.query(orfaosSql);

console.log("=== DRY-RUN / PLANO ===");
console.log("excedente-invertido:", excedente.rows.length, JSON.stringify(excedente.rows, null, 2));
console.log("órfãos (sem origem):", orfaos.rows.length, JSON.stringify(orfaos.rows, null, 2));

if (!apply) {
    console.log("\nNenhuma alteração. Passe --apply para executar o saneamento.");
    await c.end();
    process.exit(0);
}

await c.query("BEGIN");
try {
    // 1) Move valor do fantasma para origem.juros
    const updJuros = await c.query(`
        WITH fantasmas AS (${excedenteSql})
        UPDATE lancamentos o
        SET juros = COALESCE(o.juros, 0)::numeric + f.residuo_valor::numeric,
        updated_at = now()
        FROM fantasmas f
        WHERE o.id = f.lancamento_origem_id
            RETURNING o.id
            , o.juros
    `);

    const cancelExcedente = await c.query(`
        WITH fantasmas AS (${excedenteSql})
        UPDATE lancamentos r
        SET status     = 'cancelado',
            updated_at = now() FROM fantasmas f
        WHERE r.id = f.residuo_id
            RETURNING r.id
    `);

    const cancelOrfaos = await c.query(`
        WITH orfaos AS (${orfaosSql})
        UPDATE lancamentos r
        SET status     = 'cancelado',
            updated_at = now() FROM orfaos o
        WHERE r.id = o.residuo_id
            RETURNING r.id
    `);

    await c.query("COMMIT");
    console.log("\n=== APLICADO ===");
    console.log("origens com juros atualizados:", updJuros.rowCount, updJuros.rows);
    console.log("residuais cancelados (excedente):", cancelExcedente.rowCount, cancelExcedente.rows);
    console.log("residuais cancelados (órfãos):", cancelOrfaos.rowCount, cancelOrfaos.rows);
} catch (e) {
    await c.query("ROLLBACK");
    console.error("ROLLBACK — erro no saneamento:", e);
    process.exitCode = 1;
}

await c.end();
