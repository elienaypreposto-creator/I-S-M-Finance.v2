import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    aberturaNoPeriodo,
    agruparVinculos,
    comSaldoCorrido,
    dataIsoValida,
    diaAnterior,
    filtrarPorTipo,
    lerParamsExtratoConta,
    ordenarMovimentos,
    resumirNaoConciliados,
    semSaldoCorrido,
    type VinculoExtrato,
} from "./extrato-conta.js";

const mov = (id: number, tipo: "CR" | "CP", data: string | null, valor: string | null, ordem: number | null = null) => ({
    id,
    tipo,
    data_pgto: data,
    valor_quitado: valor,
    ordem_extrato: ordem,
});

describe("extrato-conta — parâmetros", () => {
    it("conta + mês/ano viram o mês inteiro", () => {
        const r = lerParamsExtratoConta({conta_id: "3", mes: "2", ano: "2024"});
        assert.deepEqual(r, {ok: true, params: {contaId: 3, dataInicio: "2024-02-01", dataFim: "2024-02-29", tipo: "ambos"}});
    });

    it("intervalo de datas vence mês/ano; sem conta (ou 'todas') = todas as contas", () => {
        const r = lerParamsExtratoConta({data_inicio: "2026-10-05", data_fim: "2026-10-20", mes: "1", ano: "2020", tipo: "CP"});
        assert.deepEqual(r, {ok: true, params: {contaId: null, dataInicio: "2026-10-05", dataFim: "2026-10-20", tipo: "CP"}});
        const t = lerParamsExtratoConta({conta_id: "todas", mes: "10", ano: "2026", tipo: "xyz"});
        assert.ok(t.ok && t.params.contaId === null && t.params.tipo === "ambos");
    });

    it("rejeita período ausente, data inexistente, intervalo invertido e conta inválida", () => {
        assert.equal(lerParamsExtratoConta({conta_id: "1"}).ok, false);
        assert.equal(lerParamsExtratoConta({data_inicio: "2026-10-01"}).ok, false);
        assert.equal(lerParamsExtratoConta({data_inicio: "2026-02-30", data_fim: "2026-03-01"}).ok, false);
        assert.equal(lerParamsExtratoConta({data_inicio: "2026-10-10", data_fim: "2026-10-01"}).ok, false);
        assert.equal(lerParamsExtratoConta({conta_id: "abc", mes: "10", ano: "2026"}).ok, false);
        assert.equal(lerParamsExtratoConta({conta_id: "-2", mes: "10", ano: "2026"}).ok, false);
        assert.equal(lerParamsExtratoConta({mes: "13", ano: "2026"}).ok, false);
    });

    it("datas civis e dia anterior (virada de mês e ano bissexto)", () => {
        assert.equal(dataIsoValida("2024-02-29"), true);
        assert.equal(dataIsoValida("2026-02-29"), false);
        assert.equal(diaAnterior("2026-03-01"), "2026-02-28");
        assert.equal(diaAnterior("2024-03-01"), "2024-02-29");
        assert.equal(diaAnterior("2026-01-01"), "2025-12-31");
    });
});

describe("extrato-conta — ordem e saldo corrido", () => {
    it("ordena por data; no mesmo dia, pela linha do extrato e depois pelo cadastro", () => {
        const ordenados = ordenarMovimentos([
            mov(5, "CP", "2026-10-02", "10"),
            mov(4, "CR", "2026-10-02", "10", 900),
            mov(3, "CP", "2026-10-02", "10", 100),
            mov(9, "CR", "2026-10-01", "10"),
            mov(1, "CR", "2026-10-02", "10"),
        ]);
        assert.deepEqual(ordenados.map((m) => m.id), [9, 3, 4, 1, 5]);
    });

    it("saldo após cada linha parte do saldo inicial e fecha com inicial + entradas − saídas", () => {
        const r = comSaldoCorrido(100_000, [
            mov(1, "CR", "2026-10-01", "250.10"),
            mov(2, "CP", "2026-10-01", "1000.00"),
            mov(3, "CP", "2026-10-03", "0.20"),
            mov(4, "CR", "2026-10-04", "0.10"),
        ]);
        assert.deepEqual(r.linhas.map((l) => l.saldoAposCents), [125_010, 25_010, 24_990, 25_000]);
        assert.equal(r.entradasCents, 25_020);
        assert.equal(r.saidasCents, 100_020);
        assert.equal(r.saldoFinalCents, 100_000 + 25_020 - 100_020);
        assert.deepEqual([r.linhas[1]!.entradaCents, r.linhas[1]!.saidaCents], [0, 100_000]);
    });

    it("valor_quitado nulo conta zero (mesma regra do saldo da conta)", () => {
        const r = comSaldoCorrido(500, [mov(1, "CR", "2026-10-01", null)]);
        assert.equal(r.saldoFinalCents, 500);
        assert.equal(r.linhas[0]!.entradaCents, 0);
    });

    it("filtro de tipo só esconde linhas: o saldo corrido continua o da conta", () => {
        const r = comSaldoCorrido(0, [mov(1, "CR", "2026-10-01", "100"), mov(2, "CP", "2026-10-02", "30"), mov(3, "CR", "2026-10-03", "5")]);
        const so = filtrarPorTipo(r.linhas, "CR");
        assert.deepEqual(so.map((l) => [l.id, l.saldoAposCents]), [[1, 10_000], [3, 7_500]]);
        assert.equal(filtrarPorTipo(r.linhas, "ambos").length, 3);
    });

    it("visão de todas as contas separa entrada e saída sem saldo", () => {
        const linhas = semSaldoCorrido([mov(1, "CR", "2026-10-01", "1.5"), mov(2, "CP", "2026-10-01", "2")]);
        assert.deepEqual(linhas.map((l) => [l.entradaCents, l.saidaCents]), [[150, 0], [0, 200]]);
        assert.equal("saldoAposCents" in linhas[0]!, false);
    });
});

describe("extrato-conta — conciliação", () => {
    const vinculo = (lancamento: number, linha: number, status: string, extrato = 7): VinculoExtrato => ({
        lancamento_id: lancamento,
        conciliacao_status: status,
        extrato_id: extrato,
        extrato_linha_id: linha,
        data: "2026-10-01",
        valor: "-120.50",
        descricao: `PIX ${linha}`,
        documento: null,
    });

    it("agrupa por lançamento; principal = conciliação finalizada, depois a primeira linha", () => {
        const mapa = agruparVinculos([
            vinculo(1, 30, "pendente"),
            vinculo(1, 40, "conciliado", 8),
            vinculo(2, 12, "pendente"),
            vinculo(2, 11, "pendente"),
        ]);
        assert.equal(mapa.size, 2);
        const um = mapa.get(1)!;
        assert.deepEqual([um.linha_id, um.extrato_id, um.conciliacao_finalizada, um.linhas_vinculadas], [40, 8, true, 2]);
        assert.equal(um.valor, -120.5);
        const dois = mapa.get(2)!;
        assert.deepEqual([dois.linha_id, dois.conciliacao_finalizada], [11, false]);
        assert.equal(mapa.has(3), false);
    });

    it("não conciliados: quantidade e valor dos lançamentos sem vínculo", () => {
        const r = resumirNaoConciliados([
            {conciliado: true, entradaCents: 10_000, saidaCents: 0},
            {conciliado: false, entradaCents: 2_500, saidaCents: 0},
            {conciliado: false, entradaCents: 0, saidaCents: 700},
        ]);
        assert.deepEqual(r, {quantidade: 2, entradasCents: 2_500, saidasCents: 700, totalCents: 3_200});
        assert.deepEqual(resumirNaoConciliados([]), {quantidade: 0, entradasCents: 0, saidasCents: 0, totalCents: 0});
    });
});

describe("extrato-conta — conta que começa dentro do período", () => {
    // Nubank do clone: data de início 27/08/2026, saldo inicial 50.000.
    const naoVale = {antes_do_inicio: true, saldo_inicial: 50_000};
    const vale = {antes_do_inicio: false, saldo_inicial: 50_000};

    it("abertura só quando o período começa antes e termina depois da véspera da data de início", () => {
        assert.deepEqual(aberturaNoPeriodo(naoVale, vale, "2026-08-27"), {data: "2026-08-27", valorCents: 5_000_000});
        // Junho: tudo antes do início, sem abertura (saldo zero, não 50.000).
        assert.equal(aberturaNoPeriodo(naoVale, naoVale, "2026-08-27"), null);
        // Setembro: a conta já começou, o saldo inicial já está no saldo de abertura do período.
        assert.equal(aberturaNoPeriodo(vale, vale, "2026-08-27"), null);
    });

    it("saldo corrido: abertura entra antes dos movimentos da data de início, fora de entradas/saídas", () => {
        const r = comSaldoCorrido(
            -90,
            [
                mov(1, "CP", "2026-08-10", "0.90"), // conciliado antes do início
                mov(2, "CP", "2026-08-27", "100.00"),
                mov(3, "CR", "2026-08-30", "10.00"),
            ],
            {data: "2026-08-27", valorCents: 5_000_000},
        );
        assert.deepEqual(r.linhas.map((l) => l.saldoAposCents), [-180, 4_989_820, 4_990_820]);
        assert.deepEqual(r.abertura, {data: "2026-08-27", valorCents: 5_000_000, saldoAposCents: 4_999_820});
        assert.equal(r.entradasCents, 1_000);
        assert.equal(r.saidasCents, 10_090);
        assert.equal(r.saldoFinalCents, -90 + 5_000_000 + 1_000 - 10_090);
    });

    it("sem movimento depois do início, a abertura fecha o período", () => {
        const r = comSaldoCorrido(0, [mov(1, "CP", "2026-08-10", "0.90")], {data: "2026-08-27", valorCents: 5_000_000});
        assert.equal(r.abertura?.saldoAposCents, 4_999_910);
        assert.equal(r.saldoFinalCents, 4_999_910);
    });

    it("sem abertura nada muda", () => {
        const r = comSaldoCorrido(1_000, [mov(1, "CR", "2026-08-27", "1.00")]);
        assert.equal(r.abertura, null);
        assert.equal(r.saldoFinalCents, 1_100);
    });
});
