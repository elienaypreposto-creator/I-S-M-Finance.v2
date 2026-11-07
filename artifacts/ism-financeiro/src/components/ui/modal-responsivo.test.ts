/**
 * Acessibilidade do <Modal> compartilhado: diálogo modal com título associado
 * e foco inicial escolhido pela tela (a Segurança começa pela "Senha atual").
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

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Modal compartilhado", () => {
    it("é diálogo modal, com título associado e o foco inicial pedido pela tela", async () => {
        const React = await import("react");
        const {createRoot} = await import("react-dom/client");
        const {Modal, ModalBody, ModalHeader} = await import("@/components/ui/modal-responsivo");
        const h = React.createElement;

        let fechou = 0;
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        root.render(
            h(Modal, {onClose: () => fechou++, initialFocus: () => document.getElementById("senha-atual")},
                h(ModalHeader, {title: "Segurança", description: "Senha e sessões"}),
                h(ModalBody, null,
                    h("input", {id: "outro", "aria-label": "Outro"}),
                    h("input", {id: "senha-atual", "aria-label": "Senha atual"}),
                ),
            ),
        );
        await esperar(30);

        const dialogo = document.querySelector("[role=dialog]");
        assert.ok(dialogo, "role=dialog");
        assert.equal(dialogo.getAttribute("aria-modal"), "true");
        const tituloId = dialogo.getAttribute("aria-labelledby");
        assert.ok(tituloId, "aria-labelledby");
        assert.equal(document.getElementById(tituloId)?.textContent, "Segurança");
        assert.equal((document.activeElement as HTMLElement | null)?.id, "senha-atual");

        // Esc passa pelo onClose da tela (que decide se pede confirmação).
        document.activeElement!.dispatchEvent(new w.KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
        await esperar(30);
        assert.equal(fechou, 1);

        root.unmount();
    });
});
