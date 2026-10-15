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
        body: {tipo: "corrente", nome: `E2E-${RUN} ${sufixo}`, data_inicio: diaIso(-90), saldo_inicial: 0},
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
    "título criado pela linha do extrato já nasce recebido e aparece em Lançamentos": "razão de quitação (PR2)",
    "pagamento parcial: origem quitada pelo resíduo e resíduo seguinte com o saldo certo": "razão de quitação (PR2)",
    "excluir um vínculo com a conciliação aberta reverte o título": "razão de quitação (PR2)",
    "desconto editado no vínculo recalcula o título": "razão de quitação (PR2)",
    "status manual é ignorado": "razão de quitação (PR2)",
    "finalizar trava o extrato e reabrir libera": "finalização explícita (PR2)",
    "excluir extrato não finalizado reabre títulos e remove os criados por ele": "razão de quitação (PR2)",
    "excluir título com vínculo responde 409, não 500": "tela de Lançamentos (PR1)",
    "valor inválido é rejeitado": "tela de Lançamentos (PR1)",
    "resumo e exportação respondem com os filtros da lista": "tela de Lançamentos (PR1)",
};

function caso(nome, opcoes, fn) {
    if (typeof opcoes === "function") {
        fn = opcoes;
        opcoes = {};
    }
    it(nome, {...opcoes, todo: PENDENTES[nome]}, fn);
}

describe(`Fluxo conciliação → lançamentos (run ${RUN})`, {concurrency: false}, () => {
    const D = {d1: diaIso(-20), d2: diaIso(-18), d3: diaIso(-15), d4: diaIso(-12), d5: diaIso(-10), d6: diaIso(-8)};
    const s = {};

    before(async () => {
        ctx.token = await login(EMPRESA_ID);
        s.conta = await criarConta("Principal");
        s.t1 = await criarTitulo({valor: "150.00", vencimento: D.d1, descricao: "fornecedor 150"});
        s.t3 = await criarTitulo({valor: "1000.00", vencimento: D.d3, descricao: "fornecedor 1000"});
        s.t6 = await criarTitulo({valor: "100.00", vencimento: D.d6, descricao: "fornecedor 100 com desconto"});
        s.imp = await importar(s.conta, [
            {fitid: "L1", data: D.d1, valor: -150, memo: "PAG FORNECEDOR 150"},
            {fitid: "L2", data: D.d2, valor: 980, memo: "RECEB CLIENTE 980"},
            {fitid: "L3", data: D.d3, valor: -300, memo: "PAG PARCIAL 300"},
            {fitid: "L4", data: D.d4, valor: -200, memo: "PAG PARCIAL 200"},
            {fitid: "L5", data: D.d5, valor: -45.9, memo: "TARIFA"},
            {fitid: "L6", data: D.d6, valor: -90, memo: "PAG FORNECEDOR 100 COM DESCONTO"},
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
    });

    caso("resumo e exportação respondem com os filtros da lista", async () => {
        const q = `search=${encodeURIComponent(`E2E-${RUN}`)}`;
        const resumo = await api("GET", `/lancamentos/resumo?${q}`, {token: ctx.token});
        assert.equal(resumo.status, 200, JSON.stringify(resumo.json));
        const exp = await api("GET", `/lancamentos/export?${q}`, {token: ctx.token});
        assert.equal(exp.status, 200, JSON.stringify(exp.json));
        assert.ok(Array.isArray(exp.data) && exp.data.length >= 4);
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
