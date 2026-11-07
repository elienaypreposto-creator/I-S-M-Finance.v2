/**
 * Regra de qual conta recebe o movimento (saldo da conta, Painel, conciliação e
 * extrato da conta em Relatórios). O SQL é conferido renderizado; a leitura no
 * Postgres é coberta pelo e2e (test/e2e/fluxo-conciliacao.mjs).
 */
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {and} from "drizzle-orm";
import {PgDialect} from "drizzle-orm/pg-core";
import {saldoInicialValeNaData, sqlLancamentosDaConta, sqlMovimentosNoSaldoDaConta} from "./lancamentos-conta.js";
import {aberturaNoPeriodo, comSaldoCorrido, diaAnterior} from "./extrato-conta.js";

const dialeto = new PgDialect();
const render = (s: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const q = dialeto.sqlToQuery(s);
    return {sql: q.sql.replace(/\s+/g, " ").trim(), params: q.params};
};

describe("sqlLancamentosDaConta: um lançamento, uma conta", () => {
    const {sql, params} = render(sqlLancamentosDaConta(9));

    it("conta_id preenchido decide sozinho", () => {
        assert.match(sql, /^\( "lancamentos"\."conta_id" = \$1 OR \( "lancamentos"\."conta_id" IS NULL AND/);
        assert.equal(params[0], 9);
    });

    it("conciliação só vale para título sem conta_id (caso do Card 62)", () => {
        // Nenhum "OR id IN (conciliações da conta)" solto: era o que contava o título
        // com conta_id de uma conta e vínculo em extrato de outra nas duas.
        assert.doesNotMatch(sql, /OR "lancamentos"\."id" IN/);
        assert.match(sql, /"lancamentos"\."conta_id" IS NULL AND \( SELECT c\.conta_id FROM itens_conciliacao_lancamentos icl/);
        assert.equal(params[1], 9);
    });

    it("sem conta_id e vínculos em duas contas: vale só a do vínculo mais recente", () => {
        assert.match(sql, /WHERE icl\.lancamento_id = "lancamentos"\."id" ORDER BY icl\.id DESC LIMIT 1 \) = \$2/);
    });
});

describe("sqlMovimentosNoSaldoDaConta", () => {
    const {sql, params} = render(and(...sqlMovimentosNoSaldoDaConta(13, "2026-08-27"))!);

    it("aplica a conta do movimento, a data de início (ou conciliado na conta) e só quitados", () => {
        assert.match(sql, /"lancamentos"\."data_quitacao" >= \$3 OR "lancamentos"\."id" IN \( SELECT icl\.lancamento_id/);
        assert.match(sql, /"lancamentos"\."status" IN \('pago', 'recebido', 'pago_parcial'\)/);
        assert.deepEqual(params, [13, 13, "2026-08-27", 13]);
    });
});

describe("saldoInicialValeNaData: saldo inicial é a abertura da data de início", () => {
    it("entra no fechamento da própria data de início em diante", () => {
        assert.equal(saldoInicialValeNaData("2026-08-27", "2026-08-27"), true);
        assert.equal(saldoInicialValeNaData("2026-11-06", "2026-08-27"), true);
    });

    it("fechamento da véspera e de antes não leva o saldo inicial (saldo desconhecido)", () => {
        assert.equal(saldoInicialValeNaData("2026-08-26", "2026-08-27"), false);
        assert.equal(saldoInicialValeNaData("2026-05-31", "2026-08-27"), false);
        // Conta que começa no dia 1º: o fim do mês anterior ainda é zero.
        assert.equal(saldoInicialValeNaData("2026-09-30", "2026-10-01"), false);
        assert.equal(saldoInicialValeNaData("2026-02-28", "2026-03-01"), false);
    });

    it("saldo atual (sem data) sempre leva o saldo inicial", () => {
        assert.equal(saldoInicialValeNaData(undefined, "2099-01-01"), true);
    });
});

/**
 * Relatório de movimentações mês a mês, montado como a rota faz: saldo inicial =
 * saldoNaData(véspera do período), saldo final = saldoNaData(fim) e a abertura de
 * `aberturaNoPeriodo`. saldoNaData aqui é a regra do service em memória.
 */
describe("movimentações mês a mês: abertura no mês que contém a data de início", () => {
    type Mov = {id: number; tipo: "CR" | "CP"; data_pgto: string; valor_quitado: string; ordem_extrato: null};
    const mov = (id: number, tipo: "CR" | "CP", data: string, valor: string): Mov => ({
        id,
        tipo,
        data_pgto: data,
        valor_quitado: valor,
        ordem_extrato: null,
    });

    function saldoNaData(conta: {inicio: string; saldo: number}, movs: Mov[], data: string) {
        const vale = saldoInicialValeNaData(data, conta.inicio);
        let cents = vale ? Math.round(conta.saldo * 100) : 0;
        for (const m of movs) {
            if (m.data_pgto > data) continue;
            const v = Math.round(Number(m.valor_quitado) * 100);
            cents += m.tipo === "CR" ? v : -v;
        }
        return {antes_do_inicio: !vale, saldo_inicial: conta.saldo, cents};
    }

    function mes(conta: {inicio: string; saldo: number}, movs: Mov[], ini: string, fim: string) {
        const abertura = saldoNaData(conta, movs, diaAnterior(ini));
        const fechamento = saldoNaData(conta, movs, fim);
        const doPeriodo = movs.filter((m) => m.data_pgto >= ini && m.data_pgto <= fim);
        const calc = comSaldoCorrido(abertura.cents, doPeriodo, aberturaNoPeriodo(abertura, fechamento, conta.inicio));
        return {inicial: abertura.cents, abertura: calc.abertura, final: calc.saldoFinalCents, finalSistema: fechamento.cents, linhas: calc.linhas};
    }

    const MESES: Array<[string, string]> = [
        ["2026-09-01", "2026-09-30"],
        ["2026-10-01", "2026-10-31"],
        ["2026-11-01", "2026-11-30"],
    ];

    const cenarios = [
        // QA Movimentações / QA Destino do clone: começam no dia 1º.
        {nome: "dia 1º", inicio: "2026-10-01", movs: [mov(1, "CP", "2026-10-01", "100.00"), mov(2, "CR", "2026-10-20", "50.00")]},
        {nome: "meio do mês", inicio: "2026-10-15", movs: [mov(1, "CP", "2026-10-15", "100.00"), mov(2, "CR", "2026-10-20", "50.00")]},
        {nome: "último dia", inicio: "2026-10-31", movs: [mov(1, "CP", "2026-10-31", "100.00")]},
    ];

    for (const c of cenarios) {
        it(`conta que começa no ${c.nome}: abertura só em outubro e saldos encadeados`, () => {
            const conta = {inicio: c.inicio, saldo: 1000};
            const movs = [...c.movs, mov(9, "CP", "2026-11-10", "10.00")];
            const [set, out, nov] = MESES.map(([ini, fim]) => mes(conta, movs, ini, fim));

            // Setembro: tudo antes do início, zero e sem abertura.
            assert.equal(set!.abertura, null);
            assert.equal(set!.inicial, 0);
            assert.equal(set!.final, 0);

            // Outubro: saldo inicial (fim de 30/09) sem a abertura; abertura na data de início.
            assert.equal(out!.inicial, set!.final);
            assert.equal(out!.inicial, 0);
            assert.equal(out!.abertura?.data, c.inicio);
            assert.equal(out!.abertura?.valorCents, 100_000);
            // Abertura antes do movimento da data de início: 1000 − 100 logo depois dele.
            assert.equal(out!.linhas[0]!.saldoAposCents, 90_000);

            // Novembro: começa onde outubro terminou, sem abertura de novo.
            assert.equal(nov!.inicial, out!.final);
            assert.equal(nov!.abertura, null);

            // Saldo final do período = saldo da conta na data.
            for (const m of [set!, out!, nov!]) assert.equal(m.final, m.finalSistema);
        });
    }

    it("conta que começa no dia 1º do mês seguinte (QA-OP Conta, 01/11): outubro não sobe", () => {
        const conta = {inicio: "2026-11-01", saldo: 1000};
        const [, out, nov] = MESES.map(([ini, fim]) => mes(conta, [], ini, fim));
        assert.equal(out!.final, 0);
        assert.equal(out!.abertura, null);
        assert.equal(nov!.inicial, 0);
        assert.deepEqual(nov!.abertura, {data: "2026-11-01", valorCents: 100_000, saldoAposCents: 100_000});
        assert.equal(nov!.final, 100_000);
    });
});
