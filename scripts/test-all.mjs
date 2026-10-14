#!/usr/bin/env node
/**
 * Esteira de testes completa — a mesma bateria local e no CI.
 *
 *   1. typecheck, testes unitários da API e do front
 *   2. banco: migrations (2x), drift do schema, RLS, seed de teste
 *   3. API compilada + e2e do fluxo conciliação → lançamentos
 *
 * Banco: usa TEST_PG_URL (superusuário) se definido; senão sobe um
 * Postgres 16 descartável em Docker e remove ao final.
 *
 * Uso: pnpm test:all [--sem-unitarios] [--sem-banco]
 */
import {spawn, spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const PNPM = process.env.PNPM_CMD ?? "pnpm";
const CONTAINER = "ism-test-pg";
const PORTA_API = Number(process.env.TEST_API_PORT ?? 5099);

const resultados = [];
const segredo = () => randomBytes(16).toString("hex");

/** Roda um comando; com `capturar`, devolve a saída (ou null em erro) em vez de boolean. */
function etapa(nome, comando, env = {}, {capturar = false} = {}) {
    const inicio = Date.now();
    console.log(`\n━━ ${nome}\n$ ${comando}`);
    const r = spawnSync(comando, {
        cwd: RAIZ,
        shell: true,
        stdio: capturar ? ["ignore", "pipe", "inherit"] : "inherit",
        encoding: "utf8",
        env: {...process.env, ...env},
    });
    if (capturar) process.stdout.write(r.stdout ?? "");
    const ok = r.status === 0;
    resultados.push({nome, ok, s: ((Date.now() - inicio) / 1000).toFixed(1)});
    if (capturar) return ok ? r.stdout : null;
    return ok;
}

/** Lê linhas CHAVE=valor da saída de um comando. */
function lerVariaveis(saida) {
    const vars = {};
    for (const linha of (saida ?? "").split(/\r?\n/)) {
        const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) vars[m[1]] = m[2];
    }
    return vars;
}

function comUsuario(url, usuario, senha) {
    const u = new URL(url);
    u.username = usuario;
    u.password = senha;
    return u.toString();
}

async function esperar(url, tentativas = 60) {
    for (let i = 0; i < tentativas; i++) {
        try {
            const r = await fetch(url);
            if (r.ok) return true;
        } catch {
            /* ainda subindo */
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

function subirPostgresDocker() {
    const senha = segredo();
    spawnSync(`docker rm -f ${CONTAINER}`, {shell: true, stdio: "ignore"});
    const porta = Number(process.env.TEST_PG_PORT ?? 55434);
    const r = spawnSync(
        `docker run -d --name ${CONTAINER} -e POSTGRES_USER=ism_user -e POSTGRES_PASSWORD=${senha} ` +
            `-e POSTGRES_DB=ismfinance -p 127.0.0.1:${porta}:5432 postgres:16-alpine`,
        {shell: true, stdio: "inherit"},
    );
    if (r.status !== 0) throw new Error("Não foi possível subir o Postgres de teste (Docker está rodando?).");
    for (let i = 0; i < 60; i++) {
        const p = spawnSync(`docker exec ${CONTAINER} pg_isready -U ism_user -d ismfinance`, {shell: true, stdio: "ignore"});
        if (p.status === 0) break;
        spawnSync(process.platform === "win32" ? "timeout /t 1 >NUL" : "sleep 1", {shell: true});
    }
    return `postgresql://ism_user:${senha}@127.0.0.1:${porta}/ismfinance`;
}

async function main() {
    if (!args.has("--sem-unitarios")) {
        etapa("Typecheck (libs, API, front)", `${PNPM} run typecheck`);
        etapa("Testes unitários da API", `${PNPM} --filter @workspace/api-server run test`);
        etapa("Testes do front", `${PNPM} run test:web`);
    }

    if (!args.has("--sem-banco")) {
        const dockerProprio = !process.env.TEST_PG_URL;
        const migrateUrl = process.env.TEST_PG_URL ?? subirPostgresDocker();
        const senhas = {app: segredo(), admin: segredo(), owner: segredo()};
        const envBanco = {
            DATABASE_MIGRATE_URL: migrateUrl,
            DATABASE_URL: comUsuario(migrateUrl, "ism_app", senhas.app),
            DATABASE_ADMIN_URL: comUsuario(migrateUrl, "ism_admin", senhas.admin),
            DATABASE_OWNER_URL: comUsuario(migrateUrl, "ism_owner", senhas.owner),
            ISM_APP_PASSWORD: senhas.app,
            ISM_ADMIN_PASSWORD: senhas.admin,
            ISM_OWNER_PASSWORD: senhas.owner,
        };
        const envE2e = {E2E_EMAIL: "e2e@teste.local", E2E_SENHA: `E2e_${segredo()}`};

        try {
            const migrou =
                etapa("Migrations em banco vazio", `${PNPM} --filter @workspace/db run db:migrate`, envBanco) &&
                etapa("Migrations de novo (idempotência)", `${PNPM} --filter @workspace/db run db:migrate`, envBanco);
            if (migrou) {
                etapa("Drift do schema", `${PNPM} --filter @workspace/db run schema:drift`, envBanco);
                etapa("RLS (smoke)", `${PNPM} --filter @workspace/db run rls:smoke`, envBanco);
            }
            const saidaSeed = migrou
                ? etapa("Seed de teste", `${PNPM} --filter @workspace/db run seed:teste`, {...envBanco, ...envE2e}, {capturar: true})
                : null;
            const semeou = saidaSeed != null;
            const empresasSeed = lerVariaveis(saidaSeed);
            const compilou = semeou && etapa("Build da API", `${PNPM} --filter @workspace/api-server run build`);

            if (compilou) {
                const api = spawn(process.execPath, ["artifacts/api-server/dist/index.cjs"], {
                    cwd: RAIZ,
                    env: {
                        ...process.env,
                        ...envBanco,
                        PORT: String(PORTA_API),
                        NODE_ENV: "production",
                        RUN_LOCAL: "true",
                        JWT_SECRET: segredo() + segredo(),
                        JWT_ENCRYPT_SECRET: segredo() + segredo(),
                        // Banco descartável de teste: não há volume LUKS a exigir no boot.
                        ISM_DISCO_CIFRADO: "1",
                    },
                    stdio: ["ignore", "pipe", "pipe"],
                });
                let logApi = "";
                api.stdout.on("data", (d) => (logApi += d));
                api.stderr.on("data", (d) => (logApi += d));
                try {
                    const subiu = await esperar(`http://127.0.0.1:${PORTA_API}/api/healthz`);
                    if (!subiu) {
                        resultados.push({nome: "API de teste no ar", ok: false, s: "-"});
                        console.error(logApi);
                    } else {
                        const ok = etapa("E2E conciliação → lançamentos", "node --test artifacts/api-server/test/e2e/fluxo-conciliacao.mjs", {
                            ...envE2e,
                            E2E_BASE_URL: `http://127.0.0.1:${PORTA_API}/api`,
                            E2E_EMPRESA_ID: empresasSeed.E2E_EMPRESA_ID,
                            E2E_EMPRESA_B_ID: empresasSeed.E2E_EMPRESA_B_ID,
                        });
                        if (!ok) console.error(logApi.split("\n").slice(-60).join("\n"));
                    }
                } finally {
                    api.kill();
                }
            }
        } finally {
            if (dockerProprio) spawnSync(`docker rm -f ${CONTAINER}`, {shell: true, stdio: "ignore"});
        }
    }

    console.log("\n━━ Resumo");
    for (const r of resultados) console.log(`${r.ok ? "✔" : "✖"} ${r.nome} (${r.s}s)`);
    process.exit(resultados.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
