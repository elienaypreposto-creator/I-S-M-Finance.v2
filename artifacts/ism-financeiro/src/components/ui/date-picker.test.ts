/**
 * Seletor de data (DatePicker): fecha ao escolher o dia, e um clique fora do
 * calendário só fecha — não altera a data gravada no campo.
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
    if (w[k] !== undefined) g[k] = k === "window" ? w : w[k];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.ResizeObserver = w.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
const proto = w.HTMLElement.prototype as unknown as Record<string, unknown>;
proto.scrollIntoView = () => {};
proto.hasPointerCapture = () => false;
proto.releasePointerCapture = () => {};

const {dataIsoParaDate, proximoValorData} = await import("./date-picker");

describe("proximoValorData / dataIsoParaDate", () => {
    it("formata a data escolhida em yyyy-MM-dd", () => {
        assert.equal(proximoValorData("2026-11-07", new Date(2026, 10, 20)), "2026-11-20");
    });
    it("sem data escolhida mantém o valor atual (não apaga o vencimento)", () => {
        assert.equal(proximoValorData("2026-11-07", undefined), "2026-11-07");
    });
    it("lê yyyy-MM-dd como data local e ignora vazio/inválido", () => {
        const d = dataIsoParaDate("2026-11-07");
        assert.deepEqual([d?.getFullYear(), d?.getMonth(), d?.getDate()], [2026, 10, 7]);
        assert.equal(dataIsoParaDate(""), undefined);
        assert.equal(dataIsoParaDate("abc"), undefined);
    });
});

describe("DatePicker no navegador (jsdom)", () => {
    async function montar(valorInicial: string) {
        const React = await import("react");
        const {act} = React;
        const {createRoot} = await import("react-dom/client");
        const {DatePicker} = await import("./date-picker");
        const h = React.createElement;
        const valores: string[] = [];

        function Campo() {
            const [valor, setValor] = React.useState(valorInicial);
            return h("div", null,
                h("button", {id: "fora", type: "button"}, "fora"),
                h(DatePicker, {
                    id: "vencimento",
                    value: valor,
                    onChange: (v: string) => {
                        valores.push(v);
                        setValor(v);
                    },
                }),
            );
        }

        const el = document.createElement("div");
        document.body.appendChild(el);
        const root = createRoot(el);
        await act(async () => root.render(h(Campo)));

        const botao = () => document.getElementById("vencimento") as HTMLButtonElement;
        const calendario = () => document.querySelector("[data-slot=calendar]");
        const ponteiro = (alvo: Element, tipo: string) =>
            alvo.dispatchEvent(new w.PointerEvent(tipo, {bubbles: true, cancelable: true, button: 0, pointerType: "mouse"} as PointerEventInit));
        const clicar = (alvo: Element) => act(async () => {
            ponteiro(alvo, "pointerdown");
            alvo.dispatchEvent(new w.MouseEvent("mousedown", {bubbles: true, cancelable: true}));
            ponteiro(alvo, "pointerup");
            alvo.dispatchEvent(new w.MouseEvent("mouseup", {bubbles: true, cancelable: true}));
            alvo.dispatchEvent(new w.MouseEvent("click", {bubbles: true, cancelable: true}));
        });
        const esperar = () => act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });

        return {
            valores, botao, calendario, clicar, esperar,
            dia: (n: number) => [...document.querySelectorAll("[data-slot=calendar] button")]
                .find((b) => b.textContent?.trim() === String(n) && b.closest("[data-day]") !== null) as HTMLElement | undefined,
            desmontar: () => act(async () => root.unmount()),
        };
    }

    it("abre no mês da data, fecha ao escolher o dia e grava a data", async () => {
        const t = await montar("2026-03-10");
        await t.clicar(t.botao());
        assert.ok(t.calendario(), "calendário deveria abrir");
        assert.match(t.calendario()!.textContent ?? "", /março 2026/i);

        const dia = t.dia(20);
        assert.ok(dia, "dia 20 deveria estar na grade");
        await t.clicar(dia!);
        await t.esperar();

        assert.deepEqual(t.valores, ["2026-03-20"]);
        assert.equal(t.calendario(), null, "calendário deveria fechar ao escolher o dia");
        assert.equal(t.botao().textContent?.trim(), "20/03/2026");
        await t.desmontar();
    });

    it("rótulos do calendário em português (leitor de tela)", async () => {
        const t = await montar("2026-03-10");
        await t.clicar(t.botao());
        const rotulos = [...document.querySelectorAll("[data-slot=calendar] [aria-label]")]
            .map((el) => el.getAttribute("aria-label") ?? "");
        assert.ok(rotulos.includes("Ir para o mês anterior"), rotulos.join(" | "));
        assert.ok(rotulos.includes("Ir para o próximo mês"));
        assert.ok(rotulos.some((r) => /selecionado$/.test(r)));
        assert.ok(!rotulos.some((r) => /Go to|selected|Today/.test(r)), rotulos.join(" | "));
        await t.desmontar();
    });

    it("clique fora fecha sem alterar a data", async () => {
        const t = await montar("2026-03-10");
        await t.clicar(t.botao());
        assert.ok(t.calendario());

        await t.clicar(document.getElementById("fora")!);
        await t.esperar();

        assert.deepEqual(t.valores, []);
        assert.equal(t.calendario(), null);
        assert.equal(t.botao().textContent?.trim(), "10/03/2026");
        await t.desmontar();
    });

    it("clicar no dia já escolhido não apaga a data", async () => {
        const t = await montar("2026-03-10");
        await t.clicar(t.botao());
        await t.clicar(t.dia(10)!);
        await t.esperar();

        assert.ok(t.valores.every((v) => v === "2026-03-10"));
        assert.equal(t.botao().textContent?.trim(), "10/03/2026");
        await t.desmontar();
    });
});
