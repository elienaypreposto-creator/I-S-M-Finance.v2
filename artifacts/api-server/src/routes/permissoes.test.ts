/**
 * ISMF-40 - finalizar conciliação, Kanban e leitura de lançamentos.
 * Sem a permissão a rota responde 403; com a permissão o middleware deixa passar (200).
 * A ligação real está no stack do router (codigoPermissao em withPermission).
 */
import assert from "node:assert/strict";
import type {AddressInfo} from "node:net";
import type {Server} from "node:http";
import {after, before, describe, it} from "node:test";

process.env.DATABASE_URL ??= "postgres://ism_app:teste@127.0.0.1:9/ism_teste_inexistente";

const {default: express} = await import("express");
const {withPermission} = await import("../middlewares/withPermission");
const {errorHandler} = await import("../middlewares/error-handler");
const {AppError} = await import("../utils/app-error");
const {PERM, PERMISSOES_ADMIN} = await import("../constants/permissoes");
const {default: lancamentosRouter} = await import("../domains/financial/lancamentos/router");
const {default: kanbanRouter} = await import("../routes/kanban");
const {default: conciliacoesRouter} = await import("../routes/conciliacoes");
const {
    finalizarConciliacaoNegada,
    MSG_FINALIZAR_CONCILIACAO_NEGADA,
} = await import("./conciliacao-finalizar-permissao");

type Rota = {method: string; path: string; permissao?: string};

type PassoRota = {handle: {codigoPermissao?: string}};
type CamadaRota = {
    route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: PassoRota[];
    };
};

function rotasDoRouter(router: {stack: CamadaRota[]}): Rota[] {
    const saida: Rota[] = [];
    for (const layer of router.stack) {
        if (!layer.route) continue;
        const method = Object.entries(layer.route.methods).find(([, ligado]) => ligado)?.[0]?.toUpperCase();
        const permissao = layer.route.stack.map((passo) => passo.handle.codigoPermissao).find(Boolean);
        saida.push({method: method ?? "", path: layer.route.path, permissao});
    }
    return saida;
}

type Usuario = {id: number; email: string; permissions: string[]; superadmin: boolean; empresaId: number};

let server: Server;
let baseUrl: string;

async function chamar(method: string, path: string, user: Usuario | null, body?: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            ...(user ? {"x-test-user": JSON.stringify(user)} : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {status: res.status, json: text ? JSON.parse(text) as {errors?: Array<{code: string}>} : null};
}

before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const raw = req.header("x-test-user");
        if (!raw) {
            res.status(401).json({data: null, meta: null, errors: [{code: "UNAUTHORIZED"}]});
            return;
        }
        req.user = JSON.parse(raw) as typeof req.user;
        next();
    });

    const leituras = [
        ["get", "/lancamentos", PERM.LANCAMENTOS_LISTAR],
        ["get", "/lancamentos/export", PERM.LANCAMENTOS_LISTAR],
        ["get", "/lancamentos/:id", PERM.LANCAMENTOS_LISTAR],
        ["get", "/kanban/cards", PERM.KANBAN_LISTAR],
        ["post", "/kanban/cards", PERM.KANBAN_CRIAR],
        ["patch", "/kanban/cards/:id", PERM.KANBAN_EDITAR],
        ["delete", "/kanban/cards/:id", PERM.KANBAN_EXCLUIR],
        ["get", "/kanban/usuarios", PERM.KANBAN_LISTAR],
    ] as const;
    for (const [method, path, permissao] of leituras) {
        app[method](path, withPermission(permissao), (_req, res) => {
            res.status(200).json({ok: true});
        });
    }
    app.post("/conciliacoes/:extrato_id/salvar", withPermission(PERM.CONCILIACAO_VINCULAR), (req, res, next) => {
        const finalizar = Boolean((req.body as {finalizar?: boolean} | undefined)?.finalizar);
        if (finalizarConciliacaoNegada(req.user, finalizar)) {
            next(new AppError(403, "FORBIDDEN", MSG_FINALIZAR_CONCILIACAO_NEGADA));
            return;
        }
        res.status(200).json({ok: true});
    });
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

const usuario = (permissions: string[], superadmin = false): Usuario => ({
    id: 1,
    email: "teste@ism.finance",
    permissions,
    superadmin,
    empresaId: 1,
});

describe("ISMF-40 catálogo e rotas reais", () => {
    it("o catálogo concede as quatro permissões de Kanban e listar lançamentos", () => {
        for (const codigo of [
            PERM.KANBAN_LISTAR,
            PERM.KANBAN_CRIAR,
            PERM.KANBAN_EDITAR,
            PERM.KANBAN_EXCLUIR,
            PERM.LANCAMENTOS_LISTAR,
            PERM.CONCILIACAO_CONCLUIR,
        ]) {
            assert.ok((PERMISSOES_ADMIN as readonly string[]).includes(codigo), codigo);
        }
    });

    it("GET de lançamentos exige listar; não existe GET /lancamentos/resumo", () => {
        const rotas = rotasDoRouter(lancamentosRouter as never);
        const espera: Rota[] = [
            {method: "GET", path: "/lancamentos", permissao: PERM.LANCAMENTOS_LISTAR},
            {method: "GET", path: "/lancamentos/export", permissao: PERM.LANCAMENTOS_LISTAR},
            {method: "GET", path: "/lancamentos/:id", permissao: PERM.LANCAMENTOS_LISTAR},
        ];
        for (const item of espera) {
            assert.ok(
                rotas.some((rota) => rota.method === item.method && rota.path === item.path && rota.permissao === item.permissao),
                `faltou ${item.method} ${item.path} = ${item.permissao}; stack=${JSON.stringify(rotas)}`,
            );
        }
        assert.equal(rotas.some((rota) => rota.path.includes("resumo")), false);
    });

    it("cada rota do Kanban exige a ação correspondente (mover usa editar)", () => {
        const rotas = rotasDoRouter(kanbanRouter as never);
        const espera: Rota[] = [
            {method: "GET", path: "/cards", permissao: PERM.KANBAN_LISTAR},
            {method: "POST", path: "/cards", permissao: PERM.KANBAN_CRIAR},
            {method: "PATCH", path: "/cards/:id", permissao: PERM.KANBAN_EDITAR},
            {method: "DELETE", path: "/cards/:id", permissao: PERM.KANBAN_EXCLUIR},
            {method: "GET", path: "/usuarios", permissao: PERM.KANBAN_LISTAR},
        ];
        for (const item of espera) {
            assert.ok(
                rotas.some((rota) => rota.method === item.method && rota.path === item.path && rota.permissao === item.permissao),
                `faltou ${item.method} ${item.path}; stack=${JSON.stringify(rotas)}`,
            );
        }
    });

    it("POST salvar continua exigindo vincular; finalizar sem concluir é negado", () => {
        const rotas = rotasDoRouter(conciliacoesRouter as never);
        assert.ok(
            rotas.some((rota) => rota.method === "POST" && rota.path === "/conciliacoes/:extrato_id/salvar" && rota.permissao === PERM.CONCILIACAO_VINCULAR),
            JSON.stringify(rotas.filter((rota) => rota.path.includes("salvar"))),
        );
        assert.equal(finalizarConciliacaoNegada({permissions: [PERM.CONCILIACAO_VINCULAR]}, true), true);
        assert.equal(finalizarConciliacaoNegada({permissions: [PERM.CONCILIACAO_VINCULAR, PERM.CONCILIACAO_CONCLUIR]}, true), false);
        assert.equal(finalizarConciliacaoNegada({permissions: [PERM.CONCILIACAO_VINCULAR]}, false), false);
        assert.equal(finalizarConciliacaoNegada({superadmin: true, permissions: []}, true), false);
    });
});

describe("ISMF-40 HTTP 403 sem permissão e 200 com permissão", () => {
    const casos: Array<{method: string; path: string; permissao: string; body?: unknown}> = [
        {method: "GET", path: "/lancamentos", permissao: PERM.LANCAMENTOS_LISTAR},
        {method: "GET", path: "/lancamentos/export", permissao: PERM.LANCAMENTOS_LISTAR},
        {method: "GET", path: "/lancamentos/9", permissao: PERM.LANCAMENTOS_LISTAR},
        {method: "GET", path: "/kanban/cards", permissao: PERM.KANBAN_LISTAR},
        {method: "POST", path: "/kanban/cards", permissao: PERM.KANBAN_CRIAR, body: {}},
        {method: "PATCH", path: "/kanban/cards/3", permissao: PERM.KANBAN_EDITAR, body: {coluna: "concluido"}},
        {method: "DELETE", path: "/kanban/cards/3", permissao: PERM.KANBAN_EXCLUIR},
        {method: "GET", path: "/kanban/usuarios", permissao: PERM.KANBAN_LISTAR},
    ];

    for (const caso of casos) {
        it(`${caso.method} ${caso.path} sem ${caso.permissao} → 403; com ela → 200`, async () => {
            const negado = await chamar(caso.method, caso.path, usuario(["dashboard:ver"]), caso.body);
            assert.equal(negado.status, 403);
            assert.equal(negado.json?.errors?.[0]?.code, "FORBIDDEN");

            const liberado = await chamar(caso.method, caso.path, usuario([caso.permissao]), caso.body);
            assert.equal(liberado.status, 200);
        });
    }

    it("salvar com finalizar=true exige concluir além de vincular", async () => {
        const semConcluir = await chamar(
            "POST",
            "/conciliacoes/4/salvar",
            usuario([PERM.CONCILIACAO_VINCULAR]),
            {finalizar: true, acoes: []},
        );
        assert.equal(semConcluir.status, 403);
        assert.equal(semConcluir.json?.errors?.[0]?.code, "FORBIDDEN");

        const soSalvar = await chamar(
            "POST",
            "/conciliacoes/4/salvar",
            usuario([PERM.CONCILIACAO_VINCULAR]),
            {finalizar: false, acoes: []},
        );
        assert.equal(soSalvar.status, 200);

        const concluir = await chamar(
            "POST",
            "/conciliacoes/4/salvar",
            usuario([PERM.CONCILIACAO_VINCULAR, PERM.CONCILIACAO_CONCLUIR]),
            {finalizar: true, acoes: []},
        );
        assert.equal(concluir.status, 200);
    });

    it("sem usuário → 401, antes da permissão", async () => {
        const res = await chamar("GET", "/lancamentos", null);
        assert.equal(res.status, 401);
    });
});
