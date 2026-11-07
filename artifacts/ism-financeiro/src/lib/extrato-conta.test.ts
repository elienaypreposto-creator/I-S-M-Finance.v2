import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {FORMATO_DATA_XLSX, FORMATO_MOEDA_XLSX} from "./export-celulas";
import {
    DESCRICAO_ABERTURA,
    avisoInicioConta,
    celulasPlanilhaExtrato,
    colunasExtrato,
    colunasResumoContas,
    documentoDaLinha,
    itensDoExtrato,
    linhasResumo,
    linhasResumoContas,
    periodoDoMes,
    planilhaExtrato,
    rotuloPeriodo,
    textoVinculo,
    tituloExtrato,
    type ExtratoContaResposta,
    type LinhaExtrato,
} from "./extrato-conta";

const linha = (extra: Partial<LinhaExtrato> = {}): LinhaExtrato => ({
    id: 1,
    conta_id: 3,
    conta_bancaria: "Itaú",
    data_pgto: "2026-10-05",
    descricao: "Aluguel",
    nome_parceiro: "Imobiliária",
    categoria: "Ocupação",
    tipo_documento: "boleto",
    numero_documento: "123",
    tipo: "CP",
    transferencia: false,
    entrada: 0,
    saida: 1500,
    saldo_apos: 8500,
    conciliado: false,
    extrato: null,
    ...extra,
});

const resposta = (extra: Partial<ExtratoContaResposta> = {}): ExtratoContaResposta => ({
    modo: "conta",
    conta: {id: 3, nome: "Itaú", banco: "341", agencia: null, conta: null},
    periodo: {inicio: "2026-10-01", fim: "2026-10-31"},
    tipo: "ambos",
    resumo: {data_saldo_inicial: "2026-09-30", saldo_inicial: 10000, entradas: 0, saidas: 1500, saldo_final: 8500},
    nao_conciliados: {quantidade: 1, entradas: 0, saidas: 1500, total: 1500},
    linhas: [linha()],
    ...extra,
});

describe("extrato-conta (front)", () => {
    it("período do mês e rótulo: mês inteiro vira nome do mês, intervalo vira datas", () => {
        assert.deepEqual(periodoDoMes(2024, 2), {inicio: "2024-02-01", fim: "2024-02-29"});
        assert.deepEqual(periodoDoMes(2026, 12), {inicio: "2026-12-01", fim: "2026-12-31"});
        assert.equal(rotuloPeriodo("2026-10-01", "2026-10-31"), "Outubro 2026");
        assert.equal(rotuloPeriodo("2026-10-05", "2026-10-20"), "05/10/2026 a 20/10/2026");
    });

    it("documento e vínculo com o extrato", () => {
        assert.equal(documentoDaLinha("nota_fiscal", " 77 "), "NF 77");
        assert.equal(documentoDaLinha(null, null), "");
        assert.equal(textoVinculo(null), "");
        const texto = textoVinculo({
            extrato_id: 9, linha_id: 4, data: "2026-10-05", valor: -1500, descricao: "BOLETO ALUGUEL",
            documento: null, conciliacao_finalizada: false, linhas_vinculadas: 2,
        });
        assert.match(texto, /^Extrato #9 · 05\/10\/2026 · /);
        assert.match(texto, /BOLETO ALUGUEL · 2 linhas · conciliação em aberto$/);
        // Saldos ocultos: o valor da linha do extrato também some.
        const oculto = textoVinculo({
            extrato_id: 19, linha_id: 4, data: "2026-11-02", valor: 1502.5, descricao: null,
            documento: null, conciliacao_finalizada: true, linhas_vinculadas: 1,
        }, () => "••••••");
        assert.equal(oculto, "Extrato #19 · 02/11/2026 · ••••••");
    });

    it("colunas: saldo corrido só com uma conta; coluna de conta só em todas", () => {
        const umaConta = colunasExtrato("conta").map((c) => c.header);
        const todas = colunasExtrato("todas").map((c) => c.header);
        assert.ok(umaConta.includes("Saldo (R$)") && !umaConta.includes("Conta"));
        assert.ok(todas.includes("Conta") && !todas.includes("Saldo (R$)"));
    });

    it("planilha: título com conta e período, resumo de saldos e linhas com saldo e status", () => {
        const dados = resposta();
        const t = tituloExtrato(dados);
        assert.equal(t.titulo, "Movimentações — Itaú — Outubro 2026");
        assert.equal(t.arquivo, "Movimentacoes_Itaú_2026-10-01_a_2026-10-31");

        const aoa = planilhaExtrato(dados);
        assert.equal(aoa[0]![0], t.titulo);
        assert.deepEqual(linhasResumo(dados).map(([, v]) => v), [10000, 0, 1500, 8500, 1500]);
        assert.deepEqual(aoa[3], ["Saldo inicial (fim de 30/09/2026)", 10000]);

        const cab = colunasExtrato("conta").map((c) => c.header);
        const iCab = aoa.findIndex((l) => l[0] === "Data");
        assert.deepEqual(aoa[iCab], cab);
        const l = aoa[iCab + 1]!;
        assert.equal(l[cab.indexOf("Saldo (R$)")], 8500);
        assert.equal(l[cab.indexOf("Saída (R$)")], 1500);
        assert.equal(l[cab.indexOf("Entrada (R$)")], null);
        assert.equal(l[cab.indexOf("Conciliação")], "Não conciliado");
        assert.equal(l[cab.indexOf("Documento")], "BOL 123");
    });

    it("planilha de todas as contas traz o resumo por conta", () => {
        const aoa = planilhaExtrato(resposta({
            modo: "todas",
            conta: null,
            contas: [{
                conta_id: 3, nome: "Itaú", banco: null, saldo_inicial: 10000, entradas: 0, saidas: 1500, saldo_final: 8500,
                nao_conciliados: {quantidade: 1, entradas: 0, saidas: 1500, total: 1500},
            }],
            linhas: [linha({saldo_apos: null, transferencia: true, conciliado: true})],
        }));
        assert.match(String(aoa[0]![0]), /Todas as contas/);
        const i = aoa.findIndex((l) => l[0] === "Resumo por conta");
        assert.ok(i > 0);
        assert.deepEqual(aoa[i + 2], ["Itaú", 10000, 0, 1500, 8500, 1, 1500]);
        const ultima = aoa[aoa.length - 1]!;
        assert.ok(String(ultima[2]).startsWith("[Transferência]"));
        assert.equal(ultima.includes("Conciliado"), true);
    });

    it("XLSX: data da movimentação como data do Excel e valores como moeda numérica", () => {
        const dados = resposta({linhas: [linha({data_pgto: "2026-08-02"})]});
        const celulas = celulasPlanilhaExtrato(dados);
        const cab = colunasExtrato("conta").map((c) => c.header);
        const iCab = celulas.findIndex((l) => l[0]?.v === "Data");
        assert.deepEqual(celulas[iCab]![0], {v: "Data"});
        const l = celulas[iCab + 1]!;
        assert.deepEqual(l[cab.indexOf("Data")], {v: 46236, z: FORMATO_DATA_XLSX}); // 02/08/2026
        assert.deepEqual(l[cab.indexOf("Saída (R$)")], {v: 1500, z: FORMATO_MOEDA_XLSX});
        assert.deepEqual(l[cab.indexOf("Saldo (R$)")], {v: 8500, z: FORMATO_MOEDA_XLSX});
        assert.deepEqual(l[cab.indexOf("Entrada (R$)")], {v: null});
        assert.deepEqual(l[cab.indexOf("Descrição")], {v: "Aluguel"});
        // O resto da planilha não muda: mesmos valores de planilhaExtrato.
        const aoa = planilhaExtrato(dados);
        celulas.forEach((linhaC, r) => linhaC.forEach((c, i) => {
            if (r === iCab + 1 && i === cab.indexOf("Data")) return;
            assert.equal(c.v, aoa[r]![i]);
        }));
        assert.deepEqual(celulas[3], [{v: "Saldo inicial (fim de 30/09/2026)"}, {v: 10000, z: FORMATO_MOEDA_XLSX}]);
    });

    it("XLSX de todas as contas: contagem de não conciliados como inteiro", () => {
        const celulas = celulasPlanilhaExtrato(resposta({
            modo: "todas",
            conta: null,
            contas: [{
                conta_id: 3, nome: "Itaú", banco: null, saldo_inicial: 10000, entradas: 0, saidas: 1500, saldo_final: 8500,
                nao_conciliados: {quantidade: 1, entradas: 0, saidas: 1500, total: 1500},
            }],
            linhas: [linha({saldo_apos: null})],
        }));
        const i = celulas.findIndex((l) => l[0]?.v === "Resumo por conta");
        const conta = celulas[i + 2]!;
        assert.deepEqual(conta[5], {v: 1, z: "0"});
        assert.deepEqual(conta[6], {v: 1500, z: FORMATO_MOEDA_XLSX});
        const ultima = celulas[celulas.length - 1]!;
        assert.deepEqual(ultima[0], {v: 46300, z: FORMATO_DATA_XLSX}); // 05/10/2026
    });
});

describe("extrato-conta (front) — conta que começa no período", () => {
    // Nubank do clone: começa em 27/08/2026 com saldo inicial de 50.000.
    const abertura = {data: "2026-08-27", valor: 50000, saldo_apos: 50000};
    const agosto = (extra: Partial<ExtratoContaResposta["resumo"]> = {}) =>
        resposta({
            conta: {id: 13, nome: "Nubank", banco: null, agencia: null, conta: null},
            periodo: {inicio: "2026-08-01", fim: "2026-08-31"},
            resumo: {
                data_saldo_inicial: "2026-07-31",
                saldo_inicial: 0,
                saldo_abertura: 50000,
                inicio_conta: "2026-08-27",
                antes_do_inicio: true,
                abertura_conta: abertura,
                entradas: 0,
                saidas: 1500,
                saldo_final: 48500,
                ...extra,
            },
            linhas: [linha({id: 2, data_pgto: "2026-08-28", saldo_apos: 48500})],
        });

    it("saldo de abertura entra antes do primeiro movimento da data de início (ou no fim)", () => {
        const a = linha({id: 1, data_pgto: "2026-08-10"});
        const b = linha({id: 2, data_pgto: "2026-08-27"});
        assert.deepEqual(itensDoExtrato([a, b], abertura).map((i) => (i.tipo === "linha" ? i.linha.id : "abertura")), [1, "abertura", 2]);
        assert.deepEqual(itensDoExtrato([a], abertura).map((i) => i.tipo), ["linha", "abertura"]);
        assert.deepEqual(itensDoExtrato([a, b], null).map((i) => i.tipo), ["linha", "linha"]);
    });

    it("aviso explica que antes da data de início o saldo é desconhecido", () => {
        assert.match(String(avisoInicioConta(agosto())), /^A conta começa em 27\/08\/2026 no sistema\. .*"Saldo de abertura" em 27\/08\/2026\.$/);
        // Junho: período inteiro antes do início, sem abertura.
        const junho = agosto({abertura_conta: null, saldo_abertura: 0, saldo_final: 0, saidas: 0});
        assert.equal(avisoInicioConta(junho), "A conta começa em 27/08/2026 no sistema. Antes dessa data o saldo não é conhecido e aparece zero.");
        // Saldos ocultos: o valor do saldo inicial passa pelo formatador mascarado.
        const oculto = String(avisoInicioConta(agosto(), () => "••••••"));
        assert.match(oculto, /\(••••••\)/);
        assert.doesNotMatch(oculto, /R\$/);
        assert.equal(avisoInicioConta(resposta()), null);
    });

    it("planilha: aviso, abertura no resumo e linha de abertura com o saldo", () => {
        const dados = agosto();
        assert.deepEqual(linhasResumo(dados).slice(0, 2), [
            ["Saldo inicial (fim de 31/07/2026)", 0],
            ["Saldo de abertura da conta (27/08/2026)", 50000],
        ]);
        const aoa = planilhaExtrato(dados);
        assert.match(String(aoa[2]![0]), /^A conta começa em 27\/08\/2026/);
        const cab = colunasExtrato("conta").map((c) => c.header);
        const iCab = aoa.findIndex((l) => l[0] === "Data");
        const linhaAbertura = aoa[iCab + 1]!;
        assert.equal(linhaAbertura[cab.indexOf("Data")], "27/08/2026");
        assert.equal(linhaAbertura[cab.indexOf("Descrição")], DESCRICAO_ABERTURA);
        assert.equal(linhaAbertura[cab.indexOf("Saldo (R$)")], 50000);
        assert.equal(linhaAbertura[cab.indexOf("Saída (R$)")], null);
        assert.equal(aoa[iCab + 2]![cab.indexOf("Saldo (R$)")], 48500);
    });

    it("resumo por conta ganha a coluna de abertura só quando alguma conta começa no período", () => {
        const base = {banco: null, entradas: 0, saidas: 0, nao_conciliados: {quantidade: 0, entradas: 0, saidas: 0, total: 0}};
        const itau = {...base, conta_id: 3, nome: "Itaú", saldo_inicial: 100, saldo_final: 100, saldo_abertura: 0};
        const nubank = {...base, conta_id: 13, nome: "Nubank", saldo_inicial: 0, saldo_final: 50000, saldo_abertura: 50000};
        assert.equal(colunasResumoContas([itau]).includes("Abertura (R$)"), false);
        assert.deepEqual(colunasResumoContas([itau, nubank]).slice(0, 3), ["Conta", "Saldo inicial (R$)", "Abertura (R$)"]);
        assert.deepEqual(linhasResumoContas([itau, nubank])[1], ["Nubank", 0, 50000, 0, 0, 50000, 0, 0]);
    });
    it("XLSX: linha de abertura vira data do Excel e a contagem segue a coluna deslocada pela abertura", () => {
        // Uma conta: a linha de abertura (27/08) entra antes do movimento de 28/08, ambos com data do Excel.
        const umaConta = celulasPlanilhaExtrato(agosto());
        const iCab = umaConta.findIndex((l) => l[0]?.v === "Data");
        assert.deepEqual(umaConta[iCab + 1]![0], {v: 46261, z: FORMATO_DATA_XLSX}); // 27/08/2026
        assert.deepEqual(umaConta[iCab + 2]![0], {v: 46262, z: FORMATO_DATA_XLSX}); // 28/08/2026

        // Todas as contas com abertura: "Não conciliados" anda uma coluna e continua inteiro.
        const base = {banco: null, entradas: 0, saidas: 0, nao_conciliados: {quantidade: 2, entradas: 0, saidas: 0, total: 300}};
        const contas = [
            {...base, conta_id: 3, nome: "Itaú", saldo_inicial: 100, saldo_final: 100, saldo_abertura: 0},
            {...base, conta_id: 13, nome: "Nubank", saldo_inicial: 0, saldo_final: 50000, saldo_abertura: 50000},
        ];
        const todas = celulasPlanilhaExtrato(resposta({modo: "todas", conta: null, contas, linhas: []}));
        const iContas = todas.findIndex((l) => l[0]?.v === "Conta" && l[2]?.v === "Abertura (R$)");
        const colContagem = todas[iContas]!.findIndex((c) => c.v === "Não conciliados");
        assert.equal(colContagem, 6);
        assert.deepEqual(todas[iContas + 1]![colContagem], {v: 2, z: "0"});
        assert.deepEqual(todas[iContas + 1]![colContagem + 1], {v: 300, z: FORMATO_MOEDA_XLSX});
        assert.deepEqual(todas[iContas + 2]![2], {v: 50000, z: FORMATO_MOEDA_XLSX});
    });

    it("conta que começa no dia 1º: saldo inicial (fim da véspera) zero e abertura no próprio mês", () => {
        // QA Movimentações do clone: começa em 01/10/2026 com 1.000; a API manda a abertura em outubro.
        const outubro = resposta({
            conta: {id: 18, nome: "QA Movimentações", banco: null, agencia: null, conta: null},
            periodo: {inicio: "2026-10-01", fim: "2026-10-31"},
            resumo: {
                data_saldo_inicial: "2026-09-30",
                saldo_inicial: 0,
                saldo_abertura: 1000,
                inicio_conta: "2026-10-01",
                antes_do_inicio: true,
                abertura_conta: {data: "2026-10-01", valor: 1000, saldo_apos: 1000},
                entradas: 0,
                saidas: 100,
                saldo_final: 900,
            },
            linhas: [linha({id: 7, data_pgto: "2026-10-01", saida: 100, saldo_apos: 900})],
        });
        assert.deepEqual(linhasResumo(outubro).slice(0, 2), [
            ["Saldo inicial (fim de 30/09/2026)", 0],
            ["Saldo de abertura da conta (01/10/2026)", 1000],
        ]);
        // Abertura antes do movimento do dia 1º, que já sai do saldo aberto.
        const itens = itensDoExtrato(outubro.linhas, outubro.resumo.abertura_conta);
        assert.deepEqual(itens.map((i) => (i.tipo === "linha" ? i.linha.id : "abertura")), ["abertura", 7]);
        assert.match(String(avisoInicioConta(outubro)), /"Saldo de abertura" em 01\/10\/2026\.$/);
    });
});
