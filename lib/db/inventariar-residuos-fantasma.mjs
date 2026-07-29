/**
 * B5 / DEF-01 — inventário de fantasmas `origem = residuo_parcial`.
 *
 * Uso (a partir de lib/db, com .env na raiz do monorepo):
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED='0'
 *   node inventariar-residuos-fantasma.mjs
 *
 * Lista títulos residuais e candidatos a fantasma (origem ausente OU sem vínculo).
 * Para saneamento: node sanear-residuos-fantasma.mjs [--apply]
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

const c = new pg.Client({connectionString: url, ssl: {rejectUnauthorized: false}});
await c.connect();

const todos = await c.query(`
    SELECT id
         , descricao
         , status::text, valor::text, valor_quitado::text, lancamento_origem_id
         , conta_id
         , data_quitacao::text, created_at
    FROM lancamentos
    WHERE origem = 'residuo_parcial'
       OR is_residuo_parcial = true
    ORDER BY id
`);

const fantasmas = await c.query(`
    SELECT r.id,
           r.descricao,
           r.status::text, r.valor::text, r.lancamento_origem_id,
           o.id                                               AS origem_existe,
           o.status::text AS origem_status, o.valor_quitado::text AS origem_quitado, o.valor::text AS origem_valor, (SELECT COUNT(*) ::int
                                                                                                                     FROM itens_conciliacao_lancamentos icl
                                                                                                                     WHERE icl.lancamento_id = r.id) AS vinculos_como_titulo,
           (SELECT COUNT(*) ::int
            FROM itens_conciliacao_lancamentos icl
            WHERE icl.lancamento_id = r.lancamento_origem_id) AS vinculos_da_origem
    FROM lancamentos r
             LEFT JOIN lancamentos o ON o.id = r.lancamento_origem_id
    WHERE r.origem = 'residuo_parcial'
       OR r.is_residuo_parcial = true
    ORDER BY r.id
`);

const suspeitos = fantasmas.rows.filter(
    (r) => r.origem_existe == null || (r.vinculos_como_titulo === 0 && r.vinculos_da_origem === 0),
);

/** Fantasmas de excedente invertido: residual pendente cuja origem já está 100% quitada. */
const excedenteInvertido = fantasmas.rows.filter((r) => {
    if (r.status !== "pendente" && r.status !== "atrasado") return false;
    if (r.origem_existe == null) return false;
    if (!["pago", "recebido"].includes(r.origem_status)) return false;
    const quitado = Number(r.origem_quitado ?? 0);
    const valor = Number(r.origem_valor ?? 0);
    return quitado >= valor;
});

console.log("=== TOTAL RESIDUAIS ===", todos.rows.length);
console.log(JSON.stringify(todos.rows, null, 2));
console.log("\n=== CANDIDATOS A FANTASMA (origem ausente OU sem vínculo) ===");
console.log(JSON.stringify(suspeitos, null, 2));
console.log("\n=== EXCEDENTE INVERTIDO (origem quitada + residual aberto) ===");
console.log(JSON.stringify(excedenteInvertido, null, 2));
console.log(
    `\nResumo: ${todos.rows.length} residuais · ${suspeitos.length} órfãos · ${excedenteInvertido.length} excedente-invertido`,
);

await c.end();
