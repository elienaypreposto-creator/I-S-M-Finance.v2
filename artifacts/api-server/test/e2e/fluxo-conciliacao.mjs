/**
 * E2E do fluxo Conciliação → Lançamentos contra uma API rodando.
 *
 * Cada execução cria conta, títulos e extrato próprios (prefixo E2E-<run>),
 * então pode rodar repetidas vezes no mesmo banco.
 *
 * Variáveis:
 *   E2E_BASE_URL      ex.: http://127.0.0.1:5000/api
 *   E2E_EMAIL         usuário de teste
 *   E2E_SENHA         senha do usuário de teste
 *   E2E_EMPRESA_ID    empresa usada no fluxo (padrão: primeira da lista)
 *   E2E_EMPRESA_B_ID  opcional: segunda empresa, para o teste de isolamento
 *
 * Uso: node --test test/e2e/fluxo-conciliacao.mjs
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, before, describe, it} from "node:test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5000/api";
const EMAIL = process.env.E2E_EMAIL;
const SENHA = process.env.E2E_SENHA;
const EMPRESA_ID = process.env.E2E_EMPRESA_ID ? Number(process.env.E2E_EMPRESA_ID) : null;
const EMPRESA_B_ID = process.env.E2E_EMPRESA_B_ID ? Number(process.env.E2E_EMPRESA_B_ID) : null;

if (!EMAIL || !SENHA) {
    throw new Error("Defina E2E_EMAIL e E2E_SENHA.");
}

const RUN = randomUUID().slice(0, 8);
// IP por execução: o limitador global conta por IP e a API confia em 1 proxy.
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const ABERTOS = ["pendente", "atrasado"];

function diaIso(offset) {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
}

async function api(method, path, {token, body, form, ip = IP} = {}) {
    const headers = {"X-Forwarded-For": ip};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
        payload = form;
    } else if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, {method, headers, body: payload});
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = {raw: text};
    }
    return {status: res.status, json, data: json?.data ?? json};
}

async function login(empresaId) {
    const r = await api("POST", "/auth/login", {body: {email: EMAIL, senha: SENHA}});
    assert.equal(r.status, 200, `login: ${JSON.stringify(r.json)}`);
    if (r.data.accessToken) return r.data.accessToken;
    const empresa = empresaId ?? r.data.empresas[0].id ?? r.data.empresas[0].empresa_id;
    const s = await api("POST", "/auth/select-empresa", {
        body: {selectionToken: r.data.selectionToken, empresa_id: empresa},
    });
    assert.equal(s.status, 200, `select-empresa: ${JSON.stringify(s.json)}`);
    return s.data.accessToken;
}

function ofx(linhas) {
    const trns = linhas
        .map(
            (l) => `<STMTTRN>
<TRNTYPE>${l.valor < 0 ? "DEBIT" : "CREDIT"}
<DTPOSTED>${l.data.replace(/-/g, "")}120000[-3:BRT]
<TRNAMT>${l.valor.toFixed(2)}
<FITID>E2E${RUN}${l.fitid}
<MEMO>${l.memo}
</STMTTRN>`,
        )
        .join("\n");
    const datas = linhas.map((l) => l.data.replace(/-/g, "")).sort();
    return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>999<ACCTID>E2E${RUN}</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${datas[0]}
<DTEND>${datas[datas.length - 1]}
${trns}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;
}

const ctx = {token: null};

async function criarConta(sufixo) {
    const r = await api("POST", "/contas-bancarias", {
        token: ctx.token,
        body: {tipo: "Conta Corrente", nome: `E2E-${RUN} ${sufixo}`, data_inicio: diaIso(-90), saldo_inicial: 0},
    });
    assert.equal(r.status, 201, `criar conta: ${JSON.stringify(r.json)}`);
    return r.data.id;
}

async function criarTitulo({tipo = "CP", valor, vencimento, descricao, extra = {}}) {
    const r = await api("POST", "/lancamentos", {
        token: ctx.token,
        body: {tipo, valor: String(valor), vencimento, descricao: `E2E-${RUN} ${descricao}`, ...extra},
    });
    assert.equal(r.status, 201, `criar título: ${JSON.stringify(r.json)}`);
    return r.data;
}

async function titulo(id) {
    const r = await api("GET", `/lancamentos/${id}`, {token: ctx.token});
    assert.equal(r.status, 200, `GET título ${id}: ${JSON.stringify(r.json)}`);
    return r.data;
}

async function importar(contaId, linhas) {
    const form = new FormData();
    form.append("conta_id", String(contaId));
    form.append("arquivo", new Blob([ofx(linhas)], {type: "application/x-ofx"}), `e2e-${RUN}.ofx`);
    const r = await api("POST", "/conciliacoes/importar", {token: ctx.token, form});
    assert.equal(r.status, 201, `importar: ${JSON.stringify(r.json)}`);
    const det = await extrato(r.data.extrato_id);
    const porFitid = {};
    for (const l of linhas) {
        const achada = det.linhas.find(
            (x) => Math.abs(Number(x.valor) - Math.abs(l.valor)) < 0.005 && x.data_movimento === l.data,
        );
        assert.ok(achada, `linha ${l.fitid} não encontrada no extrato`);
        porFitid[l.fitid] = achada.linha_id;
    }
    return {extratoId: r.data.extrato_id, conciliacaoId: r.data.conciliacao_id, linhas: porFitid};
}

async function extrato(extratoId) {
    const r = await api("GET", `/conciliacoes/${extratoId}`, {token: ctx.token});
    assert.equal(r.status, 200, `GET extrato: ${JSON.stringify(r.json)}`);
    return r.data;
}

async function salvar(extratoId, acoes, finalizar = false) {
    return api("POST", `/conciliacoes/${extratoId}/salvar`, {token: ctx.token, body: {acoes, finalizar}});
}

function vincular(linhaId, lancamentoId, extra = {}) {
    const {desconto, juros_multa, ...resto} = extra;
    const item = {lancamento_id: lancamentoId};
    if (desconto !== undefined) item.desconto = desconto;
    if (juros_multa !== undefined) item.juros_multa = juros_multa;
    return {tipo: "vincular", linha_id: linhaId, lancamentos: [item], ...resto};
}

const num = (v) => (v == null ? 0 : Number(v));

/**
 * Comportamentos ainda não entregues: rodam e reportam, mas não reprovam a
 * esteira. Cada entrega remove a sua linha daqui.
 */
const PENDENTES = {
    "pagamento parcial: origem quitada pelo resíduo e resíduo seguinte com o saldo certo": "razão de quitação (PR2)",
    "desconto editado no vínculo recalcula o título": "razão de quitação (PR2)",
    "excluir título com vínculo responde 409, não 500": "tela de Lançamentos (PR1)",
    "valor inválido é rejeitado": "tela de Lançamentos (PR1)",
};

function caso(nome, opcoes, fn) {
    if (typeof opcoes === "function") {
        fn = opcoes;
        opcoes = {};
    }
    it(nome, {...opcoes, todo: PENDENTES[nome]}, fn);
}

describe(`Fluxo conciliação → lançamentos (run ${RUN})`, {concurrency: false}, () => {
    const D = {d1: diaIso(-20), d2: diaIso(-18), d3: diaIso(-15), d4: diaIso(-12), d5: diaIso(-10), d6: diaIso(-8), d7: diaIso(-6)};
    const s = {};

    before(async () => {
        ctx.token = await login(EMPRESA_ID);
        s.conta = await criarConta("Principal");
        s.t1 = await criarTitulo({valor: "150.00", vencimento: D.d1, descricao: "fornecedor 150"});
        s.t3 = await criarTitulo({valor: "1000.00", vencimento: D.d3, descricao: "fornecedor 1000"});
        s.t6 = await criarTitulo({valor: "100.00", vencimento: D.d6, descricao: "fornecedor 100 com desconto"});
        // NF de 1000 para órgão público com 100 retidos na fonte: o extrato traz 900.
        s.t7 = await criarTitulo({
            tipo: "CR",
            valor: "1000.00",
            vencimento: D.d7,
            descricao: "NF 1000 com retenções",
            extra: {retencao_ir: "15.00", retencao_pis: "6.50", retencao_cofins: "30.00", retencao_csll: "10.00", retencao_iss: "38.50"},
        });
        s.imp = await importar(s.conta, [
            {fitid: "L1", data: D.d1, valor: -150, memo: "PAG FORNECEDOR 150"},
            {fitid: "L2", data: D.d2, valor: 980, memo: "RECEB CLIENTE 980"},
            {fitid: "L3", data: D.d3, valor: -300, memo: "PAG PARCIAL 300"},
            {fitid: "L4", data: D.d4, valor: -200, memo: "PAG PARCIAL 200"},
            {fitid: "L5", data: D.d5, valor: -45.9, memo: "TARIFA"},
            {fitid: "L6", data: D.d6, valor: -90, memo: "PAG FORNECEDOR 100 COM DESCONTO"},
            {fitid: "L7", data: D.d7, valor: 900, memo: "RECEB ORGAO PUBLICO LIQUIDO"},
        ]);
    });

    caso("título criado em Lançamentos aparece na conciliação e é quitado ao salvar", async () => {
        const l1 = s.imp.linhas.L1;
        const busca = await api("GET", `/conciliacoes/buscar-lancamentos?linha_id=${l1}&dias_janela=14`, {
            token: ctx.token,
        });
        assert.equal(busca.status, 200);
        assert.ok(busca.data.some((c) => c.id === s.t1.id), "título não apareceu como candidato");

        const r = await salvar(s.imp.extratoId, [vincular(l1, s.t1.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const t = await titulo(s.t1.id);
        assert.equal(t.status, "pago");
        assert.equal(num(t.valor_quitado), 150);
        assert.equal(t.conta_id, s.conta);
        assert.equal(String(t.data_quitacao).slice(0, 10), D.d1);
    });

    caso("título com retenção na fonte é quitado pelo líquido, sem desconto", async () => {
        const l7 = s.imp.linhas.L7;
        const antes = await titulo(s.t7.id);
        assert.equal(num(antes.valor), 1000);
        assert.equal(num(antes.valor_liquido), 900);
        assert.equal(num(antes.retencao_iss), 38.5);

        const busca = await api("GET", `/conciliacoes/buscar-lancamentos?linha_id=${l7}&dias_janela=14`, {
            token: ctx.token,
        });
        assert.equal(busca.status, 200);
        const cand = busca.data.find((c) => c.id === s.t7.id);
        assert.ok(cand, "título com retenção não apareceu como candidato");
        assert.equal(num(cand.valor_liquido), 900);
        assert.equal(num(cand.total_retencoes), 100);
        assert.equal(num(cand.saldo_aberto_titulo), 900);

        const r = await salvar(s.imp.extratoId, [vincular(l7, s.t7.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const t = await titulo(s.t7.id);
        assert.equal(t.status, "recebido");
        assert.equal(num(t.desconto), 0);
        assert.equal(num(t.valor_quitado), 900);

        const det = await extrato(s.imp.extratoId);
        const v = det.linhas.find((x) => x.linha_id === l7).vinculacoes[0];
        assert.equal(num(v.valor_vinculado), 900);
        assert.equal(num(v.total_retencoes), 100);
        assert.equal(v.residuo_pendente, null);
    });

    caso("contábil/fiscal exporta bruto, retenções e valor pago do título com retenção", async () => {
        const r = await api("GET", `/relatorios/contabil-fiscal?data_inicio=${D.d7}&data_fim=${D.d7}&tipo=CR`, {
            token: ctx.token,
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const linha = r.data.find((i) => num(i.valor) === 1000 && num(i.retencao_iss) === 38.5);
        assert.ok(linha, "título com retenção não apareceu no contábil/fiscal");
        assert.equal(num(linha.valor_pago), 900);
        assert.equal(num(linha.retencao_ir), 15);
        assert.equal(num(linha.desconto), 0);
    });

    caso("retenções: soma acima do valor é rejeitada e título quitado não muda retenção", async () => {
        const r = await api("POST", "/lancamentos", {
            token: ctx.token,
            body: {tipo: "CR", valor: "100.00", vencimento: D.d7, descricao: `E2E-${RUN} retenção demais`, retencao_ir: "60", retencao_iss: "40.01"},
        });
        assert.equal(r.status, 400, JSON.stringify(r.json));
        const neg = await api("POST", "/lancamentos", {
            token: ctx.token,
            body: {tipo: "CR", valor: "100.00", vencimento: D.d7, descricao: `E2E-${RUN} retenção negativa`, retencao_ir: "-1"},
        });
        assert.equal(neg.status, 400, JSON.stringify(neg.json));
        const put = await api("PUT", `/lancamentos/${s.t7.id}`, {token: ctx.token, body: {retencao_ir: "20.00"}});
        assert.equal(put.status, 409, JSON.stringify(put.json));
    });

    caso("título criado pela linha do extrato já nasce recebido e aparece em Lançamentos", async () => {
        const l2 = s.imp.linhas.L2;
        const r = await api("POST", `/conciliacoes/linhas/${l2}/criar-lancamento`, {
            token: ctx.token,
            body: {tipo: "CR", vencimento: D.d2, valor: 980, descricao: `E2E-${RUN} recebimento pela linha`},
        });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        s.t2 = r.data.lancamento?.id ?? r.data.lancamento_id ?? r.data.id;
        assert.ok(s.t2, `id do título não retornado: ${JSON.stringify(r.data)}`);

        const lista = await api("GET", `/lancamentos?search=${encodeURIComponent(`E2E-${RUN} recebimento`)}`, {
            token: ctx.token,
        });
        assert.equal(lista.status, 200);
        const item = lista.data.find((x) => x.id === s.t2);
        assert.ok(item, "título criado pela conciliação não aparece na lista de Lançamentos");
        assert.ok(Number(item.valor) > 0, "valor deve ser positivo");
        assert.equal(item.status, "recebido", "vínculo salvo deve quitar o título na hora");
    });

    caso("pagamento parcial: origem quitada pelo resíduo e resíduo seguinte com o saldo certo", async () => {
        const {L3, L4} = s.imp.linhas;
        let r = await salvar(s.imp.extratoId, [{...vincular(L3, s.t3.id), gerar_parcial: true}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));

        const det = await extrato(s.imp.extratoId);
        const v = det.linhas.find((x) => x.linha_id === L3).vinculacoes[0];
        const r1 = v.residuo_gerado?.id;
        assert.ok(r1, "resíduo não gerado");
        assert.equal(num((await titulo(r1)).valor), 700);
        assert.equal((await titulo(s.t3.id)).status, "pago", "origem com o restante no resíduo deve ficar paga");

        const busca = await api("GET", `/conciliacoes/buscar-lancamentos?linha_id=${L4}&dias_janela=30`, {
            token: ctx.token,
        });
        assert.ok(!busca.data.some((c) => c.id === s.t3.id), "origem não deve continuar como candidata (saldo em dobro)");

        r = await salvar(s.imp.extratoId, [{...vincular(L4, r1), gerar_parcial: true}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const det2 = await extrato(s.imp.extratoId);
        const r2 = det2.linhas.find((x) => x.linha_id === L4).vinculacoes[0].residuo_gerado?.id;
        assert.ok(r2 && r2 !== r1, "segundo resíduo deve ser novo");
        assert.equal(num((await titulo(r2)).valor), 500);
        s.r1 = r1;
        s.r2 = r2;
    });

    caso("desfazer pelo Salvar devolve o título para aberto", async () => {
        const r = await salvar(s.imp.extratoId, [{tipo: "desfazer", linha_id: s.imp.linhas.L1}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const t = await titulo(s.t1.id);
        assert.ok(ABERTOS.includes(t.status), `status ${t.status}`);
        assert.equal(num(t.valor_quitado), 0);
        assert.equal(t.data_quitacao ?? null, null);
    });

    caso("excluir um vínculo com a conciliação aberta reverte o título", async () => {
        const l1 = s.imp.linhas.L1;
        let r = await salvar(s.imp.extratoId, [vincular(l1, s.t1.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const det = await extrato(s.imp.extratoId);
        const vinculoId = det.linhas.find((x) => x.linha_id === l1).vinculacoes[0].vinculo_id;
        r = await api("DELETE", `/conciliacoes/vinculos/${vinculoId}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const t = await titulo(s.t1.id);
        assert.ok(ABERTOS.includes(t.status), `status ${t.status}`);
        assert.equal(num(t.valor_quitado), 0);
    });

    caso("desconto editado no vínculo recalcula o título", async () => {
        const l6 = s.imp.linhas.L6;
        let r = await salvar(s.imp.extratoId, [vincular(l6, s.t6.id, {desconto: 10})]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(s.t6.id)).status, "pago");
        const det = await extrato(s.imp.extratoId);
        const vinculoId = det.linhas.find((x) => x.linha_id === l6).vinculacoes[0].vinculo_id;
        r = await api("PATCH", `/conciliacoes/vinculos/${vinculoId}`, {token: ctx.token, body: {desconto: 0}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const t = await titulo(s.t6.id);
        assert.equal(t.status, "pago_parcial", "sem desconto, 90 não quita 100");
    });

    caso("excluir título com vínculo responde 409, não 500", async () => {
        const r = await api("DELETE", `/lancamentos/${s.t2}`, {token: ctx.token});
        assert.equal(r.status, 409, JSON.stringify(r.json));
    });

    caso("valor inválido é rejeitado", async () => {
        for (const valor of ["abc", "-10", "0", "10.999"]) {
            const r = await api("POST", "/lancamentos", {
                token: ctx.token,
                body: {tipo: "CP", valor, vencimento: D.d1, descricao: `E2E-${RUN} inválido`},
            });
            assert.equal(r.status, 400, `valor ${valor} aceito: ${JSON.stringify(r.json)}`);
        }
    });

    caso("status manual é ignorado", async () => {
        const t = await criarTitulo({valor: "10.00", vencimento: D.d1, descricao: "status manual", extra: {status: "pago"}});
        assert.ok(ABERTOS.includes(t.status), `status manual gravado: ${t.status}`);
        assert.equal(num(t.valor_quitado), 0);

        // Na edição também: quitação só pela conciliação, status pedido é ignorado.
        for (const status of ["pago", "pago_parcial"]) {
            const r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body: {status}});
            assert.equal(r.status, 200, JSON.stringify(r.json));
            const tt = await titulo(t.id);
            assert.ok(ABERTOS.includes(tt.status), `PUT gravou status manual ${tt.status}`);
            assert.equal(num(tt.valor_quitado), 0);
            assert.equal(tt.data_quitacao ?? null, null);
        }

        // Título aberto continua podendo ser cancelado e reaberto.
        let r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body: {status: "cancelado"}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(t.id)).status, "cancelado");
        r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body: {status: "pendente"}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(t.id)).status, "pendente");
    });

    caso("lançamento criado pela tela grava quem criou", async () => {
        const t = await criarTitulo({valor: "12.00", vencimento: D.d5, descricao: "criado por"});
        assert.ok(Number.isInteger(t.criado_por) && t.criado_por > 0, `criado_por: ${t.criado_por}`);
        assert.equal((await titulo(t.id)).criado_por, t.criado_por);
    });

    caso("título quitado pela conciliação fica só leitura no formulário e desfaz pela conciliação", async () => {
        const conta = await criarConta("Quitacao");
        const t = await criarTitulo({tipo: "CR", valor: "250.00", vencimento: D.d2, descricao: "quitado pela conciliação"});
        const imp = await importar(conta, [{fitid: "Q1", data: D.d2, valor: 250, memo: "RECEB CLIENTE 250"}]);
        const saldo = async () => {
            const r = await api("GET", "/contas-bancarias", {token: ctx.token});
            assert.equal(r.status, 200);
            return num(r.data.find((c) => c.id === conta)?.saldo_atual);
        };
        const movimentacoes = async () => {
            const r = await api(
                "GET",
                `/relatorios/contabil-fiscal/movimentacoes?conta_id=${conta}&data_inicio=${D.d1}&data_fim=${D.d7}`,
                {token: ctx.token},
            );
            assert.equal(r.status, 200, JSON.stringify(r.json));
            return r.data;
        };

        let r = await salvar(imp.extratoId, [vincular(imp.linhas.Q1, t.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        let tt = await titulo(t.id);
        assert.equal(tt.status, "recebido");
        assert.equal(tt.tem_conciliacao, true);
        assert.equal(tt.conta_id, conta);
        assert.equal(tt.conta_nome, `E2E-${RUN} Quitacao`);
        assert.equal(num(tt.valor_quitado), 250);
        assert.equal(String(tt.data_quitacao).slice(0, 10), D.d2);
        assert.equal(await saldo(), 250);
        let mov = await movimentacoes();
        const linha = mov.linhas.find((l) => l.id === t.id);
        assert.ok(linha, "título quitado não aparece nas movimentações da conta");
        assert.equal(num(linha.entrada), 250);

        // Formulário reenviando o título inteiro (status atual) salva sem mexer na quitação.
        r = await api("PUT", `/lancamentos/${t.id}`, {
            token: ctx.token,
            body: {tipo: "CR", vencimento: D.d2, valor: "250.00", conta_id: conta, status: "recebido", descricao: `E2E-${RUN} quitado editado`},
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        tt = await titulo(t.id);
        assert.equal(tt.descricao, `E2E-${RUN} quitado editado`);
        assert.equal(tt.status, "recebido");
        assert.equal(num(tt.valor_quitado), 250);

        // Reabrir ou cancelar pelo formulário é recusado: nada muda no saldo.
        for (const status of ["pendente", "atrasado", "cancelado"]) {
            r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body: {status}});
            assert.equal(r.status, 409, `${status}: ${JSON.stringify(r.json)}`);
        }
        tt = await titulo(t.id);
        assert.equal(tt.status, "recebido");
        assert.equal(num(tt.valor_quitado), 250);
        assert.equal(await saldo(), 250);

        // Desfazer na conciliação reabre o título e tira do saldo e das movimentações.
        r = await salvar(imp.extratoId, [{tipo: "desfazer", linha_id: imp.linhas.Q1}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        tt = await titulo(t.id);
        assert.ok(ABERTOS.includes(tt.status), `status ${tt.status}`);
        assert.equal(tt.tem_conciliacao, false);
        assert.equal(num(tt.valor_quitado), 0);
        assert.equal(await saldo(), 0);
        mov = await movimentacoes();
        assert.ok(!mov.linhas.some((l) => l.id === t.id), "título reaberto continua nas movimentações");
    });

    caso("título quitado pela conciliação não muda valor, tipo, conta, juros nem retenções; descritivos passam", async () => {
        // QA: título pago por 1.502,50 aceitou valor 1.600 -> 1.700 sem aviso.
        const conta = await criarConta("Trava valor");
        const t = await criarTitulo({tipo: "CP", valor: "1600.00", vencimento: D.d3, descricao: "trava valor", extra: {retencao_ir: "97.50"}});
        const imp = await importar(conta, [{fitid: "TV1", data: D.d3, valor: -1502.5, memo: "PAG TRAVA 1502,50"}]);
        let r = await salvar(imp.extratoId, [vincular(imp.linhas.TV1, t.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        let tt = await titulo(t.id);
        assert.equal(tt.status, "pago");
        assert.equal(num(tt.valor_quitado), 1502.5);

        for (const body of [{valor: "1700.00"}, {tipo: "CR"}, {juros: "10.00"}, {desconto: "5.00"}, {retencao_ir: "0"}, {conta_id: null}]) {
            r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body});
            assert.equal(r.status, 409, `${JSON.stringify(body)}: ${JSON.stringify(r.json)}`);
            assert.match(JSON.stringify(r.json), /desfaça o vínculo na Conciliação/);
        }
        tt = await titulo(t.id);
        assert.equal(num(tt.valor), 1600);
        assert.equal(num(tt.valor_liquido), 1502.5);
        assert.equal(num(tt.valor_quitado), 1502.5);
        assert.equal(tt.tipo, "CP");
        assert.equal(tt.conta_id, conta);

        // Formulário reenviando o título inteiro, mudando só o descritivo: passa.
        r = await api("PUT", `/lancamentos/${t.id}`, {
            token: ctx.token,
            body: {
                tipo: "CP",
                vencimento: D.d3,
                valor: "1600.00",
                desconto: "0.00",
                juros: "0.00",
                retencao_ir: "97.50",
                conta_id: conta,
                status: "pago",
                descricao: `E2E-${RUN} trava editada`,
                observacao: "só descritivo",
            },
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        tt = await titulo(t.id);
        assert.equal(tt.descricao, `E2E-${RUN} trava editada`);
        assert.equal(tt.observacao, "só descritivo");
        assert.equal(num(tt.valor_quitado), 1502.5);

        // Desfeito o vínculo, o título volta a ser editável.
        r = await salvar(imp.extratoId, [{tipo: "desfazer", linha_id: imp.linhas.TV1}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body: {desconto: "5.00"}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(num((await titulo(t.id)).desconto), 5);
    });

    caso("resumo e exportação respondem com os filtros da lista", async () => {
        const q = `search=${encodeURIComponent(`E2E-${RUN}`)}`;
        const resumo = await api("GET", `/lancamentos/resumo?${q}`, {token: ctx.token});
        assert.equal(resumo.status, 200, JSON.stringify(resumo.json));
        const exp = await api("GET", `/lancamentos/export?${q}`, {token: ctx.token});
        assert.equal(exp.status, 200, JSON.stringify(exp.json));
        assert.ok(Array.isArray(exp.data) && exp.data.length >= 4);
        assert.equal(resumo.data.total, exp.json.meta.total);

        // A receber / A pagar = só em aberto, no valor da linha; Recebido / Pago = quitado.
        // QA: o resumo somava pago e cancelado, pelo líquido, enquanto a linha mostrava o bruto.
        const tag = `E2E-${RUN} resumo`;
        const conta = await criarConta("Resumo");
        await criarTitulo({tipo: "CP", valor: "100.00", vencimento: D.d4, descricao: "resumo aberto"});
        await criarTitulo({tipo: "CP", valor: "50.00", vencimento: D.d4, descricao: "resumo cancelado", extra: {status: "cancelado"}});
        await criarTitulo({tipo: "CR", valor: "300.00", vencimento: D.d4, descricao: "resumo receber", extra: {retencao_iss: "30.00"}});
        const quitado = await criarTitulo({tipo: "CP", valor: "80.00", vencimento: D.d4, descricao: "resumo quitado"});
        const parcial = await criarTitulo({tipo: "CP", valor: "500.00", vencimento: D.d4, descricao: "resumo parcial"});
        const imp = await importar(conta, [
            {fitid: "RS1", data: D.d4, valor: -80, memo: "PAG RESUMO 80"},
            {fitid: "RS2", data: D.d5, valor: -400, memo: "PAG RESUMO PARCIAL 400"},
        ]);
        let r = await salvar(imp.extratoId, [vincular(imp.linhas.RS1, quitado.id), vincular(imp.linhas.RS2, parcial.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(parcial.id)).status, "pago_parcial");

        const filtro = `search=${encodeURIComponent(tag)}`;
        r = await api("GET", `/lancamentos/resumo?${filtro}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.total, 5);
        // CP: 100 aberto + 100 que falta do parcial (cancelado e pago fora). CR: 300 bruto, como a linha.
        assert.deepEqual(r.data.totais, {receber: 300, pagar: 200, recebido: 0, pago: 480});

        const lista = await api("GET", `/lancamentos?${filtro}&limit=1`, {token: ctx.token});
        assert.equal(lista.status, 200, JSON.stringify(lista.json));
        assert.equal(lista.json.meta.total, 5);
        assert.deepEqual(lista.json.meta.totais, r.data.totais);

        r = await api("GET", `/lancamentos/resumo?${filtro}&tipo=CR`, {token: ctx.token});
        assert.equal(r.data.total, 1);
        assert.deepEqual(r.data.totais, {receber: 300, pagar: 0, recebido: 0, pago: 0});
        r = await api("GET", `/lancamentos/resumo?${filtro}&status=cancelado`, {token: ctx.token});
        assert.equal(r.data.total, 1);
        assert.equal(r.data.totais.pagar, 0);

        const expTag = await api("GET", `/lancamentos/export?${filtro}`, {token: ctx.token});
        assert.equal(expTag.status, 200, JSON.stringify(expTag.json));
        assert.equal(expTag.data.length, 5);
        const linhaParcial = expTag.data.find((l) => l.id === parcial.id);
        assert.equal(num(linhaParcial.valor), 500);
        assert.equal(num(linhaParcial.valor_em_aberto), 100);
        assert.equal(num(linhaParcial.valor_quitado), 400);
        const expCp = await api("GET", `/lancamentos/export?${filtro}&tipo=CP`, {token: ctx.token});
        assert.equal(expCp.data.length, 4);
        assert.ok(expCp.data.every((l) => l.tipo === "CP"));
    });

    caso("pago parcial vencido entra em CP/CR Vencidos e nos alertas pelo que falta", async () => {
        // QA: venc. 04/11, pago 400 de 500 -> os 100 restantes sumiam do Painel.
        const kpis = async () => {
            const r = await api("GET", "/dashboard/kpis", {token: ctx.token});
            assert.equal(r.status, 200, JSON.stringify(r.json));
            return r.data;
        };
        const centavos = (v) => Math.round(num(v) * 100);
        const antes = await kpis();

        const conta = await criarConta("Vencido parcial");
        const cp = await criarTitulo({tipo: "CP", valor: "500.00", vencimento: D.d1, descricao: "vencido parcial CP"});
        const cr = await criarTitulo({tipo: "CR", valor: "800.00", vencimento: D.d1, descricao: "vencido parcial CR"});
        const imp = await importar(conta, [
            {fitid: "VP1", data: D.d2, valor: -400, memo: "PAG PARCIAL VENCIDO"},
            {fitid: "VP2", data: D.d2, valor: 300, memo: "RECEB PARCIAL VENCIDO"},
        ]);
        const r = await salvar(imp.extratoId, [vincular(imp.linhas.VP1, cp.id), vincular(imp.linhas.VP2, cr.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(cp.id)).status, "pago_parcial");
        assert.equal((await titulo(cr.id)).status, "pago_parcial");

        const depois = await kpis();
        assert.equal(centavos(depois.contasPagarAtraso) - centavos(antes.contasPagarAtraso), 10000, "CP Vencidos sem os 100 restantes");
        assert.equal(centavos(depois.contasReceberAtraso) - centavos(antes.contasReceberAtraso), 50000, "CR Vencidos sem os 500 restantes");

        const alertas = await api("GET", "/dashboard/alertas-atraso?limit=1000", {token: ctx.token});
        assert.equal(alertas.status, 200, JSON.stringify(alertas.json));
        const alerta = alertas.data.find((a) => a.id === cp.id);
        assert.ok(alerta, "pago parcial vencido não aparece nos alertas");
        assert.equal(num(alerta.valor), 100);
    });

    caso("pago parcial com residual: o restante conta uma vez só (no residual)", async () => {
        // Prod: 200.000 pago 9 -> residual 199.991; o resumo e o Painel somavam o
        // restante do título de origem E o residual.
        const kpis = async () => {
            const r = await api("GET", "/dashboard/kpis", {token: ctx.token});
            assert.equal(r.status, 200, JSON.stringify(r.json));
            return r.data;
        };
        const centavos = (v) => Math.round(num(v) * 100);
        const antes = await kpis();

        const tag = `E2E-${RUN} residual resumo`;
        const conta = await criarConta("Residual resumo");
        const cp = await criarTitulo({tipo: "CP", valor: "500.00", vencimento: D.d1, descricao: "residual resumo"});
        const imp = await importar(conta, [{fitid: "RR1", data: D.d2, valor: -400, memo: "PAG PARCIAL COM RESIDUAL"}]);
        let r = await salvar(imp.extratoId, [{...vincular(imp.linhas.RR1, cp.id), gerar_parcial: true}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const det = await extrato(imp.extratoId);
        const residualId = det.linhas.find((x) => x.linha_id === imp.linhas.RR1).vinculacoes[0].residuo_gerado?.id;
        assert.ok(residualId, "resíduo não gerado");
        assert.equal(num((await titulo(residualId)).valor), 100);

        // Resumo/lista/export do título de origem: o que falta está no residual.
        const filtro = `search=${encodeURIComponent(tag)}`;
        r = await api("GET", `/lancamentos/resumo?${filtro}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.total, 1);
        assert.deepEqual(r.data.totais, {receber: 0, pagar: 0, recebido: 0, pago: 400});
        const exp = await api("GET", `/lancamentos/export?${filtro}`, {token: ctx.token});
        assert.equal(exp.status, 200, JSON.stringify(exp.json));
        const linhaOrigem = exp.data.find((l) => l.id === cp.id);
        assert.equal(num(linhaOrigem.valor_em_aberto), 0);
        assert.equal(linhaOrigem.tem_residual_ativo, true);

        // Painel: 100 a mais em CP Vencidos (o residual), não 200.
        const depois = await kpis();
        assert.equal(centavos(depois.contasPagarAtraso) - centavos(antes.contasPagarAtraso), 10000, "restante contado em dobro");
        const alertas = await api("GET", "/dashboard/alertas-atraso?limit=1000", {token: ctx.token});
        assert.equal(alertas.status, 200, JSON.stringify(alertas.json));
        assert.ok(!alertas.data.some((a) => a.id === cp.id), "origem com residual não deve aparecer nos alertas");
        assert.equal(num(alertas.data.find((a) => a.id === residualId)?.valor), 100);
    });

    caso("regra que classifica todas as linhas não conclui o extrato sozinha; Conciliar finaliza", async () => {
        // QA: extrato #15 do clone (55 linhas, todas casando com a regra) ficou
        // "conciliado" na importação sem quitar nenhum título e sem como finalizar.
        const conta = await criarConta("Regra");
        const gatilho = `QA LOTE ${RUN}`;
        const regra = await api("POST", "/regras-conciliacao", {
            token: ctx.token,
            body: {conta_id: conta, texto_gatilho: gatilho, natureza: "saida", criar_lancamento_automatico: true},
        });
        assert.equal(regra.status, 201, JSON.stringify(regra.json));
        const imp = await importar(conta, [
            {fitid: "R1", data: D.d2, valor: -40, memo: `${gatilho} TARIFA 1`},
            {fitid: "R2", data: D.d3, valor: -12.5, memo: `${gatilho} TARIFA 2`},
        ]);

        let det = await extrato(imp.extratoId);
        assert.ok(det.linhas.every((l) => l.status === "vinculado"), "a regra devia vincular as duas linhas");
        assert.notEqual(det.extrato.status, "conciliado", "importar não finaliza o extrato");
        assert.equal(det.conciliacao.finalizada, false);
        const lista = await api("GET", `/conciliacoes?conta_id=${conta}&status=pendente,parcial`, {token: ctx.token});
        assert.equal(lista.status, 200, JSON.stringify(lista.json));
        assert.ok(lista.data.some((x) => x.extrato_id === imp.extratoId), "extrato some da lista de pendentes");

        // Vínculo gravado pela regra já quita o título (mesma regra do Salvar).
        const ids = det.linhas.map((l) => l.vinculacoes[0].lancamento_id);
        const valores = {};
        for (const id of ids) {
            const t = await titulo(id);
            assert.equal(t.status, "pago", `título #${id} ficou ${t.status}`);
            assert.equal(t.conta_id, conta);
            valores[id] = num(t.valor_quitado);
        }
        assert.deepEqual(Object.values(valores).sort((a, b) => a - b), [12.5, 40]);

        // Sem rascunho nenhum, o Conciliar (finalizar) fecha o extrato.
        const r = await salvar(imp.extratoId, [], true);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.finalizado, true);
        det = await extrato(imp.extratoId);
        assert.equal(det.extrato.status, "conciliado");
        assert.equal(det.conciliacao.finalizada, true);
        for (const id of ids) {
            const t = await titulo(id);
            assert.equal(t.status, "pago");
            assert.equal(num(t.valor_quitado), valores[id], "finalizar não pode somar de novo");
        }
        s.regra = {extratoId: imp.extratoId, conciliacaoId: imp.conciliacaoId, ids};
    });

    caso("extrato finalizado não é excluído; reaberto, a exclusão remove os lançamentos criados pela regra", async () => {
        assert.ok(s.regra, "depende do caso da regra");
        let r = await api("DELETE", `/conciliacoes/${s.regra.extratoId}`, {token: ctx.token});
        assert.equal(r.status, 409, JSON.stringify(r.json));
        r = await api("POST", `/conciliacoes/${s.regra.conciliacaoId}/reabrir`, {token: ctx.token, body: {}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        r = await api("DELETE", `/conciliacoes/${s.regra.extratoId}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.lancamentos_excluidos, s.regra.ids.length);
        for (const id of s.regra.ids) {
            const g = await api("GET", `/lancamentos/${id}`, {token: ctx.token});
            assert.equal(g.status, 404, `lançamento #${id} criado pela regra ficou órfão`);
        }
    });

    caso("finalizar trava o extrato e reabrir libera", async () => {
        const pendentes = (await extrato(s.imp.extratoId)).linhas.filter((x) => x.status === "pendente");
        const acoes = pendentes.map((x) => ({tipo: "ignorar", linha_id: x.linha_id, motivo_codigo: "outro", motivo: "E2E"}));
        let r = await salvar(s.imp.extratoId, acoes, true);
        assert.equal(r.status, 200, JSON.stringify(r.json));

        r = await salvar(s.imp.extratoId, [{tipo: "desfazer", linha_id: s.imp.linhas.L6}]);
        assert.equal(r.status, 409, `desfazer em extrato finalizado: ${JSON.stringify(r.json)}`);

        r = await api("POST", `/conciliacoes/${s.imp.conciliacaoId}/reabrir`, {token: ctx.token, body: {}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        r = await salvar(s.imp.extratoId, [{tipo: "desfazer", linha_id: s.imp.linhas.L6}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
    });

    caso("excluir extrato não finalizado reabre títulos e remove os criados por ele", async () => {
        const conta = await criarConta("Exclusao");
        const t = await criarTitulo({valor: "77.70", vencimento: D.d5, descricao: "excluir extrato"});
        const imp = await importar(conta, [
            {fitid: "X1", data: D.d5, valor: -77.7, memo: "PAG 77,70"},
            {fitid: "X2", data: D.d5, valor: -12.34, memo: "PAG AVULSO"},
        ]);
        let r = await salvar(imp.extratoId, [vincular(imp.linhas.X1, t.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        r = await api("POST", `/conciliacoes/linhas/${imp.linhas.X2}/criar-lancamento`, {
            token: ctx.token,
            body: {tipo: "CP", vencimento: D.d5, valor: 12.34, descricao: `E2E-${RUN} avulso`},
        });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        const avulso = r.data.lancamento?.id ?? r.data.lancamento_id ?? r.data.id;

        r = await api("DELETE", `/conciliacoes/${imp.extratoId}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const tt = await titulo(t.id);
        assert.ok(ABERTOS.includes(tt.status), `título ficou ${tt.status}`);
        assert.equal(num(tt.valor_quitado), 0);
        const orfao = await api("GET", `/lancamentos/${avulso}`, {token: ctx.token});
        assert.equal(orfao.status, 404, "título criado pelo extrato excluído ficou órfão");
    });

    caso("excluir extrato remove o título criado pelo \"Novo\" do Vincular, não um título antigo", async () => {
        const conta = await criarConta("Novo Vincular");
        const antigo = await criarTitulo({valor: "33.00", vencimento: D.d4, descricao: "antigo marcado como novo"});
        const imp = await importar(conta, [
            {fitid: "N1", data: D.d4, valor: -55.5, memo: "PAG CRIADO NO VINCULAR"},
            {fitid: "N2", data: D.d4, valor: -33, memo: "PAG TITULO ANTIGO"},
        ]);
        // "Novo": o título nasce pelo formulário de Lançamentos e o vínculo vai no Salvar.
        const novo = await criarTitulo({valor: "55.50", vencimento: D.d4, descricao: "criado pelo Novo do Vincular"});
        let r = await salvar(
            imp.extratoId,
            [
                vincular(imp.linhas.N1, novo.id, {criado_pelo_extrato: true}),
                // Título de antes da importação não vira "criado pelo extrato" nem com a marca.
                vincular(imp.linhas.N2, antigo.id, {criado_pelo_extrato: true}),
            ],
            true,
        );
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(novo.id)).status, "pago");

        r = await api("POST", `/conciliacoes/${imp.conciliacaoId}/reabrir`, {token: ctx.token, body: {}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        r = await api("DELETE", `/conciliacoes/${imp.extratoId}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.lancamentos_excluidos, 1);

        const g = await api("GET", `/lancamentos/${novo.id}`, {token: ctx.token});
        assert.equal(g.status, 404, "título do \"Novo\" ficou órfão (Atrasado) após excluir o extrato");
        const ta = await titulo(antigo.id);
        assert.ok(ABERTOS.includes(ta.status), `título antigo ficou ${ta.status}`);
        assert.equal(num(ta.valor_quitado), 0);
    });

    caso("mesmo título em duas linhas do extrato: preview já recusa e o Salvar aponta a linha", async () => {
        const conta = await criarConta("Duas linhas");
        const t = await criarTitulo({valor: "400.00", vencimento: D.d3, descricao: "vinculado em duas linhas"});
        const imp = await importar(conta, [
            {fitid: "M1", data: D.d3, valor: -400, memo: "PAG 400 A"},
            {fitid: "M2", data: D.d4, valor: -400, memo: "PAG 400 B"},
        ]);
        // 2ª linha com a 1ª ainda em rascunho na tela: restante zero, não vira juros/multa.
        const preview = await api("POST", `/conciliacoes/linhas/${imp.linhas.M2}/vincular`, {
            token: ctx.token,
            body: {
                lancamentos: [{lancamento_id: t.id}],
                preview: true,
                contexto_rascunho: {quitado_local_por_lancamento: {[t.id]: 40000}},
            },
        });
        assert.equal(preview.status, 409, JSON.stringify(preview.json));
        assert.match(JSON.stringify(preview.json), /ainda não salvo/);

        const r = await salvar(imp.extratoId, [vincular(imp.linhas.M1, t.id), vincular(imp.linhas.M2, t.id)]);
        assert.equal(r.status, 409, JSON.stringify(r.json));
        assert.match(JSON.stringify(r.json), new RegExp(`Linha ${imp.linhas.M2}: `));
        const tt = await titulo(t.id);
        assert.equal(num(tt.valor_quitado), 0, "nada pode ficar gravado quando o Salvar é recusado");
    });

    caso("regra criada depois da importação se aplica às linhas pendentes do extrato", async () => {
        const conta = await criarConta("Aplicar regra");
        const gatilho = `QA APLICAR ${RUN}`;
        const imp = await importar(conta, [
            {fitid: "AR1", data: D.d3, valor: -19.9, memo: `${gatilho} TARIFA`},
            {fitid: "AR2", data: D.d3, valor: -50, memo: "OUTRA COISA"},
        ]);
        const regra = await api("POST", "/regras-conciliacao", {
            token: ctx.token,
            body: {conta_id: conta, texto_gatilho: gatilho, natureza: "saida", criar_lancamento_automatico: true},
        });
        assert.equal(regra.status, 201, JSON.stringify(regra.json));

        let r = await api("POST", `/conciliacoes/${imp.extratoId}/aplicar-regras`, {token: ctx.token, body: {preview: true}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.linhas_casadas, 1);
        assert.equal((await extrato(imp.extratoId)).linhas.find((l) => l.linha_id === imp.linhas.AR1).status, "pendente", "preview não grava");

        r = await api("POST", `/conciliacoes/${imp.extratoId}/aplicar-regras`, {token: ctx.token, body: {}});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.linhas_vinculadas, 1);
        const det = await extrato(imp.extratoId);
        const l1 = det.linhas.find((l) => l.linha_id === imp.linhas.AR1);
        assert.equal(l1.status, "vinculado");
        assert.equal(l1.classificacao_automatica, true);
        assert.equal(det.linhas.find((l) => l.linha_id === imp.linhas.AR2).status, "pendente");
        const t = await titulo(l1.vinculacoes[0].lancamento_id);
        assert.equal(t.status, "pago");
        assert.equal(num(t.valor_quitado), 19.9);

        // Finalizado não muda: reabrir antes.
        r = await salvar(imp.extratoId, [{tipo: "ignorar", linha_id: imp.linhas.AR2, motivo_codigo: "outro", motivo: "E2E"}], true);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        r = await api("POST", `/conciliacoes/${imp.extratoId}/aplicar-regras`, {token: ctx.token, body: {}});
        assert.equal(r.status, 409, JSON.stringify(r.json));
    });

    caso("título já pago por outro extrato não é vinculado de novo; o 409 diz onde está o vínculo", async () => {
        const t = await criarTitulo({valor: "70.00", vencimento: D.d2, descricao: "pago em dois extratos"});
        const conta = await criarConta("Duplo");
        const impA = await importar(conta, [{fitid: "DA1", data: D.d2, valor: -70, memo: "PAG DUPLO A"}]);
        let r = await salvar(impA.extratoId, [vincular(impA.linhas.DA1, t.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));

        const impB = await importar(conta, [{fitid: "DB1", data: D.d3, valor: -70, memo: "PAG DUPLO B"}]);
        r = await salvar(impB.extratoId, [vincular(impB.linhas.DB1, t.id)]);
        assert.equal(r.status, 409, JSON.stringify(r.json));
        assert.match(r.json?.error?.message ?? JSON.stringify(r.json), new RegExp(`extrato #${impA.extratoId}`));
        const tt = await titulo(t.id);
        assert.equal(num(tt.valor_quitado), 70, "título não pode ser quitado duas vezes");
    });

    caso("título pago numa conta não entra no saldo de outra", async () => {
        // Regressão: título com conta_id de um banco e vínculo em extrato de outro
        // entrava com o valor_quitado inteiro nas duas contas.
        const contaA = await criarConta("Saldo A");
        const contaB = await criarConta("Saldo B");
        const t = await criarTitulo({valor: "300.00", vencimento: D.d3, descricao: "pago em duas contas"});
        const impA = await importar(contaA, [{fitid: "SA1", data: D.d3, valor: -100, memo: "PAG PARTE A"}]);
        let r = await salvar(impA.extratoId, [vincular(impA.linhas.SA1, t.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        let tt = await titulo(t.id);
        assert.equal(tt.conta_id, contaA);
        assert.equal(num(tt.valor_quitado), 100);

        // Restante pelo extrato de outra conta: barrado (moveria os 100 de A para B).
        const impB = await importar(contaB, [{fitid: "SB1", data: D.d4, valor: -200, memo: "PAG PARTE B"}]);
        r = await salvar(impB.extratoId, [vincular(impB.linhas.SB1, t.id)]);
        assert.equal(r.status, 409, JSON.stringify(r.json));
        assert.match(r.json?.error?.message ?? JSON.stringify(r.json), /residual/, "409 deve orientar a vincular o residual");
        // O Vincular já sinaliza o título como pago em outra conta.
        const busca = await api("GET", `/conciliacoes/buscar-lancamentos?linha_id=${impB.linhas.SB1}&valor=300.00`, {token: ctx.token});
        assert.equal(busca.status, 200, JSON.stringify(busca.json));
        const cand = busca.data.find((l) => l.id === t.id);
        assert.ok(cand, "título pago parcial deve continuar na busca");
        assert.equal(cand.quitado_em_outra_conta, true);
        tt = await titulo(t.id);
        assert.equal(tt.conta_id, contaA, "conta do título não pode mudar");
        assert.equal(num(tt.valor_quitado), 100);

        // Trocar a conta de título com pagamento também é barrado; a mesma conta passa.
        r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body: {conta_id: contaB}});
        assert.equal(r.status, 409, JSON.stringify(r.json));
        r = await api("PUT", `/lancamentos/${t.id}`, {token: ctx.token, body: {conta_id: contaA}});
        assert.equal(r.status, 200, JSON.stringify(r.json));

        // Cada movimento conta numa conta só: A −100, B 0.
        const contas = await api("GET", "/contas-bancarias", {token: ctx.token});
        assert.equal(contas.status, 200);
        const saldo = (id) => num(contas.data.find((c) => c.id === id)?.saldo_atual);
        assert.equal(saldo(contaA), -100);
        assert.equal(saldo(contaB), 0);
        const mov = await api("GET", `/relatorios/contabil-fiscal/movimentacoes?conta_id=${contaB}&data_inicio=${D.d1}&data_fim=${D.d7}`, {
            token: ctx.token,
        });
        assert.equal(mov.status, 200, JSON.stringify(mov.json));
        assert.ok(!mov.data.linhas.some((l) => l.id === t.id), "título de A apareceu no extrato de B");
        assert.equal(num(mov.data.resumo.saidas), 0);
    });

    caso("antes da data de início o saldo da conta é zero e o inicial entra como abertura", async () => {
        const nova = await api("POST", "/contas-bancarias", {
            token: ctx.token,
            body: {tipo: "Conta Corrente", nome: `E2E-${RUN} Começa depois`, data_inicio: D.d4, saldo_inicial: 1000},
        });
        assert.equal(nova.status, 201, JSON.stringify(nova.json));
        const id = nova.data.id;
        const saldoEm = async (data) => {
            const r = await api("GET", `/contas-bancarias/${id}/saldo?data=${data}`, {token: ctx.token});
            assert.equal(r.status, 200, JSON.stringify(r.json));
            return r.data;
        };
        const antes = await saldoEm(diaIso(-30));
        assert.equal(num(antes.saldo), 0);
        assert.equal(antes.antes_do_inicio, true);
        // Véspera da data de início: o saldo inicial é a ABERTURA da data de início, o
        // fechamento da véspera ainda não o leva (senão a abertura cai no mês anterior).
        const vespera = await saldoEm(diaIso(-13));
        assert.equal(num(vespera.saldo), 0);
        assert.equal(vespera.antes_do_inicio, true);
        const noInicio = await saldoEm(D.d4);
        assert.equal(num(noInicio.saldo), 1000);
        assert.equal(noInicio.antes_do_inicio, false);

        const movimentacoes = async (ini, fim, conta = id) => {
            const q = conta ? `conta_id=${conta}&` : "";
            const resp = await api("GET", `/relatorios/contabil-fiscal/movimentacoes?${q}data_inicio=${ini}&data_fim=${fim}`, {
                token: ctx.token,
            });
            assert.equal(resp.status, 200, JSON.stringify(resp.json));
            return resp.data;
        };
        // Período que termina na véspera e o que começa na data de início (como o mês
        // anterior e o mês de uma conta que começa no dia 1º): abertura só no segundo,
        // e o saldo inicial dele é o saldo final do primeiro.
        const ateVespera = await movimentacoes(D.d1, diaIso(-13));
        assert.equal(num(ateVespera.resumo.saldo_final), 0);
        assert.equal(ateVespera.resumo.abertura_conta, null);
        const doInicio = await movimentacoes(D.d4, D.d7);
        assert.equal(num(doInicio.resumo.saldo_inicial), num(ateVespera.resumo.saldo_final));
        assert.deepEqual(doInicio.resumo.abertura_conta, {data: D.d4, valor: 1000, saldo_apos: 1000});
        assert.equal(num(doInicio.resumo.saldo_final), 1000);
        assert.equal(doInicio.resumo.confere, true);
        // Período que termina na data de início (último dia do mês): a abertura entra nele.
        const ateInicio = await movimentacoes(D.d1, D.d4);
        assert.deepEqual(ateInicio.resumo.abertura_conta, {data: D.d4, valor: 1000, saldo_apos: 1000});
        assert.equal(num(ateInicio.resumo.saldo_final), 1000);
        // Todas as contas: "+ abertura" da conta só no período que contém a data de início.
        const contaEm = (dados) => dados.contas.find((c) => c.conta_id === id);
        // Período que termina antes do início: a conta não entra no resumo por conta
        // (QA: outubro listava a conta que começa em 01/11, zerada, com "Começa em").
        assert.equal(contaEm(await movimentacoes(D.d1, diaIso(-13), null)), undefined);
        const todasDoInicio = contaEm(await movimentacoes(D.d4, D.d7, null));
        assert.equal(num(todasDoInicio.saldo_inicial), 0);
        assert.equal(num(todasDoInicio.saldo_abertura), 1000);
        assert.equal(num(todasDoInicio.saldo_final), 1000);

        // Período que começa antes: saldo inicial zero, abertura na data de início, final = inicial cadastrado.
        let r = await api("GET", `/relatorios/contabil-fiscal/movimentacoes?conta_id=${id}&data_inicio=${D.d1}&data_fim=${D.d7}`, {
            token: ctx.token,
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(num(r.data.resumo.saldo_inicial), 0);
        assert.equal(r.data.resumo.antes_do_inicio, true);
        assert.deepEqual(r.data.resumo.abertura_conta, {data: D.d4, valor: 1000, saldo_apos: 1000});
        assert.equal(num(r.data.resumo.saldo_final), 1000);
        assert.equal(r.data.resumo.confere, true);

        // Período inteiro antes do início: zero, sem abertura.
        r = await api("GET", `/relatorios/contabil-fiscal/movimentacoes?conta_id=${id}&data_inicio=${diaIso(-40)}&data_fim=${diaIso(-30)}`, {
            token: ctx.token,
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(num(r.data.resumo.saldo_inicial), 0);
        assert.equal(num(r.data.resumo.saldo_final), 0);
        assert.equal(r.data.resumo.abertura_conta, null);

        // Saldo atual (Painel / cadastro) continua com o saldo inicial.
        const contas = await api("GET", "/contas-bancarias", {token: ctx.token});
        assert.equal(num(contas.data.find((c) => c.id === id)?.saldo_atual), 1000);
    });

    caso("projeção de saldo do Painel parte do saldo geral e soma o que está em aberto", async () => {
        const vencimento = diaIso(3);
        await criarTitulo({valor: "123.45", vencimento, descricao: "projeção a pagar"});
        await criarTitulo({tipo: "CR", valor: "10.05", vencimento, descricao: "projeção a receber"});
        const centavos = (v) => Math.round(num(v) * 100);

        // Saldo geral = card do Painel: soma do saldo atual das contas ativas.
        const contas = await api("GET", "/contas-bancarias", {token: ctx.token});
        assert.equal(contas.status, 200, JSON.stringify(contas.json));
        const saldoGeral = contas.data.filter((c) => c.status === "ativo").reduce((soma, c) => soma + centavos(c.saldo_atual), 0);

        const r = await api("GET", "/dashboard/projecao-dias?dias=30", {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const pontos = r.data;
        assert.equal(pontos.length, 31);
        assert.equal(centavos(pontos[0].saldo), saldoGeral);
        assert.equal(centavos(r.json.meta.saldo_atual), saldoGeral);

        // Cada ponto = anterior + a receber − a pagar do dia anterior; o último fecha a janela.
        for (let i = 1; i < pontos.length; i++) {
            const p = pontos[i - 1];
            assert.equal(centavos(pontos[i].saldo), centavos(p.saldo) + centavos(p.receber) - centavos(p.pagar), `ponto ${pontos[i].data}`);
        }
        const dia = pontos.find((p) => p.data === vencimento);
        assert.ok(dia, `vencimento ${vencimento} fora da projeção`);
        assert.ok(centavos(dia.pagar) >= 12345 && centavos(dia.receber) >= 1005, JSON.stringify(dia));
    });

    caso("CP/CR Vencidos do Painel somam desconto e juros como o total de atrasados de Lançamentos", async () => {
        // QA: "CP Vencidos" ignorava desconto/juros e não batia com Lançamentos.
        const kpis = async () => {
            const r = await api("GET", "/dashboard/kpis", {token: ctx.token});
            assert.equal(r.status, 200, JSON.stringify(r.json));
            return r.data;
        };
        const centavos = (v) => Math.round(num(v) * 100);
        const antes = await kpis();
        const tag = `E2E-${RUN} vencido ajustado`;
        await criarTitulo({tipo: "CP", valor: "1000.00", vencimento: D.d1, descricao: "vencido ajustado CP", extra: {desconto: "100.00", juros: "30.00"}});
        await criarTitulo({tipo: "CR", valor: "500.00", vencimento: D.d1, descricao: "vencido ajustado CR", extra: {desconto: "50.00"}});

        const depois = await kpis();
        assert.equal(centavos(depois.contasPagarAtraso) - centavos(antes.contasPagarAtraso), 93000, "CP Vencidos sem desconto/juros");
        assert.equal(centavos(depois.contasReceberAtraso) - centavos(antes.contasReceberAtraso), 45000, "CR Vencidos sem desconto");

        const r = await api("GET", `/lancamentos/resumo?search=${encodeURIComponent(tag)}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.data.totais.pagar, 930);
        assert.equal(r.data.totais.receber, 450);
    });

    caso("excluir extrato e desfazer vínculo devolvem o título para a conta de antes", async () => {
        // QA: o título voltava para atrasado/pendente, mas na conta do extrato.
        const contaOriginal = await criarConta("Conta original");
        const contaExtrato = await criarConta("Conta do extrato");
        const comConta = await criarTitulo({valor: "61.10", vencimento: D.d5, descricao: "conta anterior", extra: {conta_id: contaOriginal}});
        const semConta = await criarTitulo({valor: "62.20", vencimento: D.d5, descricao: "sem conta anterior"});
        assert.equal(comConta.conta_id, contaOriginal);

        // Excluir o extrato (não finalizado).
        let imp = await importar(contaExtrato, [
            {fitid: "CA1", data: D.d5, valor: -61.1, memo: "PAG CONTA ANTERIOR"},
            {fitid: "CA2", data: D.d5, valor: -62.2, memo: "PAG SEM CONTA"},
        ]);
        let r = await salvar(imp.extratoId, [vincular(imp.linhas.CA1, comConta.id), vincular(imp.linhas.CA2, semConta.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(comConta.id)).conta_id, contaExtrato);
        assert.equal((await titulo(semConta.id)).conta_id, contaExtrato);
        r = await api("DELETE", `/conciliacoes/${imp.extratoId}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        let t = await titulo(comConta.id);
        assert.ok(ABERTOS.includes(t.status), `status ${t.status}`);
        assert.equal(t.conta_id, contaOriginal, "ficou na conta do extrato excluído");
        assert.equal((await titulo(semConta.id)).conta_id ?? null, null);

        // Desfazer pelo Salvar e excluir o vínculo: mesma coisa.
        imp = await importar(contaExtrato, [
            {fitid: "CB1", data: D.d6, valor: -61.1, memo: "PAG CONTA ANTERIOR 2"},
            {fitid: "CB2", data: D.d6, valor: -62.2, memo: "PAG SEM CONTA 2"},
        ]);
        r = await salvar(imp.extratoId, [vincular(imp.linhas.CB1, comConta.id), vincular(imp.linhas.CB2, semConta.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        r = await salvar(imp.extratoId, [{tipo: "desfazer", linha_id: imp.linhas.CB1}]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        t = await titulo(comConta.id);
        assert.equal(num(t.valor_quitado), 0);
        assert.equal(t.conta_id, contaOriginal, "desfazer deixou na conta do extrato");
        const det = await extrato(imp.extratoId);
        const vinculoId = det.linhas.find((x) => x.linha_id === imp.linhas.CB2).vinculacoes[0].vinculo_id;
        r = await api("DELETE", `/conciliacoes/vinculos/${vinculoId}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(semConta.id)).conta_id ?? null, null);

        // Vincular de novo depois de desfazer guarda a conta de novo.
        r = await salvar(imp.extratoId, [vincular(imp.linhas.CB1, comConta.id)]);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(comConta.id)).conta_id, contaExtrato);
        r = await api("DELETE", `/conciliacoes/${imp.extratoId}`, {token: ctx.token});
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal((await titulo(comConta.id)).conta_id, contaOriginal);
    });

    caso("kanban grava quem criou a tarefa e atualiza updated_at ao mover", async () => {
        // QA: created_by vazio e updated_at parado ao mover o card.
        const me = await api("GET", "/me", {token: ctx.token});
        assert.equal(me.status, 200, JSON.stringify(me.json));
        let r = await api("POST", "/kanban/cards", {token: ctx.token, body: {titulo: `E2E-${RUN} tarefa`}});
        assert.equal(r.status, 201, JSON.stringify(r.json));
        const card = r.data;
        try {
            assert.equal(card.created_by, me.data.id);
            await new Promise((ok) => setTimeout(ok, 50));
            r = await api("PATCH", `/kanban/cards/${card.id}`, {token: ctx.token, body: {coluna: "em_execucao"}});
            assert.equal(r.status, 200, JSON.stringify(r.json));
            assert.equal(r.data.coluna, "em_execucao");
            assert.ok(new Date(r.data.updated_at) > new Date(card.updated_at), `updated_at ${r.data.updated_at} <= ${card.updated_at}`);
            const lista = await api("GET", "/kanban/cards", {token: ctx.token});
            assert.equal(lista.data.find((c) => c.id === card.id)?.created_by, me.data.id);
        } finally {
            await api("DELETE", `/kanban/cards/${card.id}`, {token: ctx.token});
        }
    });

    caso("outra empresa não enxerga os títulos", {skip: !EMPRESA_B_ID}, async () => {
        const tokenB = await login(EMPRESA_B_ID);
        const r = await api("GET", `/lancamentos/${s.t1.id}`, {token: tokenB});
        assert.equal(r.status, 404);
        const lista = await api("GET", `/lancamentos?search=${encodeURIComponent(`E2E-${RUN}`)}`, {token: tokenB});
        assert.equal(lista.status, 200);
        assert.equal(lista.data.length, 0);
    });

    caso("carga curta com cancelamentos não deixa a API travada", async () => {
        const paths = ["/lancamentos?limit=25", "/dashboard/kpis", "/conciliacoes?limit=15", `/conciliacoes/${s.imp.extratoId}`];
        let i = 0;
        const status = {};
        async function worker() {
            while (i < 240) {
                const k = i++;
                const ac = new AbortController();
                if (k % 3 === 0) setTimeout(() => ac.abort(), Math.random() * 10);
                try {
                    const res = await fetch(BASE + paths[k % paths.length], {
                        headers: {Authorization: `Bearer ${ctx.token}`, "X-Forwarded-For": `10.200.${k % 250}.${k % 7}`},
                        signal: ac.signal,
                    });
                    await res.arrayBuffer();
                    status[res.status] = (status[res.status] ?? 0) + 1;
                } catch {
                    status.cancelada = (status.cancelada ?? 0) + 1;
                }
            }
        }
        await Promise.all(Array.from({length: 40}, worker));
        const erros = Object.entries(status).filter(([k]) => k.startsWith("5"));
        assert.deepEqual(erros, [], `respostas 5xx: ${JSON.stringify(status)}`);
        const depois = await api("GET", "/lancamentos?limit=1", {token: ctx.token});
        assert.equal(depois.status, 200);
    });

    after(() => {
        console.log(`# run ${RUN}: dados criados com prefixo E2E-${RUN}`);
    });
});
