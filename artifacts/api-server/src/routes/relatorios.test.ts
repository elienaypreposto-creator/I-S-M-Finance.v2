/**
 * Extrato da conta (GET /relatorios/contabil-fiscal/movimentacoes):
 * permissão do Contábil/Fiscal, 403 sem ela e validação dos parâmetros antes do banco.
 * O cálculo (saldo corrido, conciliados) está em utils/extrato-conta.test.ts; a leitura
 * no Postgres é coberta pela esteira (isolamento entre empresas varre a rota nova).
 */
import assert from "node:assert/strict";
import type {AddressInfo} from "node:net";
import type {Server} from "node:http";
import {after, before, describe, it} from "node:test";

process.env.DATABASE_URL ??= "postgres://ism_app:teste@127.0.0.1:9/ism_teste_inexistente";

const {default: express} = await import("express");
const {errorHandler} = await import("../middlewares/error-handler");
const {PERM} = await import("../constants/permissoes");
const {default: relatoriosRouter} = await import("./relatorios");

type Usuario = {id: number; email: string; permissions: string[]; superadmin: boolean; empresaId: number};
type CamadaRota = {
    route?: {path: string; methods: Record<string, boolean>; stack: Array<{handle: {codigoPermissao?: string}}>};
};

const ROTA = "/relatorios/contabil-fiscal/movimentacoes";

let server: Server;
let baseUrl: string;

const usuario = (permissions: string[]): Usuario => ({
    id: 1,
    email: "teste@ism.finance",
    permissions,
    superadmin: false,
    empresaId: 1,
});

async function chamar(query: string, user: Usuario) {
    const res = await fetch(`${baseUrl}${ROTA}${query}`, {
        headers: {"x-test-user": JSON.stringify(user)},
    });
    const text = await res.text();
    return {status: res.status, json: text ? JSON.parse(text) as {errors?: Array<{code: string; message: string}>} : null};
}

before(async () => {
    const app = express();
    app.use((req, _res, next) => {
        const raw = req.header("x-test-user");
        if (raw) {
            const user = JSON.parse(raw) as Usuario;
            req.user = user as unknown as typeof req.user;
            req.tenant = {empresaId: user.empresaId} as typeof req.tenant;
        }
        next();
    });
    app.use(relatoriosRouter);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /relatorios/contabil-fiscal/movimentacoes", () => {
    it("exige a permissão do relatório Contábil/Fiscal", () => {
        const rota = (relatoriosRouter as unknown as {stack: CamadaRota[]}).stack
            .map((l) => l.route)
            .find((r) => r?.path === ROTA && r.methods.get);
        assert.ok(rota, "rota não registrada");
        const permissao = rota.stack.map((p) => p.handle.codigoPermissao).find(Boolean);
        assert.equal(permissao, PERM.RELATORIOS_CONTABIL);
    });

    it("sem a permissão → 403", async () => {
        const r = await chamar("?conta_id=1&mes=10&ano=2026", usuario(["dashboard:ver"]));
        assert.equal(r.status, 403);
        assert.equal(r.json?.errors?.[0]?.code, "FORBIDDEN");
    });

    const invalidos: Array<[string, string]> = [
        ["sem período", "?conta_id=1"],
        ["data inexistente", "?conta_id=1&data_inicio=2026-02-30&data_fim=2026-03-10"],
        ["intervalo invertido", "?data_inicio=2026-10-10&data_fim=2026-10-01"],
        ["conta inválida", "?conta_id=abc&mes=10&ano=2026"],
    ];
    for (const [nome, query] of invalidos) {
        it(`${nome} → 400 sem consultar o banco`, async () => {
            const r = await chamar(query, usuario([PERM.RELATORIOS_CONTABIL]));
            assert.equal(r.status, 400, JSON.stringify(r.json));
            assert.equal(r.json?.errors?.[0]?.code, "VALIDATION_ERROR");
        });
    }
});
