/** Card "Saldo geral" do Painel: soma e ordenação das contas bancárias ativas. */

export type ContaComSaldo = {
    id: number;
    nome: string;
    banco: string | null;
    agencia: string | null;
    digito_agencia?: string | null;
    conta: string | null;
    digito_conta?: string | null;
    tipo: string;
    status: string;
    cor: string;
    saldo_atual: number | string;
};

export type ContaResumo<T extends ContaComSaldo = ContaComSaldo> = T & { saldoCentavos: number };

export type ResumoSaldoGeral<T extends ContaComSaldo = ContaComSaldo> = {
    totalCentavos: number;
    contas: ContaResumo<T>[];
};

export function saldoEmCentavos(valor: number | string | null | undefined): number {
    if (valor === null || valor === undefined || valor === "") return 0;
    const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Só contas ativas; soma em centavos; maior saldo primeiro (empate: nome). */
export function resumirSaldoGeral<T extends ContaComSaldo>(contas: readonly T[]): ResumoSaldoGeral<T> {
    const ativas = contas
        .filter((c) => c.status === "ativo")
        .map((c) => ({...c, saldoCentavos: saldoEmCentavos(c.saldo_atual)}))
        .sort((a, b) => b.saldoCentavos - a.saldoCentavos || a.nome.localeCompare(b.nome, "pt-BR"));
    const totalCentavos = ativas.reduce((soma, c) => soma + c.saldoCentavos, 0);
    return {totalCentavos, contas: ativas};
}

const BRL = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});

/** Moeda com o sinal "−" explícito nos negativos (não depende só da cor). */
export function formatarSaldo(centavos: number): string {
    const texto = BRL.format(Math.abs(centavos) / 100);
    return centavos < 0 ? `−${texto}` : texto;
}

function comDigito(numero: string | null | undefined, digito: string | null | undefined): string {
    const base = (numero ?? "").trim();
    const dv = (digito ?? "").trim();
    if (!base) return "";
    return dv && !base.includes("-") ? `${base}-${dv}` : base;
}

/** "Banco · Ag 1234 / CC 12345-6" — sem banco, mostra o tipo da conta. */
export function descricaoConta(conta: ContaComSaldo): string {
    const agencia = comDigito(conta.agencia, conta.digito_agencia);
    const numero = comDigito(conta.conta, conta.digito_conta);
    const partes = [conta.banco?.trim() || conta.tipo];
    const ids = [agencia && `Ag ${agencia}`, numero && `CC ${numero}`].filter(Boolean).join(" / ");
    if (ids) partes.push(ids);
    return partes.join(" · ");
}

export function rotuloQuantidadeContas(n: number): string {
    return n === 1 ? "1 conta ativa" : `${n} contas ativas`;
}
