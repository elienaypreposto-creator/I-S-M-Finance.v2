/**
 * Perfil, senha e sessões da própria conta.
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import bcrypt from "bcryptjs";

process.env.HIBP_DISABLED = "true";
process.env.DATABASE_URL ??= "postgres://ism_app:teste@127.0.0.1:9/ism_teste_inexistente";

const {avaliarTrocaSenha, MSG_SENHA_RECUSADA, patchMeSchema} = await import("./me-conta");
const {criarSessoes, mascararIp, memoriaArmazem, rotuloDispositivo} = await import("../services/sessoes.service");

describe("PATCH /me", () => {
    it("rejeita e-mail, superadmin e qualquer campo fora de nome, telefone e cargo", () => {
        const fora = patchMeSchema.safeParse({
            nome: "Jose Testino",
            telefone: "61900000000",
            cargo: "Dev",
            email: "outro@exemplo.com",
            superadmin: true,
            bloqueado: false,
        });
        assert.equal(fora.success, false);

        const ok = patchMeSchema.safeParse({nome: "Jose Testino", telefone: " 61900000000 ", cargo: ""});
        assert.equal(ok.success, true);
        if (ok.success) {
            assert.equal(ok.data.nome, "Jose Testino");
            assert.equal(ok.data.telefone, "61900000000");
            assert.equal(ok.data.cargo, null);
            assert.equal("email" in ok.data, false);
        }
    });
});

describe("POST /me/senha", () => {
    const hash = bcrypt.hashSync("senha-atual-correta", 4);

    it("senha atual errada responde 400 sem dizer que a senha atual falhou", async () => {
        const r = await avaliarTrocaSenha({
            senhaAtual: "nao-e-esta",
            senhaNova: "uma frase bem longa e unica",
            senhaHash: hash,
            bloqueado: false,
            ctx: {email: "jose.testino@exemplo.com", nome: "Jose Testino"},
        });
        assert.equal(r.ok, false);
        if (r.ok) return;
        assert.equal(r.status, 400);
        assert.equal(r.code, "VALIDATION_ERROR");
        assert.equal(r.message, MSG_SENHA_RECUSADA);
        assert.equal(/atual|incorreta|inválida|bcrypt|hash/i.test(r.message), false);
    });

    it("senha fraca responde 400 WEAK_PASSWORD", async () => {
        const r = await avaliarTrocaSenha({
            senhaAtual: "senha-atual-correta",
            senhaNova: "curta",
            senhaHash: hash,
            bloqueado: false,
            ctx: {email: "jose.testino@exemplo.com", nome: "Jose Testino"},
        });
        assert.equal(r.ok, false);
        if (r.ok) return;
        assert.equal(r.status, 400);
        assert.equal(r.code, "WEAK_PASSWORD");
    });
});

describe("sessões", () => {
    it("encerrar a sessão de outra pessoa não encontra o registro", async () => {
        const svc = criarSessoes(memoriaArmazem());
        const sid = await svc.abrir({
            usuarioId: 1,
            tokenHash: "hash-da-pessoa-1",
            meta: {userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0", ip: "189.48.1.2"},
        });
        const resultado = await svc.encerrarDoUsuario(2, sid, "sid-da-pessoa-2");
        assert.equal(resultado, "ausente");
        const ainda = await svc.listar(1, sid);
        assert.equal(ainda.length, 1);
        assert.equal(ainda[0].atual, true);
    });

    it("trocar a senha derruba as outras sessões e mantém a atual", async () => {
        const svc = criarSessoes(memoriaArmazem());
        const atual = await svc.abrir({
            usuarioId: 7,
            tokenHash: "hash-atual",
            meta: {userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0", ip: "189.48.1.2"},
        });
        await svc.abrir({
            usuarioId: 7,
            tokenHash: "hash-iphone",
            meta: {userAgent: "Mozilla/5.0 (iPhone) Version/17.0 Safari/605", ip: "177.12.1.2"},
        });
        await svc.abrir({
            usuarioId: 7,
            tokenHash: "hash-mac",
            meta: {userAgent: "Mozilla/5.0 (Macintosh) Firefox/131.0", ip: "200.158.1.2"},
        });

        const encerradas = await svc.encerrarOutras(7, atual);
        assert.equal(encerradas, 2);
        const lista = await svc.listar(7, atual);
        assert.equal(lista.length, 1);
        assert.equal(lista[0].id, atual);
        assert.equal(lista[0].atual, true);
        assert.equal(await svc.revogada(atual), false);
    });

    it("mascara o IP e descreve o navegador", () => {
        assert.equal(mascararIp("189.48.10.20"), "189.48.•••.•••");
        assert.equal(
            rotuloDispositivo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36"),
            "Windows · Chrome 129",
        );
    });
});
