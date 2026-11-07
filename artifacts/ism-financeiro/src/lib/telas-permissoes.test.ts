import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import {PERMISSOES_ADMIN} from "../../../../lib/db/src/permissoes-catalog.ts";
import {perfisBase, todasPermissoes} from "./perfis-acesso.ts";
import {PERMISSAO_TELA, permissaoDaTela, telaLiberada} from "./telas-permissoes.ts";

const comPerfil = (perfil: string) => (codigo: string) => perfisBase[perfil]!.includes(codigo);
const relatorios = Object.keys(PERMISSAO_TELA).filter((url) => url.startsWith("/relatorios/"));

describe("permissão por tela", () => {
    it("toda permissão de tela existe na API e pode ser concedida na tela de permissões", () => {
        const catalogo = new Set<string>(PERMISSOES_ADMIN);
        for (const [url, codigo] of Object.entries(PERMISSAO_TELA)) {
            assert.ok(catalogo.has(codigo), `${url}: ${codigo} fora do catálogo`);
            assert.ok(todasPermissoes.includes(codigo), `${url}: ${codigo} não aparece na tela de permissões`);
        }
    });

    it("cada relatório exige a permissão que a rota da API confere", () => {
        assert.equal(permissaoDaTela("/relatorios/fechamento-mensal"), "relatorios:financeiro");
        assert.equal(permissaoDaTela("/relatorios/contabil-fiscal"), "relatorios:contabil-fiscal");
        assert.equal(permissaoDaTela("/relatorios/dre"), "relatorios:dre");
        assert.equal(permissaoDaTela("/relatorios/fluxo-caixa"), "relatorios:fluxo-caixa-mensal");
        assert.equal(permissaoDaTela("/relatorios/metas"), "relatorios:metas");
    });

    it("Financeiro e Gestor não veem Fechamento Mensal; Admin vê todos; Visualizador nenhum", () => {
        assert.equal(telaLiberada("/relatorios/fechamento-mensal", comPerfil("Financeiro")), false);
        assert.equal(telaLiberada("/relatorios/fechamento-mensal", comPerfil("Gestor")), false);
        assert.equal(telaLiberada("/relatorios/dre", comPerfil("Financeiro")), true);
        assert.equal(telaLiberada("/relatorios/contabil-fiscal", comPerfil("Gestor")), true);
        assert.ok(relatorios.every((url) => telaLiberada(url, comPerfil("Admin"))));
        assert.ok(relatorios.every((url) => !telaLiberada(url, comPerfil("Visualizador"))));
    });

    it("tela sem entrada fica aberta", () => {
        assert.equal(telaLiberada("/", () => false), true);
        assert.equal(telaLiberada("/cadastros/departamentos", () => false), true);
    });

    it("toda rota privada do App.tsx tem permissão ou é uma das telas abertas", () => {
        const abertas = new Set(["/", "/cadastros/departamentos", "/configuracoes/filiais"]);
        const app = fs.readFileSync(
            path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../App.tsx"),
            "utf8",
        );
        const semRegra: string[] = [];
        let rotas = 0;
        for (const m of app.matchAll(/<PrivateRoute\s+([^>]*?)\/>/gs)) {
            const attrs = m[1]!;
            const rota = /path="([^"]+)"/.exec(attrs)?.[1];
            if (!rota) continue;
            rotas++;
            const explicita = /permission=|superadminOnly/.test(attrs);
            if (!explicita && !permissaoDaTela(rota) && !abertas.has(rota)) semRegra.push(rota);
        }
        assert.ok(rotas >= 15, `só ${rotas} rotas lidas do App.tsx`);
        assert.deepEqual(semRegra, []);
    });
});
