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

export type ContaResumo<T extends ContaComSaldo = ContaComSaldo> = T & {
    saldoCentavos: number;
    /** Fora da soma só na visualização local (ver `useContasOcultas`). */
    oculta: boolean;
};

export type ResumoSaldoGeral<T extends ContaComSaldo = ContaComSaldo> = {
    /** Soma só das contas visíveis. */
    totalCentavos: number;
    /** Todas as contas ativas (visíveis e ocultas), maior saldo primeiro. */
    contas: ContaResumo<T>[];
    /** Quantas contas ativas estão fora da soma (ids inexistentes não contam). */
    ocultas: number;
};

export function saldoEmCentavos(valor: number | string | null | undefined): number {
    if (valor === null || valor === undefined || valor === "") return 0;
    const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Só contas ativas; soma em centavos; maior saldo primeiro (empate: nome).
 * `idsOcultos` tira contas da soma (só visualização): ids que não são de uma
 * conta ativa são ignorados e contas novas entram visíveis.
 */
export function resumirSaldoGeral<T extends ContaComSaldo>(
    contas: readonly T[],
    idsOcultos: Iterable<number> = [],
): ResumoSaldoGeral<T> {
    const fora = new Set(idsOcultos);
    const ativas = contas
        .filter((c) => c.status === "ativo")
        .map((c) => ({...c, saldoCentavos: saldoEmCentavos(c.saldo_atual), oculta: fora.has(c.id)}))
        .sort((a, b) => b.saldoCentavos - a.saldoCentavos || a.nome.localeCompare(b.nome, "pt-BR"));
    const totalCentavos = ativas.reduce((soma, c) => (c.oculta ? soma : soma + c.saldoCentavos), 0);
    const ocultas = ativas.filter((c) => c.oculta).length;
    return {totalCentavos, contas: ativas, ocultas};
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

/**
 * "Banco · Ag 1234 / CC 12345-6" — sem banco, mostra o tipo da conta
 * (use `incluirTipoSemBanco: false` quando o tipo já aparece em etiqueta própria).
 */
export function descricaoConta(conta: ContaComSaldo, {incluirTipoSemBanco = true} = {}): string {
    const agencia = comDigito(conta.agencia, conta.digito_agencia);
    const numero = comDigito(conta.conta, conta.digito_conta);
    const banco = conta.banco?.trim() || (incluirTipoSemBanco ? conta.tipo : "");
    const ids = [agencia && `Ag ${agencia}`, numero && `CC ${numero}`].filter(Boolean).join(" / ");
    return [banco, ids].filter(Boolean).join(" · ");
}

/** Etiqueta curta do tipo: Corrente, Poupança, Movimento ou Aplicação. */
export function rotuloTipoConta(tipo: string | null | undefined): string {
    const t = (tipo ?? "").trim();
    if (/aplica/i.test(t)) return "Aplicação";
    if (/poupan/i.test(t)) return "Poupança";
    if (/movimento/i.test(t)) return "Movimento";
    if (/corrente/i.test(t)) return "Corrente";
    return t.replace(/^conta\s+/i, "") || "Conta";
}

export function rotuloQuantidadeContas(n: number): string {
    return n === 1 ? "1 conta ativa" : `${n} contas ativas`;
}

/** "2 de 3 contas no total" (quando há conta fora da soma). */
export function rotuloContasNoTotal(naSoma: number, total: number): string {
    return `${naSoma} de ${total} ${total === 1 ? "conta" : "contas"} no total`;
}

/* ---------- Contas fora da soma (preferência local, só neste navegador) ---------- */

/** Subconjunto de `Storage` que usamos (facilita testar sem navegador). */
export type ArmazenamentoLocal = Pick<Storage, "getItem" | "setItem">;

export function chaveContasOcultas(usuarioId: number, empresaId: number): string {
    return `ism:saldo-geral:ocultas:${usuarioId}:${empresaId}`;
}

/** Lê os ids ocultos. Qualquer falha (storage bloqueado, JSON inválido) = todas visíveis. */
export function lerContasOcultas(armazenamento: ArmazenamentoLocal | null, chave: string): number[] {
    try {
        const bruto = armazenamento?.getItem(chave);
        if (!bruto) return [];
        const lista: unknown = JSON.parse(bruto);
        if (!Array.isArray(lista)) return [];
        return [...new Set(lista.filter((id): id is number => Number.isInteger(id)))];
    } catch {
        return [];
    }
}

/** Grava só os ids. Devolve false se o navegador não deixou (a tela segue funcionando). */
export function gravarContasOcultas(armazenamento: ArmazenamentoLocal | null, chave: string, ids: readonly number[]): boolean {
    try {
        if (!armazenamento) return false;
        armazenamento.setItem(chave, JSON.stringify([...new Set(ids)]));
        return true;
    } catch {
        return false;
    }
}