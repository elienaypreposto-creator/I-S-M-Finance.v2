/**
 * ISMF-16 — permissões por empresa, sem curinga, e rotas de operação do ISM
 * só para superadmin. Cobre os quatro cenários do card:
 *
 *  1. Não existe permissão `'*'`: nem no catálogo, nem gravável pela API, nem
 *     com efeito de curinga no withPermission.
 *  2. Permissão X na empresa 1 + vínculo sem permissão na empresa 2: ao trocar
 *     para a 2, `withPermission(X)` → 403.
 *  3. Admin da empresa 1 editando permissões de usuário da empresa 2 → 404.
 *  4. Não-superadmin chamando `POST /empresas` → 403 (e as demais rotas de
 *     operação do ISM).
 *
 * As rotas reais (empresas.ts, usuarios.ts) correm contra um Postgres em
 * memória (PGlite): o `db` de @workspace/db é um proxy que usa a transação
 * guardada no `tenantAls`, e o teste coloca ali um drizzle sobre o PGlite —
 * o mesmo caminho que o withTenantTxMiddleware usa em produção. O pool `pg`
 * real nunca abre conexão (a URL abaixo é só para o módulo carregar).
 */
import assert from "node:assert/strict";
import type {AddressInfo} from "node:net";
import type {Server} from "node:http";
import {after, before, beforeEach, describe, it} from "node:test";

process.env.DATABASE_URL ??= "postgres://ism_app:teste@127.0.0.1:9/ism_teste_inexistente";

const {PGlite} = await import("@electric-sql/pglite");
const {drizzle} = await import("drizzle-orm/pglite");
const schema = await import("@workspace/db/schema");
const {tenantAls} = await import("@workspace/db/tenant-als");
const {default: express} = await import("express");
const {default: empresasRouter} = await import("./empresas");
const {default: usuariosRouter} = await import("./usuarios");
const {errorHandler} = await import("../middlewares/error-handler");
const {withPermission} = await import("../middlewares/withPermission");
const {fetchPermissions} = await import("../services/permissions.service");
const {PERMISSOES_ADMIN, codigoPermissaoCatalogoSchema} = await import("../constants/permissoes");

type TestUser = {
    id: number;
    email: string;
    empresaId: number;
    permissions: string[];
    superadmin: boolean;
};

const DDL = `
    CREATE TABLE empresas (
        id serial PRIMARY KEY,
        razao_social text NOT NULL,
        nome_fantasia text,
        cnpj text UNIQUE,
        slug text NOT NULL UNIQUE,
        ativa boolean NOT NULL DEFAULT true,
        dpa_representante text,
        dpa_assinado_em timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE usuarios (
        id serial PRIMARY KEY,
        nome text NOT NULL,
        email text NOT NULL UNIQUE,
        cargo text,
        perfil_base text,
        telefone text,
        celular text,
        senha_hash text NOT NULL,
        senha_unica_hash text,
        senha_unica_utilizada boolean NOT NULL DEFAULT false,
        senha_reset_notificado_em timestamp,
        bloqueado boolean NOT NULL DEFAULT false,
        superadmin boolean NOT NULL DEFAULT false,
        ultimo_acesso timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE usuario_empresas (
        id serial PRIMARY KEY,
        usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        empresa_id integer NOT NULL REFERENCES empresas(id),
        papel text NOT NULL,
        ativo boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (usuario_id, empresa_id)
    );
    CREATE TABLE usuario_permissoes (
        id serial PRIMARY KEY,
        usuario_id integer NOT NULL REFERENCES usuarios(id),
        empresa_id integer NOT NULL REFERENCES empresas(id),
        codigo_permissao text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (usuario_id, empresa_id, codigo_permissao)
    );
`;

// Massa: empresas 1 e 2.
//  10 = superadmin (vínculo admin na 1)
//  20 = admin da empresa 1 (papel admin + admin:permissoes:conceder na 1)
//  30 = contador: lancamentos:editar na 1, vínculo membro SEM permissão na 2
//  40 = usuário só da empresa 2 (com uma permissão lá)
const SEED = `
    INSERT INTO empresas (id, razao_social, slug, dpa_representante, dpa_assinado_em) VALUES
        (1, 'Empresa Um Ltda', 'um', 'Rep Um', now()),
        (2, 'Empresa Dois Ltda', 'dois', 'Rep Dois', now());
    SELECT setval('empresas_id_seq', 2);
    INSERT INTO usuarios (id, nome, email, senha_hash, superadmin) VALUES
        (10, 'Super', 'super@teste.local', 'x', true),
        (20, 'Admin Um', 'admin1@teste.local', 'x', false),
        (30, 'Contador', 'contador@teste.local', 'x', false),
        (40, 'So Dois', 'dois@teste.local', 'x', false);
    SELECT setval('usuarios_id_seq', 40);
    INSERT INTO usuario_empresas (usuario_id, empresa_id, papel) VALUES
        (10, 1, 'admin'),
        (20, 1, 'admin'),
        (30, 1, 'membro'),
        (30, 2, 'membro'),
        (40, 2, 'membro');
    INSERT INTO usuario_permissoes (usuario_id, empresa_id, codigo_permissao) VALUES
        (20, 1, 'admin:permissoes:conceder'),
        (20, 1, 'financeiro:lancamentos:editar'),
        (30, 1, 'financeiro:lancamentos:editar'),
        (40, 2, 'financeiro:lancamentos:listar');
`;

const X = "financeiro:lancamentos:editar";

let pg: InstanceType<typeof PGlite>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let server: Server;
let baseUrl: string;

/** Mesmo efeito do withTenantTxMiddleware: `db` passa a ser a "tx" desta request. */
function comDb<T>(empresaId: number, fn: () => Promise<T>): Promise<T> {
    return tenantAls.run({empresaId, tx: testDb}, fn);
}

async function tokenDe(usuarioId: number, empresaId: number): Promise<TestUser> {
    const [u] = await pg.query<{email: string; superadmin: boolean}>(
        "SELECT email, superadmin FROM usuarios WHERE id = $1",
        [usuarioId],
    ).then((r) => r.rows);
    assert.ok(u, `usuário ${usuarioId} existe na massa`);
    const permissions = await comDb(empresaId, () => fetchPermissions(usuarioId, empresaId, u.superadmin));
    return {id: usuarioId, email: u.email, empresaId, permissions, superadmin: u.superadmin};
}

async function chamar(
    method: string,
    path: string,
    user: TestUser | null,
    body?: unknown,
): Promise<{status: number; json: any}> {
    const headers: Record<string, string> = {"content-type": "application/json"};
    if (user) headers["x-test-user"] = JSON.stringify(user);
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {status: res.status, json: text ? JSON.parse(text) : null};
}

async function codigosNoBanco(usuarioId: number, empresaId: number): Promise<string[]> {
    const {rows} = await pg.query<{codigo_permissao: string}>(
        "SELECT codigo_permissao FROM usuario_permissoes WHERE usuario_id = $1 AND empresa_id = $2 ORDER BY 1",
        [usuarioId, empresaId],
    );
    return rows.map((r) => r.codigo_permissao);
}

before(async () => {
    pg = new PGlite();
    await pg.exec(DDL);
    testDb = drizzle(pg, {schema});

    const app = express();
    app.use(express.json());
    // Substitui withAuth + withTenant + withTenantTxMiddleware.
    app.use((req, _res, next) => {
        const raw = req.header("x-test-user");
        if (!raw) {
            // Sem token, o withAuth real responde 401 antes de qualquer rota.
            _res.status(401).json({data: null, meta: null, errors: [{code: "UNAUTHORIZED"}]});
            return;
        }
        const user = JSON.parse(raw) as TestUser;
        req.user = user as typeof req.user;
        req.tenant = {empresaId: user.empresaId};
        tenantAls.run({empresaId: user.empresaId, tx: testDb}, () => next());
    });
    app.get("/probe-x", withPermission(X), (_req, res) => {
        res.json({ok: true});
    });
    app.use(empresasRouter);
    app.use(usuariosRouter);
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
    await pg.exec(`
        TRUNCATE usuario_permissoes, usuario_empresas, usuarios, empresas RESTART IDENTITY CASCADE;
    `);
    await pg.exec(SEED);
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pg.close();
    const {closeDbPools} = await import("@workspace/db");
    await closeDbPools();
});

describe("ISMF-16 cenário 1: não existe permissão '*'", () => {
    it("o catálogo concedível não tem '*', curinga nem as permissões de operação do ISM", () => {
        for (const codigo of PERMISSOES_ADMIN) {
            assert.ok(!codigo.includes("*"), `catálogo não pode ter curinga: ${codigo}`);
            assert.ok(!codigo.startsWith("admin:empresas:"), `operação do ISM não é concedível: ${codigo}`);
        }
        assert.equal(codigoPermissaoCatalogoSchema.safeParse("*").success, false);
        assert.equal(codigoPermissaoCatalogoSchema.safeParse("admin:empresas:criar").success, false);
    });

    it("PUT /usuarios/:id/permissoes recusa '*' (400) mesmo vindo de superadmin, sem gravar nada", async () => {
        const superadmin = await tokenDe(10, 1);
        const r = await chamar("PUT", "/usuarios/30/permissoes", superadmin, {permissoes: ["*"]});
        assert.equal(r.status, 400);
        assert.deepEqual(await codigosNoBanco(30, 1), [X]);
        const {rows} = await pg.query("SELECT 1 FROM usuario_permissoes WHERE codigo_permissao = '*'");
        assert.equal(rows.length, 0);
    });

    it("'*' no token de um não-superadmin não tem efeito de curinga", async () => {
        const forjado: TestUser = {
            id: 30,
            email: "contador@teste.local",
            empresaId: 2,
            permissions: ["*"],
            superadmin: false,
        };
        assert.equal((await chamar("GET", "/probe-x", forjado)).status, 403);
    });

    it("superadmin vem do campo usuarios.superadmin, não de linha em usuario_permissoes", async () => {
        const superadmin = await tokenDe(10, 2);
        assert.equal(superadmin.superadmin, true);
        assert.ok(!superadmin.permissions.includes("*"));
        assert.equal((await chamar("GET", "/probe-x", superadmin)).status, 200);
    });
});

describe("ISMF-16 cenário 2: permissão vale só na empresa onde foi concedida", () => {
    it("X na empresa 1 libera; ao trocar para a 2 (vínculo sem permissão) withPermission(X) → 403", async () => {
        const naUm = await tokenDe(30, 1);
        assert.ok(naUm.permissions.includes(X));
        assert.equal((await chamar("GET", "/probe-x", naUm)).status, 200);

        const naDois = await tokenDe(30, 2);
        assert.deepEqual(naDois.permissions, []);
        const r = await chamar("GET", "/probe-x", naDois);
        assert.equal(r.status, 403);
        assert.equal(r.json.errors[0].code, "FORBIDDEN");
    });

    it("o pacote automático de admin de empresa também não atravessa para outra empresa", async () => {
        await pg.exec("INSERT INTO usuario_empresas (usuario_id, empresa_id, papel) VALUES (20, 2, 'membro')");
        const naUm = await tokenDe(20, 1);
        assert.ok(naUm.permissions.includes("admin:usuarios:editar"));
        const naDois = await tokenDe(20, 2);
        assert.ok(!naDois.permissions.includes("admin:usuarios:editar"));
        assert.ok(!naDois.permissions.includes("admin:permissoes:conceder"));
    });
});

describe("ISMF-16 cenário 3: admin de uma empresa não alcança usuário de outra", () => {
    it("admin da empresa 1 editando permissões de usuário só da empresa 2 → 404 e nada muda", async () => {
        const admin1 = await tokenDe(20, 1);
        assert.ok(admin1.permissions.includes("admin:permissoes:conceder"));

        const put = await chamar("PUT", "/usuarios/40/permissoes", admin1, {permissoes: [X]});
        assert.equal(put.status, 404);
        assert.deepEqual(await codigosNoBanco(40, 2), ["financeiro:lancamentos:listar"]);
        assert.deepEqual(await codigosNoBanco(40, 1), []);

        const get = await chamar("GET", "/usuarios/40/permissoes", admin1);
        assert.equal(get.status, 404);

        const editar = await chamar("PUT", "/usuarios/40", admin1, {nome: "Trocado"});
        assert.equal(editar.status, 404);
    });

    it("controle: o mesmo admin edita usuário da própria empresa, só na empresa ativa", async () => {
        const admin1 = await tokenDe(20, 1);
        const put = await chamar("PUT", "/usuarios/30/permissoes", admin1, {permissoes: [X]});
        assert.equal(put.status, 200);
        assert.deepEqual(await codigosNoBanco(30, 1), [X]);
        assert.deepEqual(await codigosNoBanco(30, 2), []);
    });

    it("admin da empresa 1 não lista os vínculos de um usuário (rota de superadmin)", async () => {
        const admin1 = await tokenDe(20, 1);
        assert.equal((await chamar("GET", "/usuarios/40/empresas", admin1)).status, 403);
    });
});

describe("ISMF-16 cenário 4: operação do ISM exige superadmin", () => {
    const novaEmpresa = {razao_social: "Empresa Tres Ltda", dpa_representante: "Rep Tres"};

    it("não-superadmin chamando POST /empresas → 403, mesmo com todo o catálogo no token", async () => {
        const admin1 = await tokenDe(20, 1);
        const turbinado: TestUser = {
            ...admin1,
            // inclui os códigos antigos de empresas que um token velho poderia carregar
            permissions: [...PERMISSOES_ADMIN, "admin:empresas:listar", "admin:empresas:criar", "admin:empresas:editar"],
        };
        for (const user of [admin1, turbinado]) {
            const r = await chamar("POST", "/empresas", user, novaEmpresa);
            assert.equal(r.status, 403);
            assert.equal(r.json.errors[0].code, "FORBIDDEN");
            assert.equal((await chamar("GET", "/empresas", user)).status, 403);
            assert.equal((await chamar("PATCH", "/empresas/2", user, {ativa: false})).status, 403);
        }
        const {rows} = await pg.query<{n: number}>("SELECT count(*)::int AS n FROM empresas");
        assert.equal(rows[0]?.n, 2);
        const {rows: ativa} = await pg.query<{ativa: boolean}>("SELECT ativa FROM empresas WHERE id = 2");
        assert.equal(ativa[0]?.ativa, true);
    });

    it("sem autenticação → 401", async () => {
        assert.equal((await chamar("POST", "/empresas", null, novaEmpresa)).status, 401);
        assert.equal((await chamar("GET", "/empresas", null)).status, 401);
    });

    it("superadmin cria, lista e edita empresa", async () => {
        const superadmin = await tokenDe(10, 1);
        const criada = await chamar("POST", "/empresas", superadmin, novaEmpresa);
        assert.equal(criada.status, 201);
        assert.equal(criada.json.data.razao_social, "Empresa Tres Ltda");

        const lista = await chamar("GET", "/empresas", superadmin);
        assert.equal(lista.status, 200);
        assert.equal(lista.json.data.length, 3);

        const patch = await chamar("PATCH", `/empresas/${criada.json.data.id}`, superadmin, {ativa: false});
        assert.equal(patch.status, 200);
        assert.equal(patch.json.data.ativa, false);
    });
});
