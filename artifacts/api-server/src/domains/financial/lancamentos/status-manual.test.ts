/**
 * Status manual do lançamento: quitação só pela conciliação/transferência.
 * Run: npx tsx --test src/domains/financial/lancamentos/status-manual.test.ts
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    MSG_REABRIR_CONCILIADO,
    MSG_REABRIR_TRANSFERENCIA,
    decidirStatusNaEdicao,
    ehStatusQuitacao,
    statusNaCriacao,
} from "./status-manual";

const HOJE = "2026-11-06";

describe("statusNaCriacao", () => {
    it("ignora status de quitação: nasce aberto pelo vencimento", () => {
        assert.equal(statusNaCriacao("pago", "2026-11-10", HOJE), "pendente");
        assert.equal(statusNaCriacao("recebido", "2026-11-01", HOJE), "atrasado");
        assert.equal(statusNaCriacao("pago_parcial", "2026-11-06", HOJE), "pendente");
    });

    it("aceita cancelado e deriva pendente/atrasado do vencimento", () => {
        assert.equal(statusNaCriacao("cancelado", "2026-11-01", HOJE), "cancelado");
        assert.equal(statusNaCriacao("pendente", "2026-11-01", HOJE), "atrasado");
        assert.equal(statusNaCriacao(undefined, "2026-12-01", HOJE), "pendente");
    });
});

describe("decidirStatusNaEdicao", () => {
    const aberto = {statusAtual: "pendente", quitadoAtualCents: 0, temVinculoConciliacao: false, ehTransferencia: false};
    const conciliado = {statusAtual: "pago", quitadoAtualCents: 15000, temVinculoConciliacao: true, ehTransferencia: false};

    it("status de quitação pedido é ignorado (título aberto continua aberto)", () => {
        for (const s of ["pago", "recebido", "pago_parcial"]) {
            assert.deepEqual(decidirStatusNaEdicao({...aberto, statusPedido: s}), {
                ok: true,
                status: undefined,
                limparQuitacao: false,
            });
        }
    });

    it("formulário reenviando o status do título quitado não mexe em nada", () => {
        assert.deepEqual(decidirStatusNaEdicao({...conciliado, statusPedido: "pago"}), {
            ok: true,
            status: undefined,
            limparQuitacao: false,
        });
        assert.deepEqual(decidirStatusNaEdicao({...conciliado, statusPedido: undefined}), {
            ok: true,
            status: undefined,
            limparQuitacao: false,
        });
    });

    it("título aberto troca entre pendente, atrasado e cancelado", () => {
        assert.deepEqual(decidirStatusNaEdicao({...aberto, statusPedido: "cancelado"}), {
            ok: true,
            status: "cancelado",
            limparQuitacao: false,
        });
        assert.deepEqual(decidirStatusNaEdicao({...aberto, statusAtual: "cancelado", statusPedido: "pendente"}), {
            ok: true,
            status: "pendente",
            limparQuitacao: false,
        });
        assert.deepEqual(decidirStatusNaEdicao({...aberto, statusPedido: "pendente"}), {
            ok: true,
            status: undefined,
            limparQuitacao: false,
        });
    });

    it("reabrir ou cancelar título quitado pela conciliação é recusado", () => {
        for (const s of ["pendente", "atrasado", "cancelado"]) {
            assert.deepEqual(decidirStatusNaEdicao({...conciliado, statusPedido: s}), {ok: false, mensagem: MSG_REABRIR_CONCILIADO});
        }
        assert.deepEqual(
            decidirStatusNaEdicao({...conciliado, statusAtual: "pago_parcial", quitadoAtualCents: 5000, statusPedido: "pendente"}),
            {ok: false, mensagem: MSG_REABRIR_CONCILIADO},
        );
    });

    it("reabrir perna de transferência é recusado", () => {
        const transf = {statusAtual: "recebido", quitadoAtualCents: 10000, temVinculoConciliacao: false, ehTransferencia: true};
        assert.deepEqual(decidirStatusNaEdicao({...transf, statusPedido: "pendente"}), {ok: false, mensagem: MSG_REABRIR_TRANSFERENCIA});
    });

    it("quitação órfã do caminho antigo pode ser reaberta e é limpa", () => {
        // "pago" pelo formulário antigo: sem data/valor quitado, sem vínculo.
        assert.deepEqual(
            decidirStatusNaEdicao({statusAtual: "pago", quitadoAtualCents: 0, temVinculoConciliacao: false, ehTransferencia: false, statusPedido: "pendente"}),
            {ok: true, status: "pendente", limparQuitacao: true},
        );
        // Quitado com valor mas sem vínculo nem transferência (ex.: dado de carga).
        assert.deepEqual(
            decidirStatusNaEdicao({statusAtual: "recebido", quitadoAtualCents: 30000, temVinculoConciliacao: false, ehTransferencia: false, statusPedido: "atrasado"}),
            {ok: true, status: "atrasado", limparQuitacao: true},
        );
    });
});

describe("ehStatusQuitacao", () => {
    it("só pago, recebido e pago_parcial", () => {
        assert.equal(ehStatusQuitacao("pago"), true);
        assert.equal(ehStatusQuitacao("recebido"), true);
        assert.equal(ehStatusQuitacao("pago_parcial"), true);
        assert.equal(ehStatusQuitacao("pendente"), false);
        assert.equal(ehStatusQuitacao("cancelado"), false);
        assert.equal(ehStatusQuitacao(null), false);
    });
});
