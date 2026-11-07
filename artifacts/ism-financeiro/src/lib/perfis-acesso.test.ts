import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import {PERMISSOES_ADMIN} from "../../../../lib/db/src/permissoes-catalog.ts";
import {PERM} from "./permissoes.ts";
import {PERMISSAO_TELA} from "./telas-permissoes.ts";
import {
    contarVisiveis,
    PERMISSOES_SEM_TELA,
    PERMISSOES_SO_PORTA_DE_TELA,
    PERMISSOES_USADAS_FORA_DA_JANELA,
    perfisBase,
    permissoesGranulares,
    todasPermissoes,
} from "./perfis-acesso.ts";

const catalogo = new Set<string>(PERMISSOES_ADMIN);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const API_SRC = path.join(RAIZ, "artifacts/api-server/src");
const WEB_SRC = path.join(RAIZ, "artifacts/ism-financeiro/src");

function arquivosTs(dir: string): string[] {
    const out: string[] = [];
    for (const entrada of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, entrada.name);
        if (entrada.isDirectory()) out.push(...arquivosTs(p));
        else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) out.push(p);
    }
    return out;
}

/** PERM.NOME → código, lido do arquivo de constantes da API (sem importar zod/@workspace). */
function permDaApi(): Record<string, string> {
    const texto = fs.readFileSync(path.join(API_SRC, "constants/permissoes.ts"), "utf8");
    const bloco = texto.slice(texto.indexOf("export const PERM = {"), texto.indexOf("} as const;"));
    return Object.fromEntries([...bloco.matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

/**
 * Permissões que a API confere de fato: argumento de withPermission(...) e
 * segundo argumento de hasPermission(...), como literal ou PERM.NOME.
 */
function permissoesConferidasNaApi(): Map<string, string[]> {
    const perm = permDaApi();
    const usos = new Map<string, string[]>();
    const re = /(?:withPermission\(\s*|hasPermission\([^,()]*(?:\([^()]*\))?[^,()]*,\s*)(?:"([^"]+)"|PERM\.(\w+))/g;
    for (const arquivo of arquivosTs(API_SRC)) {
        if (arquivo.endsWith(path.join("middlewares", "withPermission.ts"))) continue; // definição e JSDoc
        const texto = fs.readFileSync(arquivo, "utf8");
        for (const m of texto.matchAll(re)) {
            const codigo = m[1] ?? perm[m[2]];
            assert.ok(codigo, `${path.relative(RAIZ, arquivo)}: PERM.${m[2]} desconhecida`);
            usos.set(codigo, [...(usos.get(codigo) ?? []), path.relative(RAIZ, arquivo)]);
        }
    }
    return usos;
}

/** Permissões que o front confere: porta das telas e todo PERM.NOME fora do arquivo de constantes. */
function permissoesConferidasNoFront(): Set<string> {
    const usadas = new Set<string>(Object.values(PERMISSAO_TELA));
    const constantes = path.join(WEB_SRC, "lib/permissoes.ts");
    for (const arquivo of arquivosTs(WEB_SRC)) {
        if (arquivo === constantes) continue;
        const texto = fs.readFileSync(arquivo, "utf8");
        for (const m of texto.matchAll(/\bPERM\.(\w+)/g)) {
            const codigo = (PERM as Record<string, string>)[m[1]];
            assert.ok(codigo, `${path.relative(RAIZ, arquivo)}: PERM.${m[1]} desconhecida`);
            usadas.add(codigo);
        }
    }
    return usadas;
}

describe("tela de permissões", () => {
    it("só oferece códigos que a API aceita no PUT /usuarios/:id/permissoes", () => {
        const desconhecidas = todasPermissoes.filter((c) => !catalogo.has(c));
        assert.deepEqual(desconhecidas, []);
    });

    it("não repete código", () => {
        assert.equal(new Set(todasPermissoes).size, todasPermissoes.length);
    });

    it("Contábil/Fiscal pode ser concedido", () => {
        const relatorios = permissoesGranulares.find((g) => g.grupo === "Relatórios");
        assert.ok(relatorios?.itens.some((i) => i.codigo === "relatorios:contabil-fiscal"));
    });

    it("lista toda permissão que a API confere (ou ela está na lista de exceções)", () => {
        const usos = permissoesConferidasNaApi();
        // Sanidade: se o regex quebrar, o teste não pode passar vazio.
        assert.ok(usos.size >= 40, `só ${usos.size} permissões achadas na API`);
        const naJanela = new Set([...todasPermissoes, ...PERMISSOES_USADAS_FORA_DA_JANELA]);
        const faltando = [...usos.keys()]
            .filter((c) => !naJanela.has(c))
            .map((c) => `${c} (${usos.get(c)!.join(", ")})`);
        assert.deepEqual(faltando, [], "ponha na janela (perfis-acesso.ts) ou em PERMISSOES_USADAS_FORA_DA_JANELA");
    });

    it("só mostra permissão que alguma rota da API confere (ou que só abre tela, justificada)", () => {
        const api = permissoesConferidasNaApi();
        const semRota = todasPermissoes.filter((c) => !api.has(c) && !PERMISSOES_SO_PORTA_DE_TELA.includes(c));
        assert.deepEqual(semRota, [], "ligue a uma rota, ou ponha em PERMISSOES_SEM_TELA (não libera nada)");
    });

    it("a exceção de 'só porta de tela' é mesmo porta de tela, aparece na janela e a API não confere", () => {
        const api = permissoesConferidasNaApi();
        const portas = new Set<string>(Object.values(PERMISSAO_TELA));
        for (const codigo of PERMISSOES_SO_PORTA_DE_TELA) {
            assert.ok(portas.has(codigo), `${codigo} não abre tela nenhuma`);
            assert.ok(todasPermissoes.includes(codigo), `${codigo} fora da janela`);
            assert.ok(!api.has(codigo), `${codigo} já é conferida pela API: tire da exceção`);
        }
    });

    it("Contas a Pagar/Receber, Fechamentos, Categorias, Dashboard e Excluir usuário não aparecem (nada os confere)", () => {
        for (const prefixo of ["financeiro:contas-pagar:", "financeiro:contas-receber:", "financeiro:fechamentos:", "configuracoes:categorias:"]) {
            assert.ok(!todasPermissoes.some((c) => c.startsWith(prefixo)), prefixo);
        }
        for (const codigo of ["dashboard:ver", "financeiro:importar", "configuracoes:plano-contas:exportar", "admin:usuarios:deletar"]) {
            assert.ok(!todasPermissoes.includes(codigo), codigo);
            assert.ok(PERMISSOES_SEM_TELA.includes(codigo), codigo);
        }
    });

    it("lista toda permissão que uma tela do front confere", () => {
        const naJanela = new Set([...todasPermissoes, ...PERMISSOES_USADAS_FORA_DA_JANELA]);
        const faltando = [...permissoesConferidasNoFront()].filter((c) => !naJanela.has(c));
        assert.deepEqual(faltando, []);
    });

    it("a exceção é só para permissão que existe no catálogo e não aparece na janela", () => {
        for (const codigo of PERMISSOES_USADAS_FORA_DA_JANELA) {
            assert.ok(catalogo.has(codigo), codigo);
            assert.ok(!todasPermissoes.includes(codigo), codigo);
        }
    });

    it("todo código do catálogo está na janela ou foi escondido de propósito", () => {
        const decididos = new Set([...todasPermissoes, ...PERMISSOES_SEM_TELA, ...PERMISSOES_USADAS_FORA_DA_JANELA]);
        assert.deepEqual(PERMISSOES_ADMIN.filter((c) => !decididos.has(c)), []);
    });

    it("Metas: a janela oferece o que o POST /metas exige", () => {
        const usos = permissoesConferidasNaApi();
        assert.ok(usos.get("financeiro:metas:editar")?.some((a) => a.includes("metas")));
        assert.ok(todasPermissoes.includes("financeiro:metas:editar"));
        assert.ok(!todasPermissoes.includes("financeiro:metas:criar"));
    });

    it("Metas: a planilha libera a edição pela mesma permissão do POST /metas", () => {
        assert.equal(PERM.METAS_EDITAR, "financeiro:metas:editar");
        const tela = fs.readFileSync(path.join(WEB_SRC, "pages/cadastros/metas.tsx"), "utf8");
        assert.match(tela, /hasPermission\(PERM\.METAS_EDITAR\)/);
    });

    it("relatórios têm o mesmo nome do item no menu lateral", () => {
        const menu = fs.readFileSync(path.join(WEB_SRC, "components/layout/app-sidebar.tsx"), "utf8");
        const tituloPorUrl = new Map(
            [...menu.matchAll(/title:\s*"([^"]+)",\s*url:\s*"([^"]+)"/g)].map((m) => [m[2], m[1]]),
        );
        const itens = permissoesGranulares.flatMap((g) => g.itens);
        const relatorios = Object.entries(PERMISSAO_TELA).filter(([url]) => url.startsWith("/relatorios/"));
        assert.ok(relatorios.length >= 5);
        for (const [url, codigo] of relatorios) {
            const titulo = tituloPorUrl.get(url);
            assert.ok(titulo, `menu sem ${url}`);
            assert.equal(itens.find((i) => i.codigo === codigo)?.nome, titulo, url);
        }
    });
});

describe("permissões sem tela", () => {
    it("ficam fora da tela mas continuam no catálogo da API", () => {
        for (const codigo of PERMISSOES_SEM_TELA) {
            assert.ok(catalogo.has(codigo), codigo);
            assert.ok(!todasPermissoes.includes(codigo), codigo);
        }
    });

    it("nenhuma rota da API nem tela do front confere essas permissões", () => {
        const api = permissoesConferidasNaApi();
        const front = permissoesConferidasNoFront();
        const usadas = PERMISSOES_SEM_TELA.filter((c) => api.has(c) || front.has(c));
        assert.deepEqual(usadas, [], "se passou a ser usada, tire de PERMISSOES_SEM_TELA e ponha na tela");
    });

    it("a contagem da janela ignora as escondidas", () => {
        assert.equal(contarVisiveis(["relatorios:dre", "relatorios:extrato", "dashboard:ver", "financeiro:metas:criar"]), 1);
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

    it("Metas: Admin e Financeiro gravam; Gestor e Visualizador só consultam", () => {
        assert.ok(perfisBase.Admin.includes("financeiro:metas:editar"));
        assert.ok(perfisBase.Financeiro.includes("financeiro:metas:editar"));
        assert.ok(!perfisBase.Gestor.includes("financeiro:metas:editar"));
        assert.ok(!perfisBase.Visualizador.includes("financeiro:metas:editar"));
        for (const perfil of ["Admin", "Financeiro", "Gestor", "Visualizador"]) {
            assert.ok(perfisBase[perfil].includes("financeiro:metas:listar"), perfil);
        }
    });
});
