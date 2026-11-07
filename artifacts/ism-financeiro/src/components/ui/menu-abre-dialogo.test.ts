/**
 * Menu (DropdownMenu do Radix) que abre um <Modal>: o diálogo só pode abrir
 * depois que o menu saiu do DOM, e ao fechar o <body> volta a aceitar cliques
 * e o foco volta para o gatilho do menu.
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
    "Event", "DocumentFragment", "ShadowRoot", "SVGElement", "Text",
]) {
    g[k] = k === "window" ? w : w[k];
}
g.CSS = {escape: (s: string) => s};
g.ResizeObserver = w.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
const proto = w.HTMLElement.prototype as unknown as Record<string, unknown>;
proto.scrollIntoView = () => {};
proto.hasPointerCapture = () => false;
proto.releasePointerCapture = () => {};

// Animação de saída do menu (tw-animate-css "exit"), como no navegador: o
// Radix mantém o menu montado até o `animationend`.
const computedOriginal = w.getComputedStyle.bind(w);
const comAnimacao = (el: Element) => {
    const estilo = computedOriginal(el);
    const ehMenu = el.getAttribute?.("role") === "menu";
    const nome = !ehMenu ? "none" : el.getAttribute("data-state") === "closed" ? "exit" : "enter";
    return new Proxy(estilo, {
        get(alvo, prop) {
            if (prop === "animationName") return nome;
            const v = Reflect.get(alvo, prop, alvo);
            return typeof v === "function" ? v.bind(alvo) : v;
        },
    });
};
g.getComputedStyle = w.getComputedStyle = comAnimacao as typeof w.getComputedStyle;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("menu que abre diálogo (useAcaoAposFecharMenu)", () => {
    it("abre o diálogo só depois que o menu sai do DOM e libera o body ao fechar", async () => {
        const React = await import("react");
        // Sem act(): a ação agendada roda num setTimeout do Radix; o teste espera o React como no navegador.
        // Com condição, espera até ela valer (máquina carregada não quebra o teste); sem, só deixa o React assentar.
        const passo = async (fn: () => unknown, pronto?: () => boolean) => {
            fn();
            if (!pronto) return esperar(30);
            for (let i = 0; i < 300 && !pronto(); i++) await esperar(10);
            await esperar(10);
        };
        const {createRoot} = await import("react-dom/client");
        const {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} =
            await import("@/components/ui/dropdown-menu");
        const {Modal, ModalBody, ModalHeader} = await import("@/components/ui/modal-responsivo");
        const {useAcaoAposFecharMenu} = await import("./menu-abre-dialogo");
        const h = React.createElement;

        function Tela() {
            const [aberto, setAberto] = React.useState(false);
            const [painel, setPainel] = React.useState(false);
            const depoisDoMenu = useAcaoAposFecharMenu();
            return h(React.Fragment, null,
                h(DropdownMenu, {open: aberto, onOpenChange: setAberto},
                    h(DropdownMenuTrigger, {asChild: true}, h("button", {id: "gatilho", type: "button"}, "Menu")),
                    h(DropdownMenuContent, {onCloseAutoFocus: depoisDoMenu.onCloseAutoFocus},
                        h(DropdownMenuItem, {id: "item", onSelect: () => depoisDoMenu.agendar(() => setPainel(true))}, "Segurança"),
                    ),
                ),
                painel && h(Modal, {onClose: () => setPainel(false)},
                    h(ModalHeader, {title: "Segurança"}),
                    h(ModalBody, null, h("input", {id: "campo"})),
                ),
            );
        }

        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        await passo(() => root.render(h(Tela)));

        // Asserções com booleanos: comparar nós do jsdom faz o assert inspecionar a árvore inteira.
        const tecla = (el: Element, key: string) =>
            el.dispatchEvent(new w.KeyboardEvent("keydown", {key, bubbles: true}));
        const fimDaAnimacao = () => {
            const fim = new w.Event("animationend", {bubbles: true});
            Object.defineProperty(fim, "animationName", {value: "exit"});
            document.querySelector("[role=menu]")?.dispatchEvent(fim);
        };
        const temMenu = () => document.querySelector("[role=menu]") !== null;
        const temDialogo = () => document.querySelector("[role=dialog]") !== null;
        const foco = () => (document.activeElement as HTMLElement | null)?.id ?? "";
        const menuSaindo = () => document.querySelector("[role=menu]")?.getAttribute("data-state") === "closed";
        const gatilho = document.getElementById("gatilho")!;

        await passo(() => {
            gatilho.focus();
            tecla(gatilho, "Enter");
        }, temMenu);
        assert.equal(temMenu(), true, "menu aberto");
        assert.equal(document.body.style.pointerEvents, "none");

        await passo(() => {
            const item = document.getElementById("item")!;
            item.focus();
            tecla(item, "Enter");
        }, menuSaindo);
        // Menu ainda na animação de saída: o diálogo não pode montar junto com ele.
        assert.equal(temMenu(), true, "menu ainda saindo");
        assert.equal(temDialogo(), false, "diálogo espera o menu sair");

        await passo(fimDaAnimacao, () => !temMenu() && temDialogo() && foco() === "campo");
        assert.equal(temMenu(), false, "menu desmontado");
        assert.equal(temDialogo(), true, "diálogo aberto depois do menu");
        assert.equal(foco(), "campo", "foco no primeiro campo do diálogo");
        assert.equal(document.body.style.pointerEvents, "none", "diálogo modal bloqueia o fundo");

        await passo(() => tecla(document.activeElement ?? document.body, "Escape"),
            () => !temDialogo() && foco() === "gatilho" && document.body.style.pointerEvents === "");
        assert.equal(temDialogo(), false, "diálogo fechado");
        assert.equal(document.body.style.pointerEvents, "", "body volta a aceitar cliques");
        assert.equal(foco(), "gatilho", "foco volta para o gatilho do menu");

        // Fechar o menu sem escolher nada não abre diálogo nenhum.
        await passo(() => tecla(gatilho, "Enter"), temMenu);
        assert.equal(temMenu(), true);
        await passo(() => tecla(document.querySelector("[role=menu]")!, "Escape"), menuSaindo);
        await passo(fimDaAnimacao, () => !temMenu() && document.body.style.pointerEvents === "");
        assert.equal(temMenu(), false);
        assert.equal(temDialogo(), false);
        assert.equal(document.body.style.pointerEvents, "");

        await passo(() => root.unmount());
    });
});
