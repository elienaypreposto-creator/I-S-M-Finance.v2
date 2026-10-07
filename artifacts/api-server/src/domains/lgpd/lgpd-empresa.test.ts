import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {beforeEach, describe, it} from "node:test";
import {TABELAS_COM_EMPRESA_ID} from "../../lib/tenant-refs";
import {consumirDesafio, emitirDesafio, resetDesafiosEliminacao} from "./lgpd-desafio";
import {TABELAS_AUDITORIA, ident, tabelasRemovidasNaEliminacao} from "./lgpd-tables";
import {comporPacoteExportacao} from "./lgpd-pacote";
import {CAMPOS_ZERADOS_NA_ANONIMIZACAO, PRAZO_AUDITORIA_MESES, PRAZO_EXTRATO_ANOS} from "./lgpd-prazos";
import {assertDiscoCifrado} from "./lgpd-disco";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

describe("desafio de eliminação", () => {
    beforeEach(() => resetDesafiosEliminacao());

    it("exige a razão social exata e consome o desafio", () => {
        const desafio = emitirDesafio(7, "Empresa Teste Ltda", 1_000);
        const divergente = consumirDesafio(desafio.token, 7, "outro nome", 1_001);
        assert.equal(divergente.ok, false);
        if (!divergente.ok) assert.equal(divergente.code, "CONFIRMACAO_DIVERGENTE");

        const ok = consumirDesafio(desafio.token, 7, "Empresa Teste Ltda", 1_002);
        assert.equal(ok.ok, true);
        const segunda = consumirDesafio(desafio.token, 7, "Empresa Teste Ltda", 1_003);
        assert.equal(segunda.ok, false);
        if (!segunda.ok) assert.equal(segunda.code, "DESAFIO_AUSENTE");
    });

    it("recusa desafio de outra empresa sem consumir", () => {
        const desafio = emitirDesafio(7, "Empresa Teste Ltda", 1_000);
        const troca = consumirDesafio(desafio.token, 8, "Empresa Teste Ltda", 1_001);
        assert.equal(troca.ok, false);
        if (!troca.ok) assert.equal(troca.code, "EMPRESA_DIVERGENTE");
        const ok = consumirDesafio(desafio.token, 7, "Empresa Teste Ltda", 1_002);
        assert.equal(ok.ok, true);
    });

    it("expira", () => {
        const desafio = emitirDesafio(7, "Empresa Teste Ltda", 1_000);
        const expirado = consumirDesafio(desafio.token, 7, "Empresa Teste Ltda", desafio.expiraEm + 1);
        assert.equal(expirado.ok, false);
        if (!expirado.ok) assert.equal(expirado.code, "DESAFIO_EXPIRADO");
    });
});

describe("cobertura da eliminação", () => {
    it("apaga o domínio com empresa_id e só anonimiza auditoria", () => {
        const removidas = new Set(tabelasRemovidasNaEliminacao());
        for (const tabela of TABELAS_COM_EMPRESA_ID) {
            if (tabela === "logs_auditoria") {
                assert.equal(removidas.has(tabela), false);
            } else {
                assert.equal(removidas.has(tabela), true, tabela);
            }
        }
        assert.equal(removidas.has("usuario_empresas"), true);
        assert.equal(removidas.has("usuario_permissoes"), true);
        const ordem = tabelasRemovidasNaEliminacao();
        assert.ok(ordem.indexOf("itens_conciliacao_lancamentos") < ordem.indexOf("lancamentos"));
        assert.ok(ordem.indexOf("lancamentos") < ordem.indexOf("contas_bancarias"));
        assert.ok(ordem.indexOf("parceiros") < ordem.indexOf("centros_custos"));
        assert.ok(ordem.indexOf("centros_custos") < ordem.indexOf("departamentos"));
        assert.deepEqual(TABELAS_AUDITORIA, ["logs_auditoria", "logs_auditoria_arquivo"]);
        for (const tabela of TABELAS_AUDITORIA) {
            assert.equal(removidas.has(tabela), false);
        }
    });

    it("recusa identificador fora da lista", () => {
        assert.equal(ident("filiais"), '"filiais"');
        assert.throws(() => ident("filiais;drop"));
        assert.throws(() => ident("Empresas"));
    });
});

describe("disco cifrado", () => {
    it("em produção recusa arrancar sem a marca do volume", () => {
        const sair = (code: number): never => {
            throw new Error(String(code));
        };
        assert.throws(() => assertDiscoCifrado({NODE_ENV: "production", ISM_DISCO_CIFRADO: "0"}, sair), /1/);
        assert.throws(() => assertDiscoCifrado({NODE_ENV: "production"}, sair), /1/);
        assertDiscoCifrado({NODE_ENV: "production", ISM_DISCO_CIFRADO: "1"}, sair);
        assertDiscoCifrado({NODE_ENV: "development", ISM_DISCO_CIFRADO: "0"}, sair);
    });
});

describe("restore de backup", () => {
    it("elimina, restaura o dump cifrado e elimina de novo", async () => {
        const {createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes} = await import("node:crypto");
        const {PGlite} = await import("@electric-sql/pglite");
        const db = new PGlite();
        await db.exec(`
            CREATE TABLE empresas (
                id serial PRIMARY KEY,
                razao_social text NOT NULL
            );
            CREATE TABLE filiais (
                id serial PRIMARY KEY,
                empresa_id integer NOT NULL,
                nome text NOT NULL
            );
            CREATE TABLE logs_auditoria (
                id serial PRIMARY KEY,
                empresa_id integer NOT NULL,
                acao text NOT NULL,
                ip text,
                user_agent text,
                request_id text,
                usuario_id integer,
                token_api_id integer,
                detalhes jsonb
            );
        `);
        await db.exec(`
            INSERT INTO empresas (razao_social) VALUES ('Empresa Restore Ltda');
            INSERT INTO filiais (empresa_id, nome) VALUES (1, 'Matriz');
            INSERT INTO logs_auditoria (empresa_id, acao, ip, user_agent, request_id, usuario_id, token_api_id, detalhes)
            VALUES (1, 'ler', '203.0.113.10', 'ua', 'req-1', 7, 3, '{"email":"titular@example.com"}'::jsonb);
        `);

        const dump = `
            INSERT INTO empresas (id, razao_social) VALUES (1, 'Empresa Restore Ltda');
            INSERT INTO filiais (id, empresa_id, nome) VALUES (1, 1, 'Matriz');
            INSERT INTO logs_auditoria (id, empresa_id, acao, ip, user_agent, request_id, usuario_id, token_api_id, detalhes)
            VALUES (1, 1, 'ler', '203.0.113.10', 'ua', 'req-1', 7, 3, '{"email":"titular@example.com"}'::jsonb);
        `;
        const salt = randomBytes(8);
        const senha = "senha-do-teste";
        const material = pbkdf2Sync(senha, salt, 200_000, 48, "sha256");
        const cifra = createCipheriv("aes-256-cbc", material.subarray(0, 32), material.subarray(32, 48));
        const cifrado = Buffer.concat([
            Buffer.from("Salted__"),
            salt,
            cifra.update(dump, "utf8"),
            cifra.final(),
        ]);
        assert.equal(cifrado.subarray(0, 8).toString("utf8"), "Salted__");
        assert.equal(cifrado.includes(Buffer.from("titular@example.com")), false);
        assert.equal(cifrado.includes(Buffer.from("Matriz")), false);

        const zerar = CAMPOS_ZERADOS_NA_ANONIMIZACAO.map((campo) => `${campo} = NULL`).join(", ");
        await db.exec(`
            UPDATE logs_auditoria
            SET ${zerar}, detalhes = '{"anonimizado":true}'::jsonb
            WHERE empresa_id = 1;
            DELETE FROM filiais WHERE empresa_id = 1;
            DELETE FROM empresas WHERE id = 1;
        `);
        const aposEliminar = await db.query<{n: number; ip: string | null; anon: string | null}>(
            `SELECT
                (SELECT count(*)::int FROM filiais WHERE empresa_id = 1) AS n,
                (SELECT ip FROM logs_auditoria WHERE empresa_id = 1) AS ip,
                (SELECT detalhes->>'anonimizado' FROM logs_auditoria WHERE empresa_id = 1) AS anon`,
        );
        assert.equal(Number(aposEliminar.rows[0].n), 0);
        assert.equal(aposEliminar.rows[0].ip, null);
        assert.equal(aposEliminar.rows[0].anon, "true");

        const corpo = cifrado.subarray(16);
        const saltLido = cifrado.subarray(8, 16);
        const materialLido = pbkdf2Sync(senha, saltLido, 200_000, 48, "sha256");
        const decifra = createDecipheriv("aes-256-cbc", materialLido.subarray(0, 32), materialLido.subarray(32, 48));
        const restaurado = Buffer.concat([decifra.update(corpo), decifra.final()]).toString("utf8");
        await db.exec(`
            TRUNCATE filiais, logs_auditoria, empresas RESTART IDENTITY;
            ${restaurado}
        `);
        const aposRestore = await db.query<{nome: string; ip: string}>(
            `SELECT f.nome, l.ip
             FROM filiais f
             JOIN logs_auditoria l ON l.empresa_id = f.empresa_id`,
        );
        assert.equal(aposRestore.rows[0].nome, "Matriz");
        assert.equal(aposRestore.rows[0].ip, "203.0.113.10");

        await db.exec(`
            UPDATE logs_auditoria
            SET ${zerar}, detalhes = '{"anonimizado":true}'::jsonb
            WHERE empresa_id = 1;
            DELETE FROM filiais WHERE empresa_id = 1;
            DELETE FROM empresas WHERE id = 1;
        `);
        const segunda = await db.query<{filiais: number; empresas: number; anon: string}>(
            `SELECT
                (SELECT count(*)::int FROM filiais) AS filiais,
                (SELECT count(*)::int FROM empresas) AS empresas,
                (SELECT detalhes->>'anonimizado' FROM logs_auditoria) AS anon`,
        );
        assert.equal(Number(segunda.rows[0].filiais), 0);
        assert.equal(Number(segunda.rows[0].empresas), 0);
        assert.equal(segunda.rows[0].anon, "true");
        await db.close();
    });
});

describe("pacote de exportação", () => {
    it("gera JSON legível com todas as tabelas e sem segredo", () => {
        const tabelas: Record<string, Record<string, unknown>[]> = {};
        for (const nome of tabelasRemovidasNaEliminacao()) {
            tabelas[nome] = [{id: 1, empresa_id: 9, nome: `linha-${nome}`}];
        }
        tabelas.tokens_api = [{id: 1, empresa_id: 9, token_hash: "segredo-token", descricao: "api"}];
        for (const nome of TABELAS_AUDITORIA) {
            tabelas[nome] = [{id: 2, empresa_id: 9, ip: "203.0.113.9", acao: "ler", detalhes: {email: "a@b.c"}}];
        }
        tabelas.extratos = [{
            id: 4,
            empresa_id: 9,
            arquivo_nome: "jan.ofx",
            arquivo_hash: "abc",
            periodo_inicio: "2024-01-01",
            periodo_fim: "2024-01-31",
        }];
        tabelas.extrato_linhas = [
            {id: 8, empresa_id: 9, extrato_id: 4, descricao: "PIX MARIA", valor: "10.00"},
            {id: 9, empresa_id: 9, extrato_id: 99, descricao: "outra empresa", valor: "1.00"},
        ];

        const pacote = comporPacoteExportacao({
            empresa: {id: 9, razao_social: "Empresa Teste Ltda", cnpj: "00000000000191"},
            tabelas,
            usuarios: [{id: 3, nome: "Ana", email: "ana@example.com", senha_hash: "nao-pode"}],
            geradoEm: "2026-10-05T18:00:00.000Z",
        });

        const texto = JSON.stringify(pacote, null, 2);
        const lido = JSON.parse(texto) as typeof pacote;
        assert.equal(lido.versao, 1);
        assert.equal(lido.empresa.razao_social, "Empresa Teste Ltda");
        for (const nome of tabelasRemovidasNaEliminacao()) {
            assert.ok(Array.isArray(lido.tabelas[nome]), nome);
            assert.equal(lido.tabelas[nome].length > 0, true, nome);
        }
        assert.equal("token_hash" in lido.tabelas.tokens_api[0], false);
        assert.equal(JSON.stringify(lido).includes("segredo-token"), false);
        assert.equal(JSON.stringify(lido).includes("nao-pode"), false);
        assert.equal(lido.extratos_arquivos.length, 1);
        assert.equal(lido.extratos_arquivos[0].arquivo_nome, "jan.ofx");
        assert.equal(lido.extratos_arquivos[0].linhas.length, 1);
        assert.equal(lido.extratos_arquivos[0].linhas[0].descricao, "PIX MARIA");
        assert.match(texto, /Empresa Teste Ltda/);
    });
});

describe("eliminação sem residual", () => {
    it("zera o domínio e só deixa auditoria anonimizada", () => {
        const empresaId = 9;
        const log = {
            empresa_id: empresaId,
            ip: "203.0.113.10",
            user_agent: "ua",
            request_id: "req",
            usuario_id: 3,
            token_api_id: 1,
            detalhes: {email: "titular@example.com"},
            acao: "ler",
        };
        const anon: Record<string, unknown> = {...log, detalhes: {anonimizado: true}};
        for (const campo of CAMPOS_ZERADOS_NA_ANONIMIZACAO) anon[campo] = null;

        assert.equal(anon.empresa_id, empresaId);
        assert.equal(anon.ip, null);
        assert.equal(anon.user_agent, null);
        assert.equal(anon.request_id, null);
        assert.equal(anon.usuario_id, null);
        assert.equal(anon.token_api_id, null);
        assert.equal(anon.acao, "ler");
        assert.deepEqual(anon.detalhes, {anonimizado: true});
        assert.equal(tabelasRemovidasNaEliminacao().includes("logs_auditoria"), false);
        assert.equal(tabelasRemovidasNaEliminacao().includes("logs_auditoria_arquivo"), false);

        const fonte = readFileSync(new URL("./lgpd-empresa.ts", import.meta.url), "utf8");
        assert.match(fonte, /CAMPOS_ZERADOS_NA_ANONIMIZACAO/);
        assert.equal(/DELETE\s+FROM\s+logs_auditoria/.test(fonte), false);
        assert.match(fonte, /UPDATE \$\{sql\.raw\(ident\(tabela\)\)\}/);
    });
});

describe("inventário e documentos no git", () => {
    it("o prazo do job é o prazo escrito no inventário", () => {
        const inventario = readFileSync(path.join(raiz, "docs/lgpd-inventario.md"), "utf8");
        assert.match(inventario, /Versão 1\.0/);
        assert.match(inventario, new RegExp(`PRAZO_EXTRATO_ANOS\` = ${PRAZO_EXTRATO_ANOS} anos`));
        assert.match(inventario, new RegExp(`PRAZO_AUDITORIA_MESES\` = ${PRAZO_AUDITORIA_MESES} meses`));
        const job = readFileSync(new URL("../../jobs/retencao-lgpd.ts", import.meta.url), "utf8");
        assert.match(job, /PRAZO_EXTRATO_ANOS/);
        assert.equal(/ANOS_RETENCAO_EXTRATO\s*=\s*5/.test(job), false);
        const auditoria = readFileSync(new URL("../../jobs/arquivar-auditoria.ts", import.meta.url), "utf8");
        assert.match(auditoria, /PRAZO_AUDITORIA_MESES/);
    });

    it("os artefactos organizacionais existem e não estão ignorados", () => {
        const ficheiros = [
            "docs/lgpd-inventario.md",
            "docs/lgpd/dpa-modelo.md",
            "docs/lgpd/encarregado.md",
            "docs/lgpd/plano-incidente.md",
            "docs/lgpd/registro-operacoes-tratamento.md",
            "docs/lgpd/politica-privacidade.md",
            "docs/lgpd/termos-de-uso.md",
        ];
        for (const ficheiro of ficheiros) {
            const texto = readFileSync(path.join(raiz, ficheiro), "utf8");
            assert.ok(texto.length > 200, ficheiro);
            const ignorado = spawnSync("git", ["check-ignore", "-q", ficheiro], {cwd: raiz});
            assert.notEqual(ignorado.status, 0, ficheiro);
        }
        const encarregado = readFileSync(path.join(raiz, "docs/lgpd/encarregado.md"), "utf8");
        assert.match(encarregado, /encarregado@ism\.finance/);
        const workflow = readFileSync(path.join(raiz, ".github/workflows/main.yml"), "utf8");
        assert.match(workflow, /lgpd-cifrar-backup\.sh/);
        assert.match(workflow, /lgpd-volume-luks\.sh/);
        assert.equal(workflow.includes("ISM_DISCO_CIFRADO=0"), false);
        assert.equal(/pg_dump.*\.sql"/.test(workflow), false);
        const luks = readFileSync(path.join(raiz, "scripts/lgpd-volume-luks.sh"), "utf8");
        assert.match(luks, /luksFormat/);
        assert.match(luks, /luksOpen/);
        assert.match(luks, /DISCO_CIFRADO=1/);
        const dpa = readFileSync(path.join(raiz, "docs/lgpd/dpa-modelo.md"), "utf8");
        assert.match(dpa, /Volume LUKS2 do Postgres/);
        assert.match(dpa, /admin@ism\.finance/);
        assert.match(dpa, /2026-10-05/);
        assert.equal(dpa.includes("Não está assinada"), false);
        const disco = readFileSync(new URL("./lgpd-disco.ts", import.meta.url), "utf8");
        assert.match(disco, /sair\(1\)/);
        const plano = readFileSync(path.join(raiz, "docs/lgpd/plano-incidente.md"), "utf8");
        assert.match(plano, /72 horas/);
        assert.match(plano, /2026-10-05/);
        assert.match(plano, /admin@ism\.finance/);
        assert.equal(plano.includes("não houver encarregado nomeado"), false);
    });
});
