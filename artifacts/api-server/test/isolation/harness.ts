/**
 * Harness da suíte de isolamento entre empresas (tenant leakage) — ISMF-20.
 *
 * - `setupIsolation()` sobe o app Express real em porta efêmera, semeia DUAS
 *   empresas (A e B) com dados em todas as tabelas de domínio relevantes e
 *   devolve o helper `as(usuario, empresa)`.
 * - Os dados são semeados com `adminDb` (ism_admin, BYPASSRLS); as requisições
 *   passam pela API real, que usa `ism_app` com RLS (SET LOCAL app.empresa_id).
 * - Cada linha semeada leva um marcador único na descrição/nome. Qualquer resposta
 *   que contenha o marcador da outra empresa é vazamento.
 *
 * Requer: Postgres migrado (db:migrate), DATABASE_URL (ism_app), ISM_ADMIN_PASSWORD,
 * ISM_OWNER_PASSWORD e JWT_SECRET. Sem isso a suíte FALHA (nunca pula em silêncio).
 */

import {type AddressInfo} from "node:net";
import http from "node:http";
import crypto from "node:crypto";
import {sql} from "drizzle-orm";
import {
    adminDb,
    closeDbPools,
    pool,
    contasBancariasTable,
    conciliacoesTable,
    departamentosTable,
    empresasTable,
    extratoLinhasTable,
    extratosTable,
    filiaisTable,
    itensConciliacaoLancamentosTable,
    itensConciliacaoTable,
    kanbanCardsTable,
    lancamentosTable,
    metasTable,
    parceirosTable,
    planoContasTable,
    regrasConciliacaoTable,
    tokensApiTable,
    usuarioEmpresasTable,
    usuariosTable,
} from "@workspace/db";
import {PERMISSOES_ADMIN} from "@workspace/db/permissoes";
import {signAccessToken} from "../../src/services/token.service";
import {loadAppWithInventory, type RouteEntry} from "./route-inventory";

const REQUIRED_ENV = ["DATABASE_URL", "ISM_ADMIN_PASSWORD", "ISM_OWNER_PASSWORD", "JWT_SECRET"] as const;

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostDe(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

export function assertIsolationEnv(): void {
    const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(
            `Suíte de isolamento exige ${missing.join(", ")}. ` +
            "Suba o Postgres, rode `pnpm --filter @workspace/db run db:migrate` e exporte as variáveis " +
            "(ver .github/workflows/ci.yml). Esta suíte não é pulada de propósito.",
        );
    }

    // A suíte CRIA e APAGA empresas, usuários e dados, e gera linhas de auditoria que não se apagam.
    // Nunca deve rodar contra um banco compartilhado ou de produção (ex.: Supabase via .env).
    if (process.env.ISM_ISOLATION_ALLOW_REMOTE !== "1") {
        for (const nome of ["DATABASE_URL", "DATABASE_MIGRATE_URL"] as const) {
            const valor = process.env[nome];
            if (!valor) continue;
            const host = hostDe(valor);
            if (!host || !HOSTS_LOCAIS.has(host)) {
                throw new Error(
                    `${nome} aponta para "${host ?? "URL inválida"}", que não é um banco local. ` +
                    "Recusando rodar: a suíte cria e apaga dados. Use um Postgres descartável (Docker em 127.0.0.1) " +
                    "e NÃO carregue o .env do projeto (sem --env-file). Para forçar, defina ISM_ISOLATION_ALLOW_REMOTE=1.",
                );
            }
        }
    }

    // Com Redis, o rate limit global (300 req/15 min por IP) é contado e persiste entre execuções:
    // a suíte passa a receber 429 e os resultados deixam de valer.
    if (process.env.REDIS_URL) {
        throw new Error(
            "REDIS_URL está definido. O rate limit global conta no Redis e estoura a suíte (429). " +
            "Rode sem Redis: não use --env-file=.env e dê `unset REDIS_URL` neste terminal.",
        );
    }
}

export type EmpresaFx = {
    id: number;
    marker: string;
    usuarioId: number;
    email: string;
    ids: {
        conta: number;
        parceiro: number;
        planoConta: number;
        departamento: number;
        filial: number;
        lancamento: number;
        transferenciaGrupo: string;
        regra: number;
        tokenApi: number;
        kanbanCard: number;
        extrato: number;
        linha: number;
        vinculo: number;
    };
};

export type Fixture = { run: string; A: EmpresaFx; B: EmpresaFx };

export type Resposta = { status: number; text: string; json: unknown };

export type Cliente = {
    get: (path: string, extra?: RequestExtra) => Promise<Resposta>;
    post: (path: string, body?: unknown, extra?: RequestExtra) => Promise<Resposta>;
    put: (path: string, body?: unknown, extra?: RequestExtra) => Promise<Resposta>;
    patch: (path: string, body?: unknown, extra?: RequestExtra) => Promise<Resposta>;
    delete: (path: string, extra?: RequestExtra) => Promise<Resposta>;
    request: (method: string, path: string, body?: unknown, extra?: RequestExtra) => Promise<Resposta>;
};

export type RequestExtra = { headers?: Record<string, string>; token?: string | null };

export type Harness = {
    fx: Fixture;
    authenticatedRoutes: RouteEntry[];
    /** Cliente autenticado como `usuario` com a sessão apontando para `empresa`. */
    as: (usuario: EmpresaFx, empresa: EmpresaFx) => Cliente;
    /** Cliente sem token. */
    anon: () => Cliente;
    mintToken: (usuario: EmpresaFx, empresaId: number) => Promise<string>;
    close: () => Promise<void>;
};

async function seedEmpresa(label: "A" | "B", run: string): Promise<EmpresaFx> {
    const marker = `ISO-${label}-${run}`;

    const [empresa] = await adminDb
        .insert(empresasTable)
        .values({
            razao_social: `${marker} Ltda`,
            slug: `iso-${label.toLowerCase()}-${run}`,
            ativa: true,
            dpa_representante: "Teste de isolamento",
            dpa_assinado_em: new Date(),
        })
        .returning();

    const email = `iso-${label.toLowerCase()}-${run}@teste.local`;
    const [usuario] = await adminDb
        .insert(usuariosTable)
        .values({nome: `${marker} Usuário`, email, senha_hash: "nao-usado-nos-testes"})
        .returning();

    await adminDb.insert(usuarioEmpresasTable).values({
        usuario_id: usuario.id,
        empresa_id: empresa.id,
        papel: "admin",
    });

    const empresaId = empresa.id;

    const [conta] = await adminDb
        .insert(contasBancariasTable)
        .values({empresa_id: empresaId, tipo: "corrente", nome: `${marker} Conta`, data_inicio: "2026-01-01"})
        .returning();
    const [parceiro] = await adminDb
        .insert(parceirosTable)
        .values({empresa_id: empresaId, tipo_pessoa: "PJ", nome: `${marker} Parceiro`})
        .returning();
    const [planoConta] = await adminDb
        .insert(planoContasTable)
        .values({empresa_id: empresaId, tipo: "despesa", categoria: `${marker} Categoria`})
        .returning();
    const [departamento] = await adminDb
        .insert(departamentosTable)
        .values({empresa_id: empresaId, nome: `${marker} Departamento`})
        .returning();
    const [filial] = await adminDb
        .insert(filiaisTable)
        .values({empresa_id: empresaId, nome: `${marker} Filial`})
        .returning();
    await adminDb
        .insert(metasTable)
        .values({empresa_id: empresaId, plano_conta_id: planoConta.id, ano: 2026, mes: 1, valor_projetado: "100"});

    // Sem o marcador no valor: rotas de erro ecoam o id pedido e gerariam falso positivo.
    const transferenciaGrupo = `trf-${label.toLowerCase()}-${run}`;
    const [lancamento] = await adminDb
        .insert(lancamentosTable)
        .values({
            empresa_id: empresaId,
            tipo: "CP",
            vencimento: "2026-01-15",
            valor: "123.45",
            descricao: `${marker} Lançamento`,
            conta_id: conta.id,
            parceiro_id: parceiro.id,
            plano_conta_id: planoConta.id,
            transferencia_grupo_id: transferenciaGrupo,
        })
        .returning();

    const [regra] = await adminDb
        .insert(regrasConciliacaoTable)
        .values({empresa_id: empresaId, texto_gatilho: `${marker} gatilho`, natureza: "saida"})
        .returning();

    const [tokenApi] = await adminDb
        .insert(tokensApiTable)
        .values({
            empresa_id: empresaId,
            descricao: `${marker} Token`,
            token_hash: crypto.createHash("sha256").update(marker).digest("hex"),
            data_expiracao: "2099-01-01",
            escopos: ["v1:lancamentos:ler"],
        })
        .returning();

    const [kanbanCard] = await adminDb
        .insert(kanbanCardsTable)
        .values({empresa_id: empresaId, titulo: `${marker} Card`})
        .returning();

    const [extrato] = await adminDb
        .insert(extratosTable)
        .values({empresa_id: empresaId, conta_id: conta.id, arquivo_nome: `${marker}.ofx`})
        .returning();
    const [linha] = await adminDb
        .insert(extratoLinhasTable)
        .values({
            empresa_id: empresaId,
            extrato_id: extrato.id,
            conta_id: conta.id,
            valor: "123.45",
            tipo_movimento: "debito",
            hash_linha: `hash-${marker}`,
            descricao: `${marker} Linha`,
        })
        .returning();
    const [conciliacao] = await adminDb
        .insert(conciliacoesTable)
        .values({empresa_id: empresaId, extrato_id: extrato.id, conta_id: conta.id})
        .returning();
    const [item] = await adminDb
        .insert(itensConciliacaoTable)
        .values({
            empresa_id: empresaId,
            conciliacao_id: conciliacao.id,
            extrato_linha_id: linha.id,
            valor_extrato: "123.45",
            tipo_extrato: "debito",
        })
        .returning();
    const [vinculo] = await adminDb
        .insert(itensConciliacaoLancamentosTable)
        .values({
            empresa_id: empresaId,
            item_conciliacao_id: item.id,
            lancamento_id: lancamento.id,
            valor_vinculado: "123.45",
        })
        .returning();

    return {
        id: empresaId,
        marker,
        usuarioId: usuario.id,
        email,
        ids: {
            conta: conta.id,
            parceiro: parceiro.id,
            planoConta: planoConta.id,
            departamento: departamento.id,
            filial: filial.id,
            lancamento: lancamento.id,
            transferenciaGrupo,
            regra: regra.id,
            tokenApi: tokenApi.id,
            kanbanCard: kanbanCard.id,
            extrato: extrato.id,
            linha: linha.id,
            vinculo: vinculo.id,
        },
    };
}

/** Remove tudo que a fixture criou (ordem inversa das FKs), via ism_admin. */
async function cleanup(fx: Fixture): Promise<void> {
    const empresaIds = [fx.A.id, fx.B.id];
    const usuarioIds = [fx.A.usuarioId, fx.B.usuarioId];
    const lista = (ids: number[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

    const tabelas = [
        "itens_conciliacao_lancamentos",
        "historico_conciliacao",
        "itens_conciliacao",
        "conciliacoes",
        "extrato_linhas",
        "extratos",
        "kanban_anexos",
        "kanban_comentarios",
        "kanban_historico",
        "kanban_cards",
        "metas",
        "lancamentos",
        "regras_conciliacao",
        "tokens_api",
        "parametros_sistema",
        "centros_custos",
        "departamentos",
        "filiais",
        "parceiros",
        "plano_contas",
        "contas_bancarias",
        "usuario_permissoes",
        "usuario_empresas",
    ];
    for (const t of tabelas) {
        await adminDb.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE empresa_id IN (${lista(empresaIds)})`);
    }
    await adminDb.execute(sql`DELETE FROM refresh_tokens WHERE usuario_id IN (${lista(usuarioIds)})`);
    await adminDb.execute(sql`DELETE FROM usuarios WHERE id IN (${lista(usuarioIds)})`);
    await adminDb.execute(sql`DELETE FROM empresas WHERE id IN (${lista(empresaIds)})`);
}

function makeClient(baseUrl: string, defaultToken: string | null): Cliente {
    const request = async (method: string, path: string, body?: unknown, extra?: RequestExtra): Promise<Resposta> => {
        const token = extra?.token === undefined ? defaultToken : extra.token;
        const headers: Record<string, string> = {...(extra?.headers ?? {})};
        if (token) headers.Authorization = `Bearer ${token}`;
        let payload: string | undefined;
        if (body !== undefined && method !== "GET" && method !== "DELETE") {
            headers["Content-Type"] = "application/json";
            payload = JSON.stringify(body);
        }
        const res = await fetch(`${baseUrl}/api${path}`, {method, headers, body: payload, redirect: "manual"});
        if (res.status === 429) {
            throw new Error(
                `429 (rate limit) em ${method} ${path}: a suíte foi bloqueada pelo limitador global e nenhum resultado vale. ` +
                "Rode sem Redis (sem --env-file=.env) e aguarde a janela de 15 min expirar.",
            );
        }
        const text = await res.text();
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch {
            /* resposta não-JSON (ex.: download) */
        }
        return {status: res.status, text, json};
    };
    return {
        request,
        get: (p, e) => request("GET", p, undefined, e),
        post: (p, b, e) => request("POST", p, b, e),
        put: (p, b, e) => request("PUT", p, b, e),
        patch: (p, b, e) => request("PATCH", p, b, e),
        delete: (p, e) => request("DELETE", p, undefined, e),
    };
}

export async function setupIsolation(): Promise<Harness> {
    assertIsolationEnv();

    const run = crypto.randomBytes(4).toString("hex");
    const {app, authenticatedRoutes} = await loadAppWithInventory();

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const A = await seedEmpresa("A", run);
    const B = await seedEmpresa("B", run);
    const fx: Fixture = {run, A, B};

    const mintToken = (usuario: EmpresaFx, empresaId: number) =>
        signAccessToken({
            sub: String(usuario.usuarioId),
            email: usuario.email,
            // Todas as permissões: garante que o 403 por permissão não mascare vazamento de tenant.
            permissions: [...PERMISSOES_ADMIN],
            empresa_id: empresaId,
            superadmin: false,
        });

    const cache = new Map<string, Cliente>();
    return {
        fx,
        authenticatedRoutes,
        mintToken,
        anon: () => makeClient(baseUrl, null),
        as: (usuario, empresa) => {
            const key = `${usuario.usuarioId}:${empresa.id}`;
            let c = cache.get(key);
            if (!c) {
                // Token minted de forma preguiçosa na primeira requisição.
                let tokenPromise: Promise<string> | null = null;
                const lazy = makeClient(baseUrl, null);
                const request: Cliente["request"] = async (method, path, body, extra) => {
                    tokenPromise ??= mintToken(usuario, empresa.id);
                    const token = extra?.token === undefined ? await tokenPromise : extra.token;
                    return lazy.request(method, path, body, {...extra, token});
                };
                c = {
                    request,
                    get: (p, e) => request("GET", p, undefined, e),
                    post: (p, b, e) => request("POST", p, b, e),
                    put: (p, b, e) => request("PUT", p, b, e),
                    patch: (p, b, e) => request("PATCH", p, b, e),
                    delete: (p, e) => request("DELETE", p, undefined, e),
                };
                cache.set(key, c);
            }
            return c;
        },
        close: async () => {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            try {
                await cleanup(fx);
            } finally {
                await closeDbPools();
            }
        },
    };
}

/**
 * O middleware tenant-tx só faz COMMIT depois que a resposta foi enviada (evento "finish"):
 * o cliente pode receber 2xx antes de o dado estar visível. Antes de consultar o banco, os
 * testes esperam o pool da API (mesmo processo) ficar ocioso, isto é, sem transação aberta.
 */
export async function aguardarCommits(timeoutMs = 5000): Promise<void> {
    const limite = Date.now() + timeoutMs;
    while (pool.totalCount !== pool.idleCount && Date.now() < limite) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/**
 * Impressão digital das linhas de uma empresa em TODA tabela com `empresa_id`
 * (descoberta pelo information_schema, então tabela nova entra sozinha).
 * Lida como ism_admin (BYPASSRLS) para ver o estado real do banco.
 */
export async function snapshotEmpresa(empresaId: number): Promise<Record<string, string>> {
    await aguardarCommits();
    const {rows: tabelas} = await adminDb.execute<{ table_name: string }>(sql`
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
                 JOIN information_schema.tables t
                      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public'
          AND c.column_name = 'empresa_id'
        ORDER BY 1
    `);
    const out: Record<string, string> = {};
    for (const {table_name} of tabelas) {
        const {rows} = await adminDb.execute<{ n: string; h: string | null }>(sql`
            SELECT count(*)::text AS n,
                   md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h
            FROM ${sql.identifier(table_name)} t
            WHERE t.empresa_id = ${empresaId}
        `);
        out[table_name] = `${rows[0]?.n}:${rows[0]?.h}`;
    }
    // `empresas` não tem coluna empresa_id (a própria linha é a empresa) e não tem RLS:
    // fica de fora da varredura acima, então entra aqui explicitamente.
    const {rows: emp} = await adminDb.execute<{ h: string | null }>(sql`
        SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM empresas t WHERE t.id = ${empresaId}
    `);
    out["empresas"] = `1:${emp[0]?.h}`;
    return out;
}

/** Diferenças entre dois snapshots, legível em mensagem de falha. */
export function diffSnapshots(antes: Record<string, string>, depois: Record<string, string>): string[] {
    const tabelas = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    return [...tabelas].filter((t) => antes[t] !== depois[t]).map((t) => `${t}: ${antes[t]} -> ${depois[t]}`);
}