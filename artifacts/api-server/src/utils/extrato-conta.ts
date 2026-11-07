/**
 * Extrato da conta (Relatório Contábil / Fiscal): parte pura, sem banco.
 *
 * O saldo segue a regra única do saldo da conta (utils/lancamentos-conta.ts e
 * contasBancariasService.saldoNaData): saldo_inicial + Σ CR − Σ CP pelo
 * `valor_quitado` dos movimentos quitados. Aqui só se ordena, acumula o saldo
 * linha a linha e resume o que ainda não foi conciliado.
 */
import {fromCents, toCents} from "./money";

export type FiltroTipoExtrato = "ambos" | "CR" | "CP";

export type ParamsExtratoConta = {
    /** null = todas as contas (resumo por conta, sem saldo corrido). */
    contaId: number | null;
    dataInicio: string;
    dataFim: string;
    tipo: FiltroTipoExtrato;
};

export type LeituraParams =
    | {ok: true; params: ParamsExtratoConta}
    | {ok: false; mensagem: string};

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data civil YYYY-MM-DD que existe no calendário. */
export function dataIsoValida(valor: string): boolean {
    const m = DATA_ISO.exec(valor);
    if (!m) return false;
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Dia anterior (YYYY-MM-DD): o saldo inicial do período é o do fim desse dia. */
export function diaAnterior(dataIso: string): string {
    const d = new Date(`${dataIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

function texto(valor: unknown): string {
    return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Lê `conta_id` (vazio ou "todas" = todas), `data_inicio`/`data_fim` ou `mes`/`ano`
 * e `tipo` (CR | CP | ambos).
 */
export function lerParamsExtratoConta(query: Record<string, unknown>): LeituraParams {
    const contaBruta = texto(query.conta_id);
    let contaId: number | null = null;
    if (contaBruta && contaBruta !== "todas") {
        if (!/^\d+$/.test(contaBruta) || Number(contaBruta) <= 0) {
            return {ok: false, mensagem: "conta_id inválido."};
        }
        contaId = Number(contaBruta);
    }

    let dataInicio = texto(query.data_inicio);
    let dataFim = texto(query.data_fim);
    if (!dataInicio && !dataFim) {
        const mes = Number.parseInt(texto(query.mes), 10);
        const ano = Number.parseInt(texto(query.ano), 10);
        if (mes >= 1 && mes <= 12 && ano >= 1900 && ano <= 9999) {
            const mm = String(mes).padStart(2, "0");
            const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
            dataInicio = `${ano}-${mm}-01`;
            dataFim = `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`;
        }
    }
    if (!dataInicio || !dataFim) {
        return {ok: false, mensagem: "Informe data_inicio e data_fim, ou mes e ano."};
    }
    if (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim)) {
        return {ok: false, mensagem: "Datas inválidas. Use YYYY-MM-DD."};
    }
    if (dataInicio > dataFim) {
        return {ok: false, mensagem: "data_inicio deve ser anterior ou igual a data_fim."};
    }

    const tipoBruto = texto(query.tipo);
    const tipo: FiltroTipoExtrato = tipoBruto === "CR" || tipoBruto === "CP" ? tipoBruto : "ambos";
    return {ok: true, params: {contaId, dataInicio, dataFim, tipo}};
}

// ─── Vínculo com o extrato importado ──────────────────────────────────────────

export type VinculoExtrato = {
    lancamento_id: number;
    /** Status da conciliação (o extrato inteiro): "conciliado" = finalizada. */
    conciliacao_status: string;
    extrato_id: number;
    extrato_linha_id: number;
    data: string | null;
    valor: unknown;
    descricao: string | null;
    documento: string | null;
};

export type ResumoVinculo = {
    extrato_id: number;
    linha_id: number;
    data: string | null;
    valor: number;
    descricao: string | null;
    documento: string | null;
    /** false = extrato com linhas ainda pendentes (conciliação não finalizada). */
    conciliacao_finalizada: boolean;
    /** Quantas linhas do extrato estão vinculadas a este lançamento. */
    linhas_vinculadas: number;
};

/**
 * Conciliado = o lançamento está vinculado a pelo menos uma linha de extrato
 * importado (item da conciliação com status "vinculado"). Mostra a linha principal:
 * a de conciliação finalizada e, entre iguais, a primeira importada.
 */
export function agruparVinculos(vinculos: readonly VinculoExtrato[]): Map<number, ResumoVinculo> {
    const porLancamento = new Map<number, VinculoExtrato[]>();
    for (const v of vinculos) {
        const lista = porLancamento.get(v.lancamento_id) ?? [];
        lista.push(v);
        porLancamento.set(v.lancamento_id, lista);
    }
    const saida = new Map<number, ResumoVinculo>();
    for (const [lancamentoId, lista] of porLancamento) {
        const linhas = new Set(lista.map((v) => v.extrato_linha_id));
        const principal = [...lista].sort((a, b) => {
            const fa = a.conciliacao_status === "conciliado" ? 0 : 1;
            const fb = b.conciliacao_status === "conciliado" ? 0 : 1;
            return fa - fb || a.extrato_linha_id - b.extrato_linha_id;
        })[0]!;
        saida.set(lancamentoId, {
            extrato_id: principal.extrato_id,
            linha_id: principal.extrato_linha_id,
            data: principal.data,
            valor: fromCents(toCents(principal.valor)),
            descricao: principal.descricao,
            documento: principal.documento,
            conciliacao_finalizada: principal.conciliacao_status === "conciliado",
            linhas_vinculadas: linhas.size,
        });
    }
    return saida;
}

// ─── Ordem e saldo corrido ────────────────────────────────────────────────────

export type MovimentoBase = {
    id: number;
    tipo: string;
    data_pgto: string | null;
    valor_quitado: unknown;
    /** Linha do extrato vinculada (ordem de importação = ordem do banco no dia). */
    ordem_extrato: number | null;
};

/**
 * Ordem cronológica de pagamento. No mesmo dia, segue a ordem das linhas do extrato
 * importado (mesma do PDF do banco); sem vínculo, vem depois, pela ordem de cadastro.
 */
export function ordenarMovimentos<T extends MovimentoBase>(movimentos: readonly T[]): T[] {
    const fim = Number.MAX_SAFE_INTEGER;
    return [...movimentos].sort((a, b) => {
        const da = a.data_pgto ?? "9999-12-31";
        const dbb = b.data_pgto ?? "9999-12-31";
        if (da !== dbb) return da < dbb ? -1 : 1;
        return (a.ordem_extrato ?? fim) - (b.ordem_extrato ?? fim) || a.id - b.id;
    });
}

export type LinhaComSaldo<T> = T & {
    entradaCents: number;
    saidaCents: number;
    /** Saldo da conta logo após esta linha. */
    saldoAposCents: number;
};

/**
 * Saldo inicial cadastrado da conta quando ela começa dentro do período: antes da
 * data de início o sistema não conhece o saldo (zero), e o `saldo_inicial` entra
 * como "saldo de abertura" na data de início, antes dos movimentos desse dia.
 */
export type AberturaConta = {data: string; valorCents: number};

export type AberturaAplicada = AberturaConta & {
    /** Saldo da conta logo após a abertura. */
    saldoAposCents: number;
};

/**
 * Acumula o saldo linha a linha a partir do saldo inicial (fim do dia anterior ao período).
 * Valor da linha = `valor_quitado` (o que saiu/entrou no banco), como no saldo da conta.
 * Com `abertura`, o saldo de abertura da conta soma no saldo antes do primeiro movimento
 * da data de início em diante (não entra em entradas/saídas).
 */
export function comSaldoCorrido<T extends MovimentoBase>(
    saldoInicialCents: number,
    movimentos: readonly T[],
    abertura: AberturaConta | null = null,
): {
    linhas: LinhaComSaldo<T>[];
    entradasCents: number;
    saidasCents: number;
    saldoFinalCents: number;
    abertura: AberturaAplicada | null;
} {
    let saldo = saldoInicialCents;
    let entradasCents = 0;
    let saidasCents = 0;
    let aplicada: AberturaAplicada | null = null;
    const aplicarAbertura = () => {
        if (!abertura || aplicada) return;
        saldo += abertura.valorCents;
        aplicada = {...abertura, saldoAposCents: saldo};
    };
    const linhas = movimentos.map((m) => {
        if (abertura && (m.data_pgto ?? "9999-12-31") >= abertura.data) aplicarAbertura();
        const valor = toCents(m.valor_quitado);
        const entradaCents = m.tipo === "CR" ? valor : 0;
        const saidaCents = m.tipo === "CR" ? 0 : valor;
        entradasCents += entradaCents;
        saidasCents += saidaCents;
        saldo += entradaCents - saidaCents;
        return {...m, entradaCents, saidaCents, saldoAposCents: saldo};
    });
    aplicarAbertura();
    return {linhas, entradasCents, saidasCents, saldoFinalCents: saldo, abertura: aplicada};
}

/** Entradas e saídas sem saldo corrido (visão "todas as contas"). */
export function semSaldoCorrido<T extends MovimentoBase>(movimentos: readonly T[]): Array<T & {entradaCents: number; saidaCents: number}> {
    return movimentos.map((m) => {
        const valor = toCents(m.valor_quitado);
        return {...m, entradaCents: m.tipo === "CR" ? valor : 0, saidaCents: m.tipo === "CR" ? 0 : valor};
    });
}

export function filtrarPorTipo<T extends {tipo: string}>(linhas: readonly T[], tipo: FiltroTipoExtrato): T[] {
    return tipo === "ambos" ? [...linhas] : linhas.filter((l) => l.tipo === tipo);
}

export type ResumoNaoConciliados = {
    quantidade: number;
    entradasCents: number;
    saidasCents: number;
    /** Soma em módulo (entradas + saídas) do que não tem vínculo com o extrato. */
    totalCents: number;
};

/** Indicador de divergência: lançamentos sem vínculo com linha de extrato importado. */
export function resumirNaoConciliados(
    linhas: ReadonlyArray<{conciliado: boolean; entradaCents: number; saidaCents: number}>,
): ResumoNaoConciliados {
    let quantidade = 0;
    let entradasCents = 0;
    let saidasCents = 0;
    for (const l of linhas) {
        if (l.conciliado) continue;
        quantidade += 1;
        entradasCents += l.entradaCents;
        saidasCents += l.saidaCents;
    }
    return {quantidade, entradasCents, saidasCents, totalCents: entradasCents + saidasCents};
}

// ─── Data de início da conta ─────────────────────────────────────────────────

/**
 * Saldo de abertura que acontece dentro do período: o saldo no início do período
 * ainda não leva o `saldo_inicial` (antes da data de início) e o do fim já leva.
 * Entradas são os `saldoNaData` da véspera do período e do fim. Como o saldo_inicial
 * entra no fechamento da própria data de início (`saldoInicialValeNaData`), a abertura
 * cai no período que contém essa data, inclusive quando ela é o 1º dia do período.
 */
export function aberturaNoPeriodo(
    inicio: {antes_do_inicio: boolean; saldo_inicial: number},
    fim: {antes_do_inicio: boolean},
    dataInicioConta: string,
): AberturaConta | null {
    if (!inicio.antes_do_inicio || fim.antes_do_inicio) return null;
    return {data: String(dataInicioConta).slice(0, 10), valorCents: toCents(inicio.saldo_inicial)};
}

/**
 * Conta entra no resumo por conta (visão "todas as contas") do período:
 * ativa ou com movimento no período, e já começada até o fim do período. Conta
 * que só começa depois (ex.: início 01/11 no relatório de outubro) aparecia
 * zerada com a nota "Começa em 01/11".
 */
export function contaNoResumoDoPeriodo(
    conta: {status: string | null; data_inicio: string | null},
    temMovimentoNoPeriodo: boolean,
    dataFimPeriodo: string,
): boolean {
    const inicio = conta.data_inicio ? String(conta.data_inicio).slice(0, 10) : null;
    if (inicio && inicio > dataFimPeriodo) return false;
    return conta.status === "ativo" || temMovimentoNoPeriodo;
}
