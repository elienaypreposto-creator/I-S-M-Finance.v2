import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    encontrarRegraParaLinha,
    naturezaDaLinhaExtrato,
    regraCasaTexto,
    type RegraParaMatch,
} from "./regras-match.js";

function regra(partial: Partial<RegraParaMatch> & Pick<RegraParaMatch, "id" | "texto_gatilho">): RegraParaMatch {
    return {
        tipo_match: "contem",
        natureza: "saida",
        criar_lancamento_automatico: true,
        plano_conta_id: 1,
        parceiro_id: null,
        departamento_id: null,
        centro_custo_id: null,
        forma_pagamento: null,
        ...partial,
    };
}

describe("regras-match - FEAT-03", () => {
    it("naturezaDaLinhaExtrato mapeia crédito/débito", () => {
        assert.equal(naturezaDaLinhaExtrato("credito"), "entrada");
        assert.equal(naturezaDaLinhaExtrato("debito"), "saida");
    });

    it("contem / inicia / regex / exato (case-insensitive)", () => {
        assert.equal(regraCasaTexto({texto_gatilho: "TARIFA", tipo_match: "contem"}, "Tarifa pacote"), true);
        assert.equal(regraCasaTexto({texto_gatilho: "TARIFA", tipo_match: "inicia"}, "Tarifa pacote"), true);
        assert.equal(regraCasaTexto({texto_gatilho: "TARIFA", tipo_match: "inicia"}, "PIX Tarifa"), false);
        assert.equal(regraCasaTexto({texto_gatilho: "TARIFA\\s+PACOTE", tipo_match: "regex"}, "tarifa pacote X"), true);
        assert.equal(regraCasaTexto({texto_gatilho: "[invalid", tipo_match: "regex"}, "qualquer"), false);
        assert.equal(regraCasaTexto({texto_gatilho: "TARIFA PIX", tipo_match: "exato"}, "tarifa pix"), true);
        assert.equal(regraCasaTexto({texto_gatilho: "TARIFA PIX", tipo_match: "exato"}, "TARIFA PIX EXTRA"), false);
    });

    it("primeira regra da lista vence; natureza não cruza", () => {
        const lista: RegraParaMatch[] = [
            regra({id: 10, texto_gatilho: "TARIFA", natureza: "saida"}),
            regra({id: 20, texto_gatilho: "TARIFA PACOTE", natureza: "saida"}),
        ];
        const hit = encontrarRegraParaLinha(lista, {
            tipo_movimento: "debito",
            descricao: "TARIFA PACOTE DE SERVICOS",
        });
        assert.equal(hit?.id, 10);

        const entrada = encontrarRegraParaLinha(lista, {
            tipo_movimento: "credito",
            descricao: "TARIFA PACOTE DE SERVICOS",
        });
        assert.equal(entrada, null);
    });
});
