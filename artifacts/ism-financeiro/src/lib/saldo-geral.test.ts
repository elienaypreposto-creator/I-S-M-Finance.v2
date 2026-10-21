import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    chaveContasOcultas,
    descricaoConta,
    formatarSaldo,
    gravarContasOcultas,
    lerContasOcultas,
    resumirSaldoGeral,
    rotuloContasNoTotal,
    rotuloQuantidadeContas,
    rotuloTipoConta,
    saldoEmCentavos,
    type ArmazenamentoLocal,
    type ContaComSaldo,
} from "./saldo-geral.ts";

function conta(id: number, nome: string, saldo: string | number, status = "ativo"): ContaComSaldo {
    return {
        id, nome, saldo_atual: saldo, status,
        banco: "Banco do Brasil", agencia: "1234", conta: "5445456-6",
        tipo: "Conta Corrente", cor: "#3BA8DC",
    };
}

describe("resumirSaldoGeral", () => {
    it("soma só as contas ativas, em centavos", () => {
        const r = resumirSaldoGeral([
            conta(1, "A", "53464.53"),
            conta(2, "B", "6416.44"),
            conta(3, "C", "2446.40"),
            conta(4, "D", "0"),
            conta(5, "E", "-22000.00"),
            conta(6, "Bloqueada", "999999.99", "bloqueado"),
        ]);
        assert.equal(r.totalCentavos, 4032737);
        assert.equal(r.contas.length, 5);
        assert.ok(!r.contas.some((c) => c.nome === "Bloqueada"));
    });

    it("não acumula erro de ponto flutuante", () => {
        const r = resumirSaldoGeral([conta(1, "A", "0.10"), conta(2, "B", "0.20")]);
        assert.equal(r.totalCentavos, 30);
    });

    it("ordena do maior saldo para o menor (empate por nome)", () => {
        const r = resumirSaldoGeral([
            conta(1, "Zeta", "10"),
            conta(2, "Negativa", "-5"),
            conta(3, "Alfa", "10"),
            conta(4, "Grande", 1000),
        ]);
        assert.deepEqual(r.contas.map((c) => c.nome), ["Grande", "Alfa", "Zeta", "Negativa"]);
    });

    it("lista vazia dá total zero", () => {
        assert.deepEqual(resumirSaldoGeral([]), {totalCentavos: 0, contas: [], ocultas: 0});
    });
});

describe("saldoEmCentavos", () => {
    it("aceita string, número, vírgula e vazio", () => {
        assert.equal(saldoEmCentavos("1234.56"), 123456);
        assert.equal(saldoEmCentavos("12,5"), 1250);
        assert.equal(saldoEmCentavos(-0.015), -1);
        assert.equal(saldoEmCentavos(null), 0);
        assert.equal(saldoEmCentavos("abc"), 0);
    });
});

describe("formatarSaldo", () => {
    it("negativo leva o sinal − (U+2212)", () => {
        assert.match(formatarSaldo(-2200000), /^−R\$\s22\.000,00$/);
    });
    it("positivo e zero sem sinal", () => {
        assert.match(formatarSaldo(4032737), /^R\$\s40\.327,37$/);
        assert.match(formatarSaldo(0), /^R\$\s0,00$/);
    });
});

describe("descricaoConta", () => {
    it("banco, agência e conta", () => {
        assert.equal(descricaoConta(conta(1, "A", 0)), "Banco do Brasil · Ag 1234 / CC 5445456-6");
    });
    it("junta dígito separado e cai no tipo sem banco", () => {
        assert.equal(
            descricaoConta({...conta(1, "A", 0), banco: null, agencia: null, conta: "123", digito_conta: "4"}),
            "Conta Corrente · CC 123-4",
        );
        assert.equal(
            descricaoConta({...conta(1, "A", 0), banco: null, agencia: null, conta: null, tipo: "Conta Movimento"}),
            "Conta Movimento",
        );
    });
});

describe("rotuloQuantidadeContas", () => {
    it("singular e plural", () => {
        assert.equal(rotuloQuantidadeContas(1), "1 conta ativa");
        assert.equal(rotuloQuantidadeContas(5), "5 contas ativas");
    });
});

describe("resumirSaldoGeral com contas ocultas", () => {
    const contas = [conta(1, "Nubank", "1000.00"), conta(2, "Itaú", "250.50"), conta(3, "Caixa", "-100.00")];

    it("todas visíveis: soma tudo", () => {
        const r = resumirSaldoGeral(contas, []);
        assert.equal(r.totalCentavos, 115050);
        assert.equal(r.ocultas, 0);
        assert.ok(r.contas.every((c) => !c.oculta));
    });

    it("algumas ocultas: soma só as visíveis e mantém todas na lista", () => {
        const r = resumirSaldoGeral(contas, [1]);
        assert.equal(r.totalCentavos, 15050);
        assert.equal(r.ocultas, 1);
        assert.equal(r.contas.length, 3);
        assert.deepEqual(r.contas.filter((c) => c.oculta).map((c) => c.nome), ["Nubank"]);
    });

    it("todas ocultas: total R$ 0,00 e contagem de ocultas = total", () => {
        const r = resumirSaldoGeral(contas, [1, 2, 3]);
        assert.equal(r.totalCentavos, 0);
        assert.equal(r.ocultas, r.contas.length);
        assert.match(formatarSaldo(r.totalCentavos), /^R\$\s0,00$/);
    });

    it("id inexistente (ou de conta inativa) é ignorado", () => {
        const r = resumirSaldoGeral([...contas, conta(9, "Velha", "50", "bloqueado")], [999, 9]);
        assert.equal(r.totalCentavos, 115050);
        assert.equal(r.ocultas, 0);
    });

    it("conta nova entra visível", () => {
        const r = resumirSaldoGeral([...contas, conta(4, "Nova", "10.00")], [1]);
        assert.equal(r.totalCentavos, 15050 + 1000);
    });

    it("aceita Set", () => {
        assert.equal(resumirSaldoGeral(contas, new Set([2])).totalCentavos, 90000);
    });
});

describe("rotuloTipoConta", () => {
    it("Corrente, Poupança, Movimento e Aplicação", () => {
        assert.equal(rotuloTipoConta("Conta Corrente"), "Corrente");
        assert.equal(rotuloTipoConta("Conta Poupança"), "Poupança");
        assert.equal(rotuloTipoConta("Conta Movimento"), "Movimento");
        assert.equal(rotuloTipoConta("Conta Aplicação"), "Aplicação");
        assert.equal(rotuloTipoConta("Conta Aplicação / Investimento"), "Aplicação");
        assert.equal(rotuloTipoConta("aplicacao"), "Aplicação");
    });
    it("tipo desconhecido perde o prefixo; vazio vira Conta", () => {
        assert.equal(rotuloTipoConta("Conta Salário"), "Salário");
        assert.equal(rotuloTipoConta(""), "Conta");
    });
});

describe("descricaoConta sem repetir o tipo", () => {
    it("sem banco e sem tipo na descrição", () => {
        const c = {...conta(1, "A", 0), banco: null, agencia: null, conta: null};
        assert.equal(descricaoConta(c, {incluirTipoSemBanco: false}), "");
        assert.equal(descricaoConta({...c, conta: "12"}, {incluirTipoSemBanco: false}), "CC 12");
    });
});

describe("rotuloContasNoTotal", () => {
    it("N de M contas no total", () => {
        assert.equal(rotuloContasNoTotal(2, 3), "2 de 3 contas no total");
        assert.equal(rotuloContasNoTotal(0, 1), "0 de 1 conta no total");
    });
});

describe("contas ocultas no localStorage", () => {
    function fake(inicial: Record<string, string> = {}): ArmazenamentoLocal & { dados: Record<string, string> } {
        const dados = {...inicial};
        return {dados, getItem: (k) => dados[k] ?? null, setItem: (k, v) => void (dados[k] = v)};
    }
    const quebrado: ArmazenamentoLocal = {
        getItem: () => { throw new Error("bloqueado"); },
        setItem: () => { throw new Error("cheio"); },
    };

    it("chave por usuário e empresa", () => {
        assert.equal(chaveContasOcultas(7, 3), "ism:saldo-geral:ocultas:7:3");
    });

    it("grava e lê só os ids; outro usuário/empresa não enxerga", () => {
        const st = fake();
        assert.equal(gravarContasOcultas(st, chaveContasOcultas(7, 3), [1, 2, 2]), true);
        assert.equal(st.dados["ism:saldo-geral:ocultas:7:3"], "[1,2]");
        assert.deepEqual(lerContasOcultas(st, chaveContasOcultas(7, 3)), [1, 2]);
        assert.deepEqual(lerContasOcultas(st, chaveContasOcultas(8, 3)), []);
        assert.deepEqual(lerContasOcultas(st, chaveContasOcultas(7, 4)), []);
    });

    it("storage com erro, JSON inválido ou formato errado = todas visíveis", () => {
        const k = chaveContasOcultas(1, 1);
        assert.deepEqual(lerContasOcultas(quebrado, k), []);
        assert.deepEqual(lerContasOcultas(null, k), []);
        assert.deepEqual(lerContasOcultas(fake({[k]: "{nao e json"}), k), []);
        assert.deepEqual(lerContasOcultas(fake({[k]: '{"a":1}'}), k), []);
        assert.deepEqual(lerContasOcultas(fake({[k]: '[1,"x",null,2.5,3]'}), k), [1, 3]);
    });

    it("falha ao gravar não lança", () => {
        assert.equal(gravarContasOcultas(quebrado, "k", [1]), false);
        assert.equal(gravarContasOcultas(null, "k", [1]), false);
    });
});