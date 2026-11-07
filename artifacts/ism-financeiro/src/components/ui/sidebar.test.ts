/**
 * Menu lateral: ao estreitar a janela já aberta até largura de celular, o
 * botão do menu tem que abrir o sheet — inclusive quando o navegador não
 * dispara o "change" da media query (o estado ficava preso no modo desktop,
 * oculto abaixo de md, e o clique não abria nada).
 *
 * Roda num jsdom próprio (cada arquivo de teste é um processo separado).
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {JSDOM} from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {pretendToBeVisual: true});
const w = dom.window as unknown as Window & typeof globalThis & Record<string, unknown>;
const g = globalThis as unknown as Record<string, unknown>;
for (const k of [
    "window", "document", "HTMLElement", "Element", "Node", "getComputedStyle", "requestAnimationFrame",
    "cancelAnimationFrame", "MutationObserver", "KeyboardEvent", "MouseEvent", "FocusEvent", "CustomEvent",
    "Event", "DocumentFragment", "ShadowRoot", "SVGElement", "Text", "NodeFilter",
    "HTMLInputElement", "HTMLButtonElement", "PointerEvent", "UIEvent", "EventTarget",
]) {
    g[k] = k === "window" ? w : w[k];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.ResizeObserver = w.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Viewport controlado pelo teste; matchMedia avalia a largura atual.
let largura = 1400;
const ouvintesChange = new Set<() => void>();
Object.defineProperty(w, "innerWidth", {get: () => largura, configurable: true});
w.matchMedia = ((query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
    return {
        media: query,
        get matches() {
            return largura <= max;
        },
        onchange: null,
        addEventListener: (_: string, l: () => void) => ouvintesChange.add(l),
        removeEventListener: (_: string, l: () => void) => ouvintesChange.delete(l),
        addListener: (l: () => void) => ouvintesChange.add(l),
        removeListener: (l: () => void) => ouvintesChange.delete(l),
        dispatchEvent: () => true,
    };
}) as unknown as typeof w.matchMedia;

async function montar() {
    const React = await import("react");
    const {act} = React;
    const {createRoot} = await import("react-dom/client");
    const {SidebarProvider, Sidebar, SidebarTrigger} = await import("@/components/ui/sidebar");
    const h = React.createElement;

    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
        root.render(
            h(SidebarProvider, null,
                h(Sidebar, {collapsible: "icon", variant: "inset"}, h("nav", null, "itens do menu")),
                h(SidebarTrigger),
            ),
        );
    });

    return {
        act,
        sheetAberto: () => document.querySelector("[data-mobile=true]") !== null,
        menuDesktop: () => document.querySelector("[data-slot=sidebar-container]") !== null,
        clicarBotao: () => act(async () => {
            const botao = document.querySelector("[data-sidebar=trigger]") as HTMLElement;
            botao.dispatchEvent(new w.MouseEvent("click", {bubbles: true}));
        }),
        desmontar: () => act(async () => root.unmount()),
    };
}

describe("menu lateral: troca desktop → celular", () => {
    it("estreitando a janela (change da media query) o botão abre o sheet", async () => {
        largura = 1400;
        const t = await montar();
        assert.equal(t.menuDesktop(), true);

        await t.act(async () => {
            largura = 375;
            ouvintesChange.forEach((l) => l());
        });
        assert.equal(t.menuDesktop(), false);
        assert.equal(t.sheetAberto(), false);

        await t.clicarBotao();
        assert.equal(t.sheetAberto(), true);
        await t.desmontar();
    });

    it("sem nenhum evento de resize, o clique relê o viewport e abre o sheet", async () => {
        largura = 1400;
        const t = await montar();
        largura = 375; // nenhum evento disparado
        await t.clicarBotao();
        assert.equal(t.sheetAberto(), true);
        await t.desmontar();
    });

    it("sheet aberto no celular não reaparece sozinho depois de passar pelo desktop", async () => {
        largura = 375;
        const t = await montar();
        await t.clicarBotao();
        assert.equal(t.sheetAberto(), true);

        await t.act(async () => {
            largura = 1400;
            w.dispatchEvent(new w.Event("resize"));
        });
        assert.equal(t.menuDesktop(), true);

        await t.act(async () => {
            largura = 375;
            w.dispatchEvent(new w.Event("resize"));
        });
        assert.equal(t.sheetAberto(), false);
        await t.desmontar();
    });
});
