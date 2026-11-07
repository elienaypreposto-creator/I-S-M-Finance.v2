import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import {PERMISSOES_ADMIN} from "../../../../lib/db/src/permissoes-catalog.ts";
import {
    contarVisiveis,
    PERMISSOES_SEM_TELA,
    perfisBase,
    permissoesGranulares,
    todasPermissoes,
} from "./perfis-acesso.ts";

const catalogo = new Set<string>(PERMISSOES_ADMIN);

describe("tela de permissões", () => {
    it("só oferece códigos que a API aceita no PUT /usuarios/:id/permissoes", () => {
        const desconhecidas = todasPermissoes.filter((c) => !catalogo.has(c));
        assert.deepEqual(desconhecidas, []);
    });

    it("não repete código", () => {
        assert.equal(new Set(todasPermissoes).size, todasPermissoes.length);
    });

    it("Contábil/Fiscal pode ser concedido", () => {
        const relatorios = permissoesGranulares.find((g) => g.grupo === "Dashboard & Relatórios");
        assert.ok(relatorios?.itens.some((i) => i.codigo === "relatorios:contabil-fiscal"));
    });
});

describe("permissões sem tela", () => {
    it("ficam fora da tela mas continuam no catálogo da API", () => {
        for (const codigo of PERMISSOES_SEM_TELA) {
            assert.ok(catalogo.has(codigo), codigo);
            assert.ok(!todasPermissoes.includes(codigo), codigo);
        }
    });

    it("nenhum código-fonte da API ou do front confere essas permissões", () => {
        const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
        const pastas = [
            path.join(raiz, "artifacts/api-server/src"),
            path.join(raiz, "artifacts/ism-financeiro/src"),
        ];
        const ignorar = new Set([
            path.join(raiz, "artifacts/ism-financeiro/src/lib/perfis-acesso.ts"),
            fileURLToPath(import.meta.url),
        ]);
        const usos: string[] = [];
        const varrer = (dir: string) => {
            for (const entrada of fs.readdirSync(dir, {withFileTypes: true})) {
                const p = path.join(dir, entrada.name);
                if (entrada.isDirectory()) varrer(p);
                else if (/\.(ts|tsx)$/.test(entrada.name) && !ignorar.has(p)) {
                    const texto = fs.readFileSync(p, "utf8");
                    for (const codigo of PERMISSOES_SEM_TELA) {
                        if (texto.includes(`"${codigo}"`)) usos.push(`${path.relative(raiz, p)}: ${codigo}`);
                    }
                }
            }
        };
        pastas.forEach(varrer);
        assert.deepEqual(usos, [], "se passou a ser usada, tire de PERMISSOES_SEM_TELA e ponha na tela");
    });

    it("a contagem da janela ignora as escondidas", () => {
        assert.equal(contarVisiveis(["dashboard:ver", "relatorios:extrato"]), 1);
    });
});

describe("perfis padrão", () => {
    it("só usam permissões que aparecem na tela", () => {
        const visiveis = new Set(todasPermissoes);
        for (const [perfil, perms] of Object.entries(perfisBase)) {
            const fora = perms.filter((p) => !visiveis.has(p));
            assert.deepEqual(fora, [], `perfil ${perfil}`);
        }
    });

    it("Visualizador só tem permissão de leitura", () => {
        const escrita = perfisBase.Visualizador.filter((p) => !/:(listar|ver)$/.test(p));
        assert.deepEqual(escrita, []);
        assert.ok(perfisBase.Visualizador.includes("kanban:tarefas:listar"));
    });

    it("Contábil/Fiscal entra em Admin, Financeiro e Gestor; não no Visualizador", () => {
        assert.ok(perfisBase.Admin.includes("relatorios:contabil-fiscal"));
        assert.ok(perfisBase.Financeiro.includes("relatorios:contabil-fiscal"));
        assert.ok(perfisBase.Gestor.includes("relatorios:contabil-fiscal"));
        assert.ok(!perfisBase.Visualizador.includes("relatorios:contabil-fiscal"));
    });
});
