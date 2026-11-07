/**
 * Extrato da conta (Relatório Contábil / Fiscal): tipos da resposta da API,
 * período e montagem das linhas exportadas. Sem React e sem libs de arquivo.
 *
 * Os números vêm prontos do servidor (GET /relatorios/contabil-fiscal/movimentacoes),
 * calculados com a mesma regra do saldo da conta usada no Painel e na conciliação.
 */
import {formatarData} from "./datas";
import {FORMATO_DATA_XLSX, FORMATO_MOEDA_XLSX, serialExcel} from "./export-celulas";
import {TIPOS_DOCUMENTO_LANCAMENTO} from "./lancamento-documento";

export type TipoFiltroExtrato = "ambos" | "CR" | "CP";

export type VinculoExtratoLinha = {
    extrato_id: number;
    linha_id: number;
    data: string | null;
    valor: number;
    descricao: string | null;
    documento: string | null;
    conciliacao_finalizada: boolean;
    linhas_vinculadas: number;
};

export type LinhaExtrato = {
    id: number;
    conta_id: number | null;
    conta_bancaria: string | null;
    data_pgto: string | null;
    descricao: string | null;
    nome_parceiro: string | null;
    categoria: string;
    tipo_documento: string | null;
    numero_documento: string | null;
    tipo: "CR" | "CP";
    transferencia: boolean;
    entrada: number;
    saida: number;
    /** Saldo da conta após a linha; null na visão de todas as contas. */
    saldo_apos: number | null;
    conciliado: boolean;
    extrato: VinculoExtratoLinha | null;
};

export type ResumoSaldos = {
    /**
     * Dia cujo fechamento é o saldo inicial (véspera do início do período). Não leva o
     * saldo inicial cadastrado de conta que começa no 1º dia do período: ele vem em
     * `abertura_conta`/`saldo_abertura` (a API soma o cadastrado a partir da data de início).
     */
    data_saldo_inicial: string;
    saldo_inicial: number;
    /** saldo_inicial cadastrado de conta que começa dentro do período (0 se nenhuma). */
    saldo_abertura?: number;
    entradas: number;
    saidas: number;
    saldo_final: number;
    saldo_final_sistema?: number;
    confere?: boolean;
    /** Só com uma conta: data de início da conta no sistema. */
    inicio_conta?: string;
    /** Só com uma conta: o período começa antes da conta (saldo inicial desconhecido = zero). */
    antes_do_inicio?: boolean;
    /** Só com uma conta: linha "Saldo de abertura" do saldo corrido. */
    abertura_conta?: AberturaContaExtrato | null;
};

/** Saldo inicial cadastrado entrando no saldo corrido na data de início da conta. */
export type AberturaContaExtrato = {
    data: string;
    valor: number;
    /** Saldo da conta logo após a abertura. */
    saldo_apos: number;
};

export type NaoConciliados = {
    quantidade: number;
    entradas: number;
    saidas: number;
    total: number;
};

export type ResumoContaExtrato = {
    conta_id: number;
    nome: string;
    banco: string | null;
    inicio_conta?: string;
    antes_do_inicio?: boolean;
    saldo_inicial: number;
    /** saldo_inicial cadastrado, se a conta começa dentro do período. */
    saldo_abertura?: number;
    entradas: number;
    saidas: number;
    saldo_final: number;
    nao_conciliados: NaoConciliados;
};

export type ExtratoContaResposta = {
    modo: "conta" | "todas";
    conta: {id: number; nome: string; banco: string | null; agencia: string | null; conta: string | null} | null;
    periodo: {inicio: string; fim: string};
    tipo: TipoFiltroExtrato;
    resumo: ResumoSaldos;
    nao_conciliados: NaoConciliados;
    contas?: ResumoContaExtrato[];
    linhas: LinhaExtrato[];
};

export const MESES_LONGOS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const BRL = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});

/** Primeiro e último dia do mês, sem passar por UTC. */
export function periodoDoMes(ano: number, mes: number): {inicio: string; fim: string} {
    const mm = String(mes).padStart(2, "0");
    const ultimo = new Date(ano, mes, 0).getDate();
    return {inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`};
}

/** "Outubro 2026" quando o período é um mês inteiro; senão "05/10/2026 a 20/10/2026". */
export function rotuloPeriodo(inicio: string, fim: string): string {
    const mi = DATA_ISO.exec(inicio);
    if (mi) {
        const ano = Number(mi[1]);
        const mes = Number(mi[2]);
        const doMes = periodoDoMes(ano, mes);
        if (doMes.inicio === inicio && doMes.fim === fim) return `${MESES_LONGOS[mes - 1]} ${ano}`;
    }
    return `${formatarData(inicio)} a ${formatarData(fim)}`;
}

/** "NF 123", "BOL" ou "" (sem documento). */
export function documentoDaLinha(tipo: string | null | undefined, numero: string | null | undefined): string {
    const abrev = TIPOS_DOCUMENTO_LANCAMENTO.find((t) => t.value === tipo)?.abrev ?? "";
    return [abrev, numero?.trim() ?? ""].filter(Boolean).join(" ");
}

/**
 * Texto curto do vínculo com o extrato importado (para tela e exportação).
 * `dinheiro` formata o valor da linha; na tela, passe o de `useDinheiro` para
 * respeitar o "ocultar saldos".
 */
export function textoVinculo(
    v: VinculoExtratoLinha | null,
    dinheiro: (valor: number) => string = (valor) => BRL.format(valor),
): string {
    if (!v) return "";
    const partes = [
        `Extrato #${v.extrato_id}`,
        formatarData(v.data, ""),
        dinheiro(v.valor),
        v.descricao?.trim() ?? "",
    ].filter(Boolean);
    if (v.linhas_vinculadas > 1) partes.push(`${v.linhas_vinculadas} linhas`);
    if (!v.conciliacao_finalizada) partes.push("conciliação em aberto");
    return partes.join(" · ");
}

export function rotuloTipoFiltro(tipo: TipoFiltroExtrato): string {
    return tipo === "CR" ? "Só entradas" : tipo === "CP" ? "Só saídas" : "Entradas e saídas";
}

// ─── Data de início da conta ─────────────────────────────────────────────────

export const DESCRICAO_ABERTURA = "Saldo de abertura da conta (saldo inicial cadastrado)";

export type ItemExtrato =
    | {tipo: "linha"; linha: LinhaExtrato}
    | {tipo: "abertura"; abertura: AberturaContaExtrato};

/**
 * Linhas na ordem da tela/exportação: o saldo de abertura entra antes do primeiro
 * movimento da data de início da conta em diante (ou no fim, se não houver).
 */
export function itensDoExtrato(linhas: readonly LinhaExtrato[], abertura: AberturaContaExtrato | null | undefined): ItemExtrato[] {
    const itens: ItemExtrato[] = linhas.map((linha) => ({tipo: "linha", linha}));
    if (!abertura) return itens;
    const i = linhas.findIndex((l) => (l.data_pgto ?? "9999-12-31") >= abertura.data);
    itens.splice(i < 0 ? itens.length : i, 0, {tipo: "abertura", abertura});
    return itens;
}

/**
 * Aviso quando o período começa antes da data de início da conta: antes dela o
 * sistema não conhece o saldo (aparece zero) e o saldo inicial cadastrado entra
 * como "Saldo de abertura" na data de início.
 */
/** `formatarValor` permite mascarar o valor quando os saldos estão ocultos (useDinheiro). */
export function avisoInicioConta(
    dados: ExtratoContaResposta,
    formatarValor: (valor: number) => string = (v) => BRL.format(v),
): string | null {
    const r = dados.resumo;
    if (dados.modo !== "conta" || !r.antes_do_inicio || !r.inicio_conta) return null;
    const inicio = formatarData(r.inicio_conta);
    if (r.abertura_conta) {
        return `A conta começa em ${inicio} no sistema. Antes dessa data o saldo não é conhecido e aparece zero; ` +
            `o saldo inicial cadastrado (${formatarValor(r.abertura_conta.valor)}) entra na linha "Saldo de abertura" em ${inicio}.`;
    }
    return `A conta começa em ${inicio} no sistema. Antes dessa data o saldo não é conhecido e aparece zero.`;
}

// ─── Exportação ──────────────────────────────────────────────────────────────

export type CelulaExport = string | number | null;

export type ColunaExtrato = {
    header: string;
    /** Larguras em caracteres (XLSX). */
    largura: number;
    moeda?: boolean;
    /** Texto dd/mm/aaaa na tela e no PDF; data de verdade no XLSX. */
    data?: boolean;
    valor: (l: LinhaExtrato) => CelulaExport;
};

/** Colunas da tabela exportada: saldo corrido só com uma conta; conta só na visão de todas. */
export function colunasExtrato(modo: "conta" | "todas"): ColunaExtrato[] {
    const colunas: ColunaExtrato[] = [
        {header: "Data", largura: 12, data: true, valor: (l) => formatarData(l.data_pgto, "")},
        ...(modo === "todas"
            ? [{header: "Conta", largura: 22, valor: (l: LinhaExtrato) => l.conta_bancaria ?? ""}]
            : []),
        {
            header: "Descrição",
            largura: 38,
            valor: (l) => `${l.transferencia ? "[Transferência] " : ""}${l.descricao ?? ""}`.trim(),
        },
        {header: "Parceiro", largura: 26, valor: (l) => l.nome_parceiro ?? ""},
        {header: "Categoria", largura: 24, valor: (l) => l.categoria},
        {header: "Documento", largura: 14, valor: (l) => documentoDaLinha(l.tipo_documento, l.numero_documento)},
        {header: "Entrada (R$)", largura: 15, moeda: true, valor: (l) => (l.entrada ? l.entrada : null)},
        {header: "Saída (R$)", largura: 15, moeda: true, valor: (l) => (l.saida ? l.saida : null)},
        ...(modo === "conta"
            ? [{header: "Saldo (R$)", largura: 16, moeda: true, valor: (l: LinhaExtrato) => l.saldo_apos}]
            : []),
        {header: "Conciliação", largura: 15, valor: (l) => (l.conciliado ? "Conciliado" : "Não conciliado")},
        {header: "Linha do extrato", largura: 40, valor: (l) => textoVinculo(l.extrato)},
    ];
    return colunas;
}

export type TituloExtrato = {titulo: string; subtitulo: string; arquivo: string};

export function tituloExtrato(dados: ExtratoContaResposta): TituloExtrato {
    const conta = dados.conta?.nome ?? "Todas as contas";
    const periodo = rotuloPeriodo(dados.periodo.inicio, dados.periodo.fim);
    const filtro = dados.tipo === "ambos" ? "" : `  |  ${rotuloTipoFiltro(dados.tipo)}`;
    return {
        titulo: `Movimentações — ${conta} — ${periodo}`,
        subtitulo: `${formatarData(dados.periodo.inicio)} a ${formatarData(dados.periodo.fim)}${filtro}  |  ${dados.linhas.length} lançamento${dados.linhas.length === 1 ? "" : "s"}`,
        arquivo: `Movimentacoes_${conta}_${dados.periodo.inicio}_a_${dados.periodo.fim}`.replace(/\s+/g, "_"),
    };
}

/** Resumo de saldos (rótulo, valor) — mesmo bloco no XLSX e no PDF. */
export function linhasResumo(dados: ExtratoContaResposta): Array<[string, CelulaExport]> {
    const r = dados.resumo;
    const nc = dados.nao_conciliados;
    const abertura: Array<[string, CelulaExport]> = [];
    if (r.abertura_conta) {
        abertura.push([`Saldo de abertura da conta (${formatarData(r.abertura_conta.data)})`, r.abertura_conta.valor]);
    } else if ((r.saldo_abertura ?? 0) !== 0) {
        abertura.push(["Saldo de abertura (contas que começam no período)", r.saldo_abertura ?? 0]);
    }
    return [
        [`Saldo inicial (fim de ${formatarData(r.data_saldo_inicial)})`, r.saldo_inicial],
        ...abertura,
        ["Total de entradas", r.entradas],
        ["Total de saídas", r.saidas],
        [`Saldo final (${formatarData(dados.periodo.fim)})`, r.saldo_final],
        [`Não conciliados (${nc.quantidade} lançamento${nc.quantidade === 1 ? "" : "s"})`, nc.total],
    ];
}

/** Resumo por conta (visão de todas as contas). */
export const COLUNAS_RESUMO_CONTAS = [
    "Conta", "Saldo inicial (R$)", "Entradas (R$)", "Saídas (R$)", "Saldo final (R$)", "Não conciliados", "Valor não conciliado (R$)",
] as const;

export const COLUNA_ABERTURA_CONTAS = "Abertura (R$)";

/** Alguma conta começa dentro do período (tem saldo de abertura). */
export function temAberturaNasContas(contas: readonly ResumoContaExtrato[]): boolean {
    return contas.some((c) => (c.saldo_abertura ?? 0) !== 0);
}

/** Cabeçalho do resumo por conta; a coluna de abertura só aparece se alguma conta começa no período. */
export function colunasResumoContas(contas: readonly ResumoContaExtrato[]): string[] {
    const colunas: string[] = [...COLUNAS_RESUMO_CONTAS];
    if (temAberturaNasContas(contas)) colunas.splice(2, 0, COLUNA_ABERTURA_CONTAS);
    return colunas;
}

export function linhasResumoContas(contas: readonly ResumoContaExtrato[]): CelulaExport[][] {
    const comAbertura = temAberturaNasContas(contas);
    return contas.map((c) => [
        c.nome,
        c.saldo_inicial,
        ...(comAbertura ? [c.saldo_abertura ?? 0] : []),
        c.entradas,
        c.saidas,
        c.saldo_final,
        c.nao_conciliados.quantidade,
        c.nao_conciliados.total,
    ]);
}

/** Linha "Saldo de abertura" nas colunas da tabela exportada. */
function linhaAberturaExport(colunas: readonly ColunaExtrato[], abertura: AberturaContaExtrato): CelulaExport[] {
    return colunas.map((c) => {
        if (c.header === "Data") return formatarData(abertura.data, "");
        if (c.header === "Descrição") return DESCRICAO_ABERTURA;
        if (c.header === "Saldo (R$)") return abertura.saldo_apos;
        return c.moeda ? null : "";
    });
}

/** Linhas da tabela exportada (movimentos e, se houver, o saldo de abertura). */
export function corpoTabelaExtrato(dados: ExtratoContaResposta): {linhas: CelulaExport[][]; itens: ItemExtrato[]} {
    const colunas = colunasExtrato(dados.modo);
    const itens = itensDoExtrato(dados.linhas, dados.resumo.abertura_conta);
    return {
        itens,
        linhas: itens.map((i) => (i.tipo === "abertura" ? linhaAberturaExport(colunas, i.abertura) : colunas.map((c) => c.valor(i.linha)))),
    };
}

/**
 * Planilha inteira (array de linhas): título, período, resumo de saldos,
 * resumo por conta (se houver) e as movimentações com saldo corrido e conciliação.
 */
export function planilhaExtrato(dados: ExtratoContaResposta): CelulaExport[][] {
    const t = tituloExtrato(dados);
    const colunas = colunasExtrato(dados.modo);
    const aviso = avisoInicioConta(dados);
    const linhas: CelulaExport[][] = [[t.titulo], [t.subtitulo], ...(aviso ? [[aviso]] : []), []];
    for (const [rotulo, valor] of linhasResumo(dados)) linhas.push([rotulo, valor]);
    if (dados.modo === "todas" && dados.contas?.length) {
        linhas.push([], ["Resumo por conta"], colunasResumoContas(dados.contas), ...linhasResumoContas(dados.contas));
    }
    linhas.push([], colunas.map((c) => c.header));
    linhas.push(...corpoTabelaExtrato(dados).linhas);
    return linhas;
}

export type CelulaXlsxExtrato = { v: CelulaExport; z?: string };

/**
 * Planilha do XLSX com o formato de cada célula: datas das movimentações como
 * data do Excel (dd/mm/aaaa), valores como número com formato monetário e a
 * contagem de não conciliados (resumo por conta) como inteiro.
 */
export function celulasPlanilhaExtrato(dados: ExtratoContaResposta): CelulaXlsxExtrato[][] {
    const aoa = planilhaExtrato(dados);
    const colunas = colunasExtrato(dados.modo);
    // Movimentos (inclui a linha de saldo de abertura, se houver) ficam no fim da planilha.
    const cabecalhoMovimentos = aoa.length - corpoTabelaExtrato(dados).linhas.length - 1;
    // A coluna de abertura pode deslocar "Não conciliados" no resumo por conta.
    const colunasContas = colunasResumoContas(dados.contas ?? []);
    const colContagem = colunasContas.indexOf("Não conciliados");
    const inicioContas = aoa.findIndex((l) => l[0] === colunasContas[0] && l[colContagem] === colunasContas[colContagem]);
    const qtdContas = inicioContas >= 0 ? (dados.contas?.length ?? 0) : 0;
    return aoa.map((linha, r) =>
        linha.map((valor, c): CelulaXlsxExtrato => {
            if (r > cabecalhoMovimentos && colunas[c]?.data) {
                const serial = serialExcel(valor);
                return serial === null ? {v: valor} : {v: serial, z: FORMATO_DATA_XLSX};
            }
            if (typeof valor !== "number") return {v: valor};
            const ehContagem = r > inicioContas && r <= inicioContas + qtdContas && c === colContagem;
            return {v: valor, z: ehContagem ? "0" : FORMATO_MOEDA_XLSX};
        }),
    );
}
