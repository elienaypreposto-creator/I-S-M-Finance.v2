import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {gravarPreferencias, lerPreferencias, paginaInicialDe} from "./preferencias-usuario.ts";

function memoria(): Storage {
    const mapa = new Map<string, string>();
    return {
        getItem: (k) => mapa.get(k) ?? null,
        setItem: (k, v) => {
            mapa.set(k, v);
        },
        removeItem: (k) => {
            mapa.delete(k);
        },
        clear: () => mapa.clear(),
        key: () => null,
        get length() {
            return mapa.size;
        },
    };
}

describe("preferências do usuário", () => {
    it("oculta saldos e abre o painel quando ainda não há escolha", () => {
        const prefs = lerPreferencias(4, memoria());
        assert.equal(prefs.ocultarSaldos, true);
        assert.equal(prefs.paginaInicial, "/");
    });

    it("grava e lê por usuário, e ignora rota desconhecida", () => {
        const box = memoria();
        assert.equal(gravarPreferencias(4, {ocultarSaldos: false, paginaInicial: "/lancamentos"}, box), true);
        assert.deepEqual(lerPreferencias(4, box), {ocultarSaldos: false, paginaInicial: "/lancamentos"});
        assert.equal(lerPreferencias(9, box).ocultarSaldos, true);

        box.setItem("ism:preferencias:4", JSON.stringify({ocultarSaldos: true, paginaInicial: "https://evil"}));
        assert.equal(paginaInicialDe(4, box), "/");
    });

    it("storage bloqueado devolve o padrão", () => {
        const box = {
            getItem() {
                throw new Error("bloqueado");
            },
            setItem() {
                throw new Error("bloqueado");
            },
        };
        assert.equal(lerPreferencias(1, box).ocultarSaldos, true);
        assert.equal(gravarPreferencias(1, {ocultarSaldos: false, paginaInicial: "/"}, box), false);
    });
});
