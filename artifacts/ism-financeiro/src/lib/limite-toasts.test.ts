import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {limitarToasts, TOAST_LIMIT} from "./limite-toasts.ts";

type T = {id: string; open?: boolean; action?: unknown};
const ids = (lista: T[]) => lista.map((t) => t.id);

describe("limitarToasts", () => {
    it("mostra até 3 avisos ao mesmo tempo", () => {
        assert.equal(TOAST_LIMIT, 3);
        const lista: T[] = [{id: "3"}, {id: "2"}, {id: "1"}];
        assert.deepEqual(ids(limitarToasts(lista)), ["3", "2", "1"]);
    });

    it("passou do limite: sai o mais antigo sem ação", () => {
        const lista: T[] = [{id: "4"}, {id: "3"}, {id: "2"}, {id: "1"}];
        assert.deepEqual(ids(limitarToasts(lista)), ["4", "3", "2"]);
    });

    it("o aviso com Desfazer não é derrubado por avisos comuns", () => {
        const lista: T[] = [{id: "4"}, {id: "3"}, {id: "2"}, {id: "1", action: "Desfazer"}];
        assert.deepEqual(ids(limitarToasts(lista)), ["4", "3", "1"]);
        const seguidos = limitarToasts<T>([{id: "5"}, ...limitarToasts(lista)]);
        assert.deepEqual(ids(seguidos), ["5", "4", "1"]);
    });

    it("todos os anteriores com ação: sai o mais antigo e o novo aparece", () => {
        const lista: T[] = [{id: "4"}, {id: "3", action: 1}, {id: "2", action: 1}, {id: "1", action: 1}];
        assert.deepEqual(ids(limitarToasts(lista)), ["4", "3", "2"]);
    });

    it("avisos já fechados não ocupam vaga", () => {
        const lista: T[] = [{id: "5"}, {id: "4", open: false}, {id: "3", open: false}, {id: "2", action: 1}];
        assert.deepEqual(ids(limitarToasts(lista)), ["5", "2"]);
    });

    it("limite 1 mantém o comportamento antigo quando ninguém tem ação", () => {
        assert.deepEqual(ids(limitarToasts<T>([{id: "2"}, {id: "1"}], 1)), ["2"]);
    });
});
