/**
 * ISMF-20 — Suíte de isolamento entre empresas (tenant leakage).
 *
 * Roda com: pnpm --filter @workspace/api-server run test:isolation
 * (Postgres migrado + variáveis de ambiente; ver .github/workflows/ci.yml).
 */

import assert from "node:assert/strict";
import {after, before, describe, it} from "node:test";
import {adminDb, pool} from "@workspace/db";
import {sql} from "drizzle-orm";
import {aguardarCommits, diffSnapshots, setupIsolation, snapshotEmpresa, type Harness} from "./harness";
import {montarRequisicao} from "./scenarios";

let h: Harness;

before(async () => {
    h = await setupIsolation();
});

after(async () => {
    await h?.close();
});

const vazou = (texto: string, marcador: string) => texto.includes(marcador);

describe("cobertura: 100% das rotas autenticadas", () => {
    it("inventário vem do router e contém rotas conhecidas", () => {
        const chaves = new Set(h.authenticatedRoutes.map((r) => r.key));
        for (const esperada of ["GET /lancamentos", "PUT /lancamentos/:id", "GET /kanban/cards", "GET /conciliacoes/:extrato_id"]) {
            assert.ok(chaves.has(esperada), `rota ausente do inventário: ${esperada}`);
        }
        assert.ok(h.authenticatedRoutes.length >= 90, `inventário suspeito: ${h.authenticatedRoutes.length} rotas`);
    });

    it("toda rota autenticada é classificável (param conhecido)", () => {
        for (const route of h.authenticatedRoutes) montarRequisicao(route, h.fx.B);
    });

    it("toda rota autenticada recusa requisição sem token (401)", async () => {
        const anon = h.anon();
        const falhas: string[] = [];
        for (const route of h.authenticatedRoutes) {
            const r = montarRequisicao(route, h.fx.B);
            const res = await anon.request(r.method, r.path, r.body);
            if (res.status !== 401) falhas.push(`${route.key} -> ${res.status}`);
        }
        assert.deepEqual(falhas, [], `rotas autenticadas acessíveis sem token:\n${falhas.join("\n")}`);
    });

    it("token inválido é recusado (401)", async () => {
        const res = await h.anon().get("/lancamentos", {token: "isto-nao-e-um-jwe"});
        assert.equal(res.status, 401);
    });
});

describe("leitura entre empresas", () => {
    const listas = ["/lancamentos", "/parceiros", "/contas-bancarias", "/plano-contas", "/filiais", "/departamentos", "/regras-conciliacao"];

    for (const rota of listas) {
        it(`GET ${rota}: A vê só A, B vê só B`, async () => {
            const {A, B} = h.fx;
            const comoA = await h.as(A, A).get(rota);
            const comoB = await h.as(B, B).get(rota);
            assert.equal(comoA.status, 200, comoA.text);
            assert.equal(comoB.status, 200, comoB.text);
            // Controle de não-vacuidade: a própria empresa enxerga seus dados.
            assert.ok(vazou(comoA.text, A.marker), `${rota}: A não enxergou seus próprios dados`);
            assert.ok(vazou(comoB.text, B.marker), `${rota}: B não enxergou seus próprios dados`);
            assert.ok(!vazou(comoA.text, B.marker), `${rota}: VAZAMENTO B -> A`);
            assert.ok(!vazou(comoB.text, A.marker), `${rota}: VAZAMENTO A -> B`);
        });
    }

    it("detalhe por id: dono lê (200), outra empresa recebe 404", async () => {
        const {A, B} = h.fx;
        const detalhes: Array<[string, number]> = [
            [`/lancamentos/${B.ids.lancamento}`, B.id],
            [`/parceiros/${B.ids.parceiro}`, B.id],
        ];
        for (const [rota] of detalhes) {
            const dono = await h.as(B, B).get(rota);
            assert.equal(dono.status, 200, `controle falhou em ${rota}: ${dono.text}`);
            assert.ok(vazou(dono.text, B.marker));
            const intruso = await h.as(A, A).get(rota);
            assert.equal(intruso.status, 404, `${rota}: A deveria receber 404, recebeu ${intruso.status}`);
            assert.ok(!vazou(intruso.text, B.marker), `${rota}: VAZAMENTO no corpo do erro`);
        }
    });
});

describe("escrita entre empresas", () => {
    it("PUT/DELETE de recurso de B por A: recusado e B intacto", async () => {
        const {A, B} = h.fx;
        const antes = await snapshotEmpresa(B.id);
        const alvos: Array<[string, unknown]> = [
            [`/lancamentos/${B.ids.lancamento}`, {descricao: "HACK", valor: "999"}],
            [`/contas-bancarias/${B.ids.conta}`, {nome: "HACK"}],
            [`/parceiros/${B.ids.parceiro}`, {tipo_pessoa: "PJ", nome: "HACK", cpf_cnpj: "11222333000181"}],
            [`/plano-contas/${B.ids.planoConta}`, {categoria: "HACK"}],
            [`/filiais/${B.ids.filial}`, {nome: "HACK"}],
            [`/departamentos/${B.ids.departamento}`, {nome: "HACK"}],
        ];
        for (const [rota, corpo] of alvos) {
            const put = await h.as(A, A).put(rota, corpo);
            assert.ok(put.status >= 400 && put.status < 500, `PUT ${rota}: esperado 4xx, veio ${put.status} ${put.text}`);
            const del = await h.as(A, A).delete(rota);
            assert.ok(del.status >= 400 && del.status < 500, `DELETE ${rota}: esperado 4xx, veio ${del.status} ${del.text}`);
        }
        const depois = await snapshotEmpresa(B.id);
        assert.deepEqual(diffSnapshots(antes, depois), []);
    });

    it("POST com empresa_id de B no corpo grava em A, nunca em B", async () => {
        const {A, B} = h.fx;
        const antes = await snapshotEmpresa(B.id);
        const nome = `${A.marker}-criado-com-empresa-forjada`;
        const res = await h.as(A, A).post("/parceiros", {tipo_pessoa: "PJ", nome, cpf_cnpj: "11222333000181", empresa_id: B.id});
        assert.ok([200, 201].includes(res.status), `POST /parceiros falhou: ${res.status} ${res.text}`);
        await aguardarCommits();
        const {rows} = await adminDb.execute<{ empresa_id: number }>(
            sql`SELECT empresa_id FROM parceiros WHERE nome = ${nome}`,
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].empresa_id, A.id, "parceiro foi gravado na empresa errada");
        assert.deepEqual(diffSnapshots(antes, await snapshotEmpresa(B.id)), []);
    });

    it("lançamento de A não referencia conta/parceiro de B", async () => {
        const {A, B} = h.fx;
        await h.as(A, A).post("/lancamentos", {
            tipo: "CP",
            vencimento: "2026-03-01",
            valor: "5",
            descricao: `${A.marker}-ref-cruzada`,
            conta_id: B.ids.conta,
            parceiro_id: B.ids.parceiro,
        });
        await aguardarCommits();
        const {rows} = await adminDb.execute<{ n: string }>(sql`
            SELECT count(*)::text AS n
            FROM lancamentos l
            WHERE l.empresa_id = ${A.id}
              AND (l.conta_id IN (SELECT id FROM contas_bancarias WHERE empresa_id = ${B.id})
                OR l.parceiro_id IN (SELECT id FROM parceiros WHERE empresa_id = ${B.id}))
        `);
        assert.equal(rows[0].n, "0", "lançamento de A passou a apontar para conta/parceiro de B");
    });
});

describe("contexto de empresa", () => {
    it("token de A com empresa_id=B (sem vínculo) é recusado", async () => {
        const {A, B} = h.fx;
        const forjado = await h.mintToken(A, B.id);
        const res = await h.anon().get("/lancamentos", {token: forjado});
        assert.equal(res.status, 401, res.text);
        assert.ok(!vazou(res.text, B.marker));
    });

    it("header, query e corpo com empresa de B são ignorados", async () => {
        const {A, B} = h.fx;
        const res = await h.as(A, A).get(`/lancamentos?empresa_id=${B.id}`, {
            headers: {"X-Empresa-Id": String(B.id), "X-Tenant-Id": String(B.id)},
        });
        assert.equal(res.status, 200, res.text);
        assert.ok(vazou(res.text, A.marker));
        assert.ok(!vazou(res.text, B.marker), "VAZAMENTO via header/query de empresa");
    });
});

describe("varredura: todas as rotas autenticadas, como A, mirando B", () => {
    it("nenhuma resposta vaza dado de B, nenhum id de B é aceito, B fica intacto", async () => {
        const {A, B} = h.fx;
        const antes = await snapshotEmpresa(B.id);
        let anterior = antes;
        const cliente = h.as(A, A);
        const problemas: string[] = [];

        // Controle anti-vácuo: se o token de A não funciona, TODAS as rotas devolvem 4xx e a varredura
        // "passaria" sem testar nada. Então exige-se antes que A leia os próprios dados.
        const controle = await cliente.get("/lancamentos");
        assert.equal(controle.status, 200, `controle falhou: A não consegue ler os próprios lançamentos (${controle.status}). Varredura inválida.`);
        assert.ok(vazou(controle.text, A.marker), "controle falhou: resposta de A sem os dados de A");
        const executadas = new Set<string>();
        const servidor5xx: string[] = [];

        for (const route of h.authenticatedRoutes) {
            const r = montarRequisicao(route, B);
            const res = await cliente.request(r.method, r.path, r.body);
            executadas.add(route.key);

            if (res.status === 401) problemas.push(`${route.key}: token de A recusado (401); a rota não foi realmente testada`);
            if (vazou(res.text, B.marker)) problemas.push(`${route.key}: resposta contém dado de B (status ${res.status})`);
            // 2xx com id de B só é aceitável em leitura que devolve lista vazia (RLS filtrou tudo).
            const listaVazia =
                r.method === "GET" &&
                Array.isArray((res.json as { data?: unknown } | null)?.data) &&
                ((res.json as { data: unknown[] }).data).length === 0;
            if (r.temIdAlheio && res.status >= 200 && res.status < 300 && !listaVazia) {
                problemas.push(`${route.key}: aceitou id de B (status ${res.status})`);
            }
            // Snapshot por rota: aponta QUAL rota alterou dado de B, em vez de só "B mudou".
            const atual = await snapshotEmpresa(B.id);
            const mudou = diffSnapshots(anterior, atual);
            if (mudou.length > 0) problemas.push(`${route.key}: alterou dados de B (status ${res.status}) -> ${mudou.join("; ")}`);
            anterior = atual;
            if (r.exige403 && res.status !== 403) {
                problemas.push(`${route.key}: rota administrativa deveria dar 403 a usuário comum, deu ${res.status}`);
            }
            if (res.status >= 500) servidor5xx.push(`${route.key} -> ${res.status}`);
        }

        assert.equal(executadas.size, h.authenticatedRoutes.length, "nem toda rota foi exercitada");
        assert.deepEqual(problemas, [], `Vazamento entre empresas:\n${problemas.join("\n")}`);
        assert.deepEqual(diffSnapshots(antes, await snapshotEmpresa(B.id)), [], "dados de B foram alterados por A");
        if (servidor5xx.length > 0) console.warn(`[isolamento] rotas com 5xx durante a varredura:\n${servidor5xx.join("\n")}`);
    });
});

describe("integridade referencial entre empresas (todas as FKs, via catálogo)", () => {
    it("nenhuma linha referencia, por FK, linha de OUTRA empresa", async () => {
        const {rows: fks} = await adminDb.execute<{ child: string; fk_col: string; parent: string; pk_col: string }>(sql`
            SELECT cc.relname AS child, att.attname AS fk_col, pc.relname AS parent, patt.attname AS pk_col
            FROM pg_constraint con
                     JOIN pg_class cc ON cc.oid = con.conrelid
                     JOIN pg_class pc ON pc.oid = con.confrelid
                     JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
                     JOIN pg_attribute patt ON patt.attrelid = con.confrelid AND patt.attnum = con.confkey[1]
            WHERE con.contype = 'f'
              AND array_length(con.conkey, 1) = 1
              AND con.connamespace = 'public'::regnamespace
              AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attname = 'empresa_id' AND NOT a.attisdropped)
              AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = con.confrelid AND a.attname = 'empresa_id' AND NOT a.attisdropped)
            ORDER BY 1, 2
        `);
        assert.ok(fks.length >= 10, `poucas FKs encontradas (${fks.length}): a consulta de catálogo precisa de revisão`);

        const violacoes: string[] = [];
        for (const fk of fks) {
            const {rows} = await adminDb.execute<{ n: string }>(sql`
                SELECT count(*)::text AS n
                FROM ${sql.identifier(fk.child)} c
                         JOIN ${sql.identifier(fk.parent)} p ON c.${sql.identifier(fk.fk_col)} = p.${sql.identifier(fk.pk_col)}
                WHERE c.empresa_id <> p.empresa_id
            `);
            if (rows[0].n !== "0") violacoes.push(`${fk.child}.${fk.fk_col} -> ${fk.parent}: ${rows[0].n} linha(s) apontam para outra empresa`);
        }
        assert.deepEqual(violacoes, [], `Referências entre empresas:\n${violacoes.join("\n")}`);
    });
});

/**
 * Exceção deliberada (migration 0022): a política dessas tabelas é `(contexto IS NULL OR empresa_id = contexto)`,
 * porque o login precisa ler os vínculos do usuário antes de existir empresa na sessão.
 * Com contexto definido elas JÁ são isoladas (testado em "com contexto A...").
 */
const SEM_CONTEXTO_PERMITIDO = new Set(["usuario_empresas", "usuario_permissoes"]);

describe("RLS no banco (ism_app), independente da aplicação", () => {
    /** Tabelas com empresa_id que o ism_app pode ler (ex.: logs_auditoria_arquivo é só do ism_owner). */
    async function tabelasLegiveis(): Promise<string[]> {
        const {rows} = await adminDb.execute<{ table_name: string }>(sql`
            SELECT c.relname AS table_name
            FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped
            WHERE n.nspname = 'public'
              AND c.relkind IN ('r', 'p')
              AND has_table_privilege('ism_app', c.oid, 'SELECT')
            ORDER BY 1
        `);
        return rows.map((r) => r.table_name);
    }

    async function contar(tabela: string, contexto: number | null, filtroEmpresa: number | null): Promise<number> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            if (contexto !== null) await client.query("SELECT set_config('app.empresa_id', $1, true)", [String(contexto)]);
            const where = filtroEmpresa !== null ? `WHERE empresa_id = ${Number(filtroEmpresa)}` : "";
            const {rows} = await client.query(`SELECT count(*)::int AS n FROM "${tabela}" ${where}`);
            return rows[0].n as number;
        } finally {
            await client.query("ROLLBACK").catch(() => undefined);
            client.release();
        }
    }

    it("a lista de tabelas verificadas inclui as de domínio", async () => {
        const tabelas = await tabelasLegiveis();
        for (const t of ["lancamentos", "parceiros", "contas_bancarias", "extratos", "kanban_cards"]) {
            assert.ok(tabelas.includes(t), `tabela ${t} fora da verificação de RLS`);
        }
    });

    it("com contexto A, nenhuma tabela com empresa_id mostra linha de B", async () => {
        const {A, B} = h.fx;
        const vazamentos: string[] = [];
        for (const tabela of await tabelasLegiveis()) {
            const n = await contar(tabela, A.id, B.id);
            if (n !== 0) vazamentos.push(`${tabela}: ${n} linha(s) de B visíveis no contexto de A`);
        }
        assert.deepEqual(vazamentos, []);
    });

    it("sem contexto, nenhuma tabela com empresa_id devolve linhas", async () => {
        const abertas: string[] = [];
        for (const tabela of await tabelasLegiveis()) {
            if (SEM_CONTEXTO_PERMITIDO.has(tabela)) continue;
            const n = await contar(tabela, null, null);
            if (n !== 0) abertas.push(`${tabela}: ${n} linha(s) visíveis sem app.empresa_id`);
        }
        assert.deepEqual(abertas, []);
    });

    it("INSERT com empresa_id de B no contexto de A é bloqueado (WITH CHECK)", async () => {
        const {A, B} = h.fx;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("SELECT set_config('app.empresa_id', $1, true)", [String(A.id)]);
            await assert.rejects(
                client.query("INSERT INTO filiais (empresa_id, nome) VALUES ($1, 'HACK-RLS')", [B.id]),
                /row-level security|violates/i,
            );
        } finally {
            await client.query("ROLLBACK").catch(() => undefined);
            client.release();
        }
    });
});