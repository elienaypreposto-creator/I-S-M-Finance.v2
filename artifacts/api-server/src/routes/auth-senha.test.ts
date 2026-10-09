import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import type {AddressInfo} from "node:net";
import {after, before, describe, it} from "node:test";

/**
 * ISMF-27: login só com bcrypt, /auth/migrate-passwords removido e fluxo de reset com a
 * política de senha. Integração contra um banco migrado; requer ISM_AUTH_TEST=1 e DATABASE_URL.
 * O e-mail de reset cai num SMTP falso local, de onde o teste tira o token real.
 */
const habilitado = process.env.ISM_AUTH_TEST === "1" && !!process.env.DATABASE_URL;

type SmtpSink = {port: number; mensagens: string[]; close: () => Promise<void>};

function startSmtpSink(): Promise<SmtpSink> {
    const mensagens: string[] = [];
    const server = net.createServer((sock) => {
        sock.setEncoding("utf8");
        let buf = "";
        let emData = false;
        let data = "";
        sock.write("220 sink ESMTP\r\n");
        sock.on("data", (chunk: string) => {
            buf += chunk;
            let idx: number;
            while ((idx = buf.indexOf("\r\n")) >= 0) {
                const linha = buf.slice(0, idx);
                buf = buf.slice(idx + 2);
                if (emData) {
                    if (linha === ".") {
                        emData = false;
                        mensagens.push(data);
                        data = "";
                        sock.write("250 OK\r\n");
                    } else {
                        data += (linha.startsWith("..") ? linha.slice(1) : linha) + "\n";
                    }
                    continue;
                }
                const cmd = linha.slice(0, 4).toUpperCase();
                if (cmd === "EHLO") sock.write("250-sink\r\n250 AUTH PLAIN\r\n");
                else if (cmd === "AUTH") sock.write("235 OK\r\n");
                else if (cmd === "DATA") {
                    emData = true;
                    sock.write("354 go\r\n");
                } else if (cmd === "QUIT") sock.end("221 bye\r\n");
                else sock.write("250 OK\r\n");
            }
        });
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve({
                port: (server.address() as AddressInfo).port,
                mensagens,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}

/** Tira o token do link de redefinição (o corpo pode vir em quoted-printable). */
function extrairResetToken(mensagem: string): string | null {
    const decodificado = mensagem.replace(/=\n/g, "").replace(/=3D/gi, "=");
    const m = decodificado.match(/redefinir-senha\?token=([A-Za-z0-9._~%-]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

describe("ISMF-27: senha só bcrypt, endpoint de migração removido, reset com política", {skip: !habilitado && "defina ISM_AUTH_TEST=1 e DATABASE_URL (banco migrado)"}, () => {
    const sufixo = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
    const senhaLegada = "senha-legada-sha256-123";
    const emailSha = `ismf27.sha.${sufixo}@exemplo.test`;
    const emailReset = `ismf27.reset.${sufixo}@exemplo.test`;
    const emailAdmin = `ismf27.admin.${sufixo}@exemplo.test`;
    const senhaAdmin = crypto.randomUUID();

    let baseUrl = "";
    let server: import("node:http").Server;
    let smtp: SmtpSink;
    let mod: {
        db: typeof import("@workspace/db").db;
        closeDbPools: typeof import("@workspace/db").closeDbPools;
        schema: typeof import("@workspace/db/schema");
        eq: typeof import("drizzle-orm").eq;
        inArray: typeof import("drizzle-orm").inArray;
        signAccessToken: typeof import("../services/token.service").signAccessToken;
    };
    const ids = {sha: 0, reset: 0, admin: 0, empresa: 0};

    const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
        const res = await fetch(`${baseUrl}${path}`, {
            method: "POST",
            headers: {"Content-Type": "application/json", ...headers},
            body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as {errors?: {code: string}[]} | null;
        return {status: res.status, code: json?.errors?.[0]?.code ?? null};
    };

    before(async () => {
        process.env.HIBP_DISABLED = "true";
        smtp = await startSmtpSink();
        Object.assign(process.env, {
            SMTP_HOST: "127.0.0.1",
            SMTP_PORT: String(smtp.port),
            SMTP_USER: "sink",
            SMTP_PASS: "sink",
            SMTP_SECURE: "false",
        });

        const dbMod = await import("@workspace/db");
        const schema = await import("@workspace/db/schema");
        const {eq, inArray} = await import("drizzle-orm");
        const {signAccessToken} = await import("../services/token.service");
        mod = {db: dbMod.db, closeDbPools: dbMod.closeDbPools, schema, eq, inArray, signAccessToken};
        const {usuariosTable, empresasTable, usuarioEmpresasTable} = schema;

        const bcrypt = (await import("bcryptjs")).default;
        const agora = new Date();
        const [sha] = await mod.db
            .insert(usuariosTable)
            .values({
                nome: "Legado Sha",
                email: emailSha,
                senha_hash: crypto.createHash("sha256").update(senhaLegada, "utf8").digest("hex"),
                ultimo_acesso: agora,
            })
            .returning({id: usuariosTable.id});
        const [reset] = await mod.db
            .insert(usuariosTable)
            .values({
                nome: "Joana Prates",
                email: emailReset,
                senha_hash: await bcrypt.hash(crypto.randomUUID(), 4),
                ultimo_acesso: agora,
            })
            .returning({id: usuariosTable.id});
        const [admin] = await mod.db
            .insert(usuariosTable)
            .values({
                nome: "Admin Teste",
                email: emailAdmin,
                senha_hash: await bcrypt.hash(senhaAdmin, 4),
                ultimo_acesso: agora,
                superadmin: true,
            })
            .returning({id: usuariosTable.id});
        const [empresa] = await mod.db
            .insert(empresasTable)
            // Empresa ativa exige DPA aceito (constraint empresas_ativa_exige_dpa).
            .values({razao_social: `ISMF-27 ${sufixo}`, slug: `ismf27-${sufixo}`, dpa_representante: "Teste", dpa_assinado_em: agora})
            .returning({id: empresasTable.id});
        await mod.db
            .insert(usuarioEmpresasTable)
            .values({usuario_id: admin.id, empresa_id: empresa.id, papel: "admin", ativo: true});
        Object.assign(ids, {sha: sha.id, reset: reset.id, admin: admin.id, empresa: empresa.id});

        const app = (await import("../app")).default;
        server = app.listen(0, "127.0.0.1");
        await new Promise((r) => server.once("listening", r));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    });

    after(async () => {
        if (!mod) return;
        const {usuariosTable, empresasTable, usuarioEmpresasTable, refreshTokensTable} = mod.schema;
        const usuarios = [ids.sha, ids.reset, ids.admin].filter(Boolean);
        try {
            if (usuarios.length) {
                await mod.db.delete(usuarioEmpresasTable).where(mod.inArray(usuarioEmpresasTable.usuario_id, usuarios));
                await mod.db.delete(refreshTokensTable).where(mod.inArray(refreshTokensTable.usuario_id, usuarios));
                await mod.db.delete(usuariosTable).where(mod.inArray(usuariosTable.id, usuarios));
            }
            if (ids.empresa) await mod.db.delete(empresasTable).where(mod.eq(empresasTable.id, ids.empresa));
        } catch (err) {
            console.warn("[auth-senha.test] limpeza parcial:", err instanceof Error ? err.message : err);
        }
        // Se o before falhar antes do listen, não há server: não esperar o close.
        if (server) await new Promise((r) => server.close(r));
        await smtp?.close();
        await mod.closeDbPools();
        // Com REDIS_URL, rate limit/lockout abrem conexão: fecha para o processo terminar.
        await (await import("../lib/redis")).closeRedis();
    });

    it("hash SHA-256 legado não loga mais (401) e não é migrado para bcrypt", async () => {
        const r = await post("/auth/login", {email: emailSha, senha: senhaLegada});
        assert.equal(r.status, 401);
        assert.equal(r.code, "INVALID_CREDENTIALS");

        const {usuariosTable} = mod.schema;
        const [u] = await mod.db
            .select({senha_hash: usuariosTable.senha_hash})
            .from(usuariosTable)
            .where(mod.eq(usuariosTable.id, ids.sha));
        assert.match(u.senha_hash ?? "", /^[0-9a-f]{64}$/, "o login não pode regravar o hash legado");
    });

    it("login bcrypt com empresa emite sessão (200)", async () => {
        const res = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email: emailAdmin, senha: senhaAdmin}),
        });
        const json = (await res.json()) as {data?: {accessToken?: string; empresa_id?: number}; meta?: Record<string, unknown>};
        assert.equal(res.status, 200);
        assert.ok(json.data?.accessToken);
        assert.equal(json.data?.empresa_id, ids.empresa);
        assert.equal(json.meta?.passwordMigrated, undefined);
    });

    it("POST /auth/migrate-passwords não existe mais (404 mesmo para superadmin)", async () => {
        const token = await mod.signAccessToken({
            sub: String(ids.admin),
            email: emailAdmin,
            permissions: [],
            empresa_id: ids.empresa,
            superadmin: true,
        });
        const r = await post("/auth/migrate-passwords", {}, {Authorization: `Bearer ${token}`});
        assert.equal(r.status, 404);
    });

    it("esqueci a senha: sem FRONTEND_URL responde 500 CONFIGURATION_ERROR", async () => {
        const anterior = process.env.FRONTEND_URL;
        delete process.env.FRONTEND_URL;
        try {
            const r = await post("/auth/forgot-password", {email: emailReset});
            assert.equal(r.status, 500);
            assert.equal(r.code, "CONFIGURATION_ERROR");
        } finally {
            if (anterior !== undefined) process.env.FRONTEND_URL = anterior;
        }
    });

    it("esqueci a senha com FRONTEND_URL: e-mail com token real; política barra fraca/e-mail/nome e aceita forte", async () => {
        process.env.FRONTEND_URL = "http://localhost:5173";
        const antes = smtp.mensagens.length;
        const pedido = await post("/auth/forgot-password", {email: emailReset});
        assert.equal(pedido.status, 200);
        // O envio é assíncrono (resposta não espera o SMTP, anti-enumeração por tempo).
        for (let i = 0; i < 50 && smtp.mensagens.length === antes; i++) await new Promise((r) => setTimeout(r, 100));
        assert.equal(smtp.mensagens.length, antes + 1, "deveria ter enviado 1 e-mail de reset");

        const mensagem = smtp.mensagens[smtp.mensagens.length - 1];
        assert.ok(mensagem.includes("http://localhost:5173/redefinir-senha"), "link deve usar FRONTEND_URL");
        const resetToken = extrairResetToken(mensagem);
        assert.ok(resetToken, "token de reset não encontrado no e-mail");

        const fraca = await post("/auth/reset-password", {resetToken, novaSenha: "curta123"});
        assert.deepEqual(fraca, {status: 400, code: "WEAK_PASSWORD"});

        const comEmail = await post("/auth/reset-password", {resetToken, novaSenha: `x-${emailReset.split("@")[0]}-9`});
        assert.deepEqual(comEmail, {status: 400, code: "WEAK_PASSWORD"});

        const comNome = await post("/auth/reset-password", {resetToken, novaSenha: "Planalto-Prates-2026!"});
        assert.deepEqual(comNome, {status: 400, code: "WEAK_PASSWORD"});

        const forte = "cavalo-correto-bateria-grampo-91";
        const ok = await post("/auth/reset-password", {resetToken, novaSenha: forte});
        assert.equal(ok.status, 200);

        const {usuariosTable} = mod.schema;
        const [u] = await mod.db
            .select({senha_hash: usuariosTable.senha_hash})
            .from(usuariosTable)
            .where(mod.eq(usuariosTable.id, ids.reset));
        assert.match(u.senha_hash ?? "", /^\$2[aby]\$12\$/, "senha nova gravada em bcrypt custo 12");

        // Senha aceita no login (sem vínculo de empresa o login para em SEM_EMPRESA, não em 401).
        const login = await post("/auth/login", {email: emailReset, senha: forte});
        assert.notEqual(login.status, 401);
        assert.equal(login.code, "SEM_EMPRESA");
    });
});
