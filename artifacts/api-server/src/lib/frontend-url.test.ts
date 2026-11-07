/**
 * Falta de FRONTEND_URL: o cliente recebe 500 genérico e o log da API diz o
 * que falta; o boot avisa antes de alguém tentar criar usuário.
 */
import assert from "node:assert/strict";
import type {AddressInfo} from "node:net";
import type {Server} from "node:http";
import {after, before, describe, it} from "node:test";

process.env.DATABASE_URL ??= "postgres://ism_app:teste@127.0.0.1:9/ism_teste_inexistente";

const {default: express} = await import("express");
const {requestId} = await import("../middlewares/request-id");
const {default: usuariosRouter} = await import("../routes/usuarios");
const {avisoBootFrontendUrl, frontendUrlDefinida, logFrontendUrlAusente} = await import("./frontend-url");

describe("FRONTEND_URL", () => {
    it("ausente ou em branco conta como não definida", () => {
        assert.equal(frontendUrlDefinida({}), null);
        assert.equal(frontendUrlDefinida({FRONTEND_URL: "  "}), null);
        assert.equal(frontendUrlDefinida({FRONTEND_URL: " https://app.exemplo.com "}), "https://app.exemplo.com");
    });

    it("boot avisa só quando falta", () => {
        assert.match(avisoBootFrontendUrl({}) ?? "", /FRONTEND_URL não definida.*POST \/usuarios/);
        assert.equal(avisoBootFrontendUrl({FRONTEND_URL: "https://app.exemplo.com"}), null);
    });

    it("mensagem de log diz o que falta e leva o request id", () => {
        const msg = logFrontendUrlAusente("criação de usuário (POST /usuarios)", "req-12345678");
        assert.match(msg, /FRONTEND_URL não definida/);
        assert.match(msg, /Defina FRONTEND_URL no ambiente da API/);
        assert.match(msg, /request_id=req-12345678/);
    });
});

describe("POST /usuarios sem FRONTEND_URL", () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
        const app = express();
        app.use(requestId);
        app.use(express.json());
        app.use((req, _res, next) => {
            req.user = {
                id: 1,
                email: "admin@ism.finance",
                permissions: ["admin:usuarios:criar"],
                superadmin: false,
                empresaId: 1,
            } as typeof req.user;
            next();
        });
        app.use(usuariosRouter);
        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", () => resolve());
        });
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("responde 500 genérico e registra no log o que falta", async () => {
        const anterior = process.env.FRONTEND_URL;
        delete process.env.FRONTEND_URL;
        const logs: string[] = [];
        const errorOriginal = console.error;
        console.error = (...args: unknown[]) => {
            logs.push(args.map(String).join(" "));
        };
        try {
            const res = await fetch(`${baseUrl}/usuarios`, {
                method: "POST",
                headers: {"content-type": "application/json", "x-request-id": "teste-frontend-url-1"},
                body: JSON.stringify({nome: "Fulano de Tal", email: "fulano@exemplo.com", perfil_base: "Visualizador"}),
            });
            const corpo = await res.text();
            assert.equal(res.status, 500);
            assert.match(corpo, /CONFIGURATION_ERROR/);
            assert.match(corpo, /Serviço temporariamente indisponível\. Contacte o administrador\./);
            assert.doesNotMatch(corpo, /FRONTEND_URL/, "o nome da variável não vai para o cliente");
            assert.ok(
                logs.some((l) => /FRONTEND_URL não definida: criação de usuário/.test(l) && l.includes("teste-frontend-url-1")),
                JSON.stringify(logs),
            );
        } finally {
            console.error = errorOriginal;
            if (anterior !== undefined) process.env.FRONTEND_URL = anterior;
        }
    });
});
