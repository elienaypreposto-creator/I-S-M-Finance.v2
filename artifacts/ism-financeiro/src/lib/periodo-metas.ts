/**
 * Recorte de período do Relatório de Metas (lógica pura, sem React).
 *
 * A API devolve o ano inteiro mês a mês; o recorte é feito no cliente:
 * a "visão" (ano / semestre / trimestre / mês) define os períodos possíveis
 * e o usuário marca um ou mais deles. Os meses que entram na conta são a
 * união dos meses dos períodos marcados.
 *
 * Na URL: `?visao=trimestre&periodos=2,3` (visão "ano" = sem parâmetros).
 */

export type VisaoPeriodo = "ano" | "semestre" | "trimestre" | "mes";

export type SelecaoPeriodo = {
    visao: VisaoPeriodo;
    /** Índices 1-based dos períodos marcados, em ordem crescente e sem repetição. */
    periodos: number[];
};

export type Periodo = {
    indice: number;
    /** Ex.: "2º trimestre", "Março". */
    rotulo: string;
    /** Ex.: "2º tri", "Mar". */
    rotuloCurto: string;
    meses: number[];
};

export const PARAM_VISAO = "visao";
export const PARAM_PERIODOS = "periodos";

export const VISOES: { valor: VisaoPeriodo; rotulo: string }[] = [
    {valor: "ano", rotulo: "Ano inteiro"},
    {valor: "semestre", rotulo: "Semestre"},
    {valor: "trimestre", rotulo: "Trimestre"},
    {valor: "mes", rotulo: "Mês"},
];

export const MESES_CURTOS = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const MESES_LONGOS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TODOS_OS_MESES = Array.from({length: 12}, (_, i) => i + 1);

/** Quantos meses cada período da visão cobre. */
const MESES_POR_PERIODO: Record<VisaoPeriodo, number> = {ano: 12, semestre: 6, trimestre: 3, mes: 1};

function faixa(inicio: number, tamanho: number): number[] {
    return Array.from({length: tamanho}, (_, i) => inicio + i);
}

export function ehVisao(v: string): v is VisaoPeriodo {
    return v === "ano" || v === "semestre" || v === "trimestre" || v === "mes";
}

/** Todos os períodos possíveis de uma visão, em ordem. */
export function periodosDaVisao(visao: VisaoPeriodo): Periodo[] {
    const tamanho = MESES_POR_PERIODO[visao];
    const quantidade = 12 / tamanho;
    return Array.from({length: quantidade}, (_, i) => {
        const indice = i + 1;
        const meses = faixa(i * tamanho + 1, tamanho);
        switch (visao) {
            case "ano":
                return {indice, rotulo: "Ano inteiro", rotuloCurto: "Ano", meses};
            case "semestre":
                return {indice, rotulo: `${indice}º semestre`, rotuloCurto: `${indice}º sem`, meses};
            case "trimestre":
                return {indice, rotulo: `${indice}º trimestre`, rotuloCurto: `${indice}º tri`, meses};
            case "mes":
                return {indice, rotulo: MESES_LONGOS[i], rotuloCurto: MESES_CURTOS[i], meses};
        }
    });
}

/** Período da visão que contém o mês (1–12). */
export function periodoDoMes(visao: VisaoPeriodo, mes: number): number {
    return Math.floor((mes - 1) / MESES_POR_PERIODO[visao]) + 1;
}

/**
 * Seleção padrão ao trocar de visão: o período que contém o mês de referência
 * (normalmente o mês corrente).
 */
export function selecaoPadrao(visao: VisaoPeriodo, mesReferencia: number): SelecaoPeriodo {
    return {visao, periodos: [periodoDoMes(visao, mesReferencia)]};
}

/** Períodos marcados (objetos completos), na ordem do ano. */
export function periodosSelecionados(sel: SelecaoPeriodo): Periodo[] {
    return periodosDaVisao(sel.visao).filter((p) => sel.periodos.includes(p.indice));
}

/** Meses (1–12) que entram na conta, em ordem crescente. */
export function mesesDaSelecao(sel: SelecaoPeriodo): number[] {
    if (sel.visao === "ano") return [...TODOS_OS_MESES];
    const meses = new Set<number>();
    for (const p of periodosSelecionados(sel)) for (const m of p.meses) meses.add(m);
    return [...meses].sort((a, b) => a - b);
}

/**
 * Lê a seleção dos parâmetros da URL. Visão inválida → ano inteiro; períodos
 * ausentes, inválidos ou fora da faixa são descartados e, se nada sobrar,
 * cai no período do mês de referência.
 */
export function lerSelecaoDaUrl(
    visaoRaw: string | null | undefined,
    periodosRaw: string | null | undefined,
    mesReferencia: number,
): SelecaoPeriodo {
    const visao = visaoRaw && ehVisao(visaoRaw) ? visaoRaw : "ano";
    if (visao === "ano") return {visao, periodos: [1]};
    const maximo = periodosDaVisao(visao).length;
    const periodos = [
        ...new Set(
            (periodosRaw ?? "")
                .split(",")
                .map((s) => s.trim())
                .filter((s) => /^\d{1,2}$/.test(s))
                .map(Number)
                .filter((n) => n >= 1 && n <= maximo),
        ),
    ].sort((a, b) => a - b);
    return periodos.length > 0 ? {visao, periodos} : selecaoPadrao(visao, mesReferencia);
}

/** Patch de URL da seleção (ano inteiro remove os dois parâmetros). */
export function selecaoParaUrl(sel: SelecaoPeriodo): Record<typeof PARAM_VISAO | typeof PARAM_PERIODOS, string | null> {
    if (sel.visao === "ano") return {[PARAM_VISAO]: null, [PARAM_PERIODOS]: null};
    return {
        [PARAM_VISAO]: sel.visao,
        [PARAM_PERIODOS]: [...new Set(sel.periodos)].sort((a, b) => a - b).join(","),
    };
}

/**
 * Marca/desmarca um período. Nunca deixa a seleção vazia: desmarcar o único
 * período marcado não tem efeito.
 */
export function alternarPeriodo(sel: SelecaoPeriodo, indice: number): SelecaoPeriodo {
    if (sel.periodos.includes(indice)) {
        if (sel.periodos.length === 1) return sel;
        return {...sel, periodos: sel.periodos.filter((p) => p !== indice)};
    }
    return {...sel, periodos: [...sel.periodos, indice].sort((a, b) => a - b)};
}

export function todosMarcados(sel: SelecaoPeriodo): boolean {
    return sel.periodos.length === periodosDaVisao(sel.visao).length;
}

function juntarComE(partes: string[]): string {
    if (partes.length <= 1) return partes.join("");
    return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** Texto curto do botão da lista suspensa (ex.: "2º trimestre", "1º, 3º tri", "5 meses"). */
export function resumoDaSelecao(sel: SelecaoPeriodo): string {
    if (sel.visao === "ano") return "Ano inteiro";
    const marcados = periodosSelecionados(sel);
    if (marcados.length === 1) return marcados[0].rotulo;
    if (todosMarcados(sel)) {
        return {semestre: "Os 2 semestres", trimestre: "Os 4 trimestres", mes: "Os 12 meses"}[sel.visao];
    }
    if (sel.visao === "mes") {
        return marcados.length <= 3 ? marcados.map((p) => p.rotuloCurto).join(", ") : `${marcados.length} meses`;
    }
    const sufixo = sel.visao === "semestre" ? "sem" : "tri";
    return `${marcados.map((p) => `${p.indice}º`).join(", ")} ${sufixo}`;
}

/**
 * Descrição do período para título, subtítulo e PDF.
 * Ex.: "2026", "2º trimestre 2026", "1º e 3º trimestres 2026", "Jan, Fev e Mar 2026".
 */
export function descricaoDaSelecao(sel: SelecaoPeriodo, ano: number): string {
    if (sel.visao === "ano") return String(ano);
    const marcados = periodosSelecionados(sel);
    if (marcados.length === 1) return `${marcados[0].rotulo} ${ano}`;
    if (sel.visao === "mes") return `${juntarComE(marcados.map((p) => p.rotuloCurto))} ${ano}`;
    const plural = sel.visao === "semestre" ? "semestres" : "trimestres";
    return `${juntarComE(marcados.map((p) => `${p.indice}º`))} ${plural} ${ano}`;
}

/**
 * Sufixo do nome do arquivo exportado (sem espaços/acentos).
 * Ex.: "" (ano), "2T", "1T-3T", "1S", "Jan-Fev-Mar".
 */
export function sufixoArquivoDaSelecao(sel: SelecaoPeriodo): string {
    if (sel.visao === "ano") return "";
    const marcados = periodosSelecionados(sel);
    if (sel.visao === "mes") return marcados.map((p) => p.rotuloCurto).join("-");
    const letra = sel.visao === "semestre" ? "S" : "T";
    return marcados.map((p) => `${p.indice}${letra}`).join("-");
}
