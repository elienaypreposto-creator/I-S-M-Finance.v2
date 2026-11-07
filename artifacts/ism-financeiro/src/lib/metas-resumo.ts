/**
 * Orçado × Realizado × % do Relatório de Metas, por categoria e por período
 * (lógica pura, sem React). Soma sempre em centavos para não acumular erro de float.
 *
 * Receitas e despesas (custos + despesas) nunca se somam: cada grupo tem o seu
 * orçado, realizado e %, e o resultado é receitas − despesas. Uma categoria do
 * plano com contas de tipos diferentes (ex.: "34343" com uma conta de receita e
 * outra de custo) vira uma linha por tipo, cada uma no seu grupo.
 */
import type {Periodo} from "./periodo-metas";

/** Tipo da conta do plano (plano_contas.tipo). */
export type TipoCategoria = "receita" | "custo" | "despesa";
/** Grupo do relatório: custos e despesas ficam juntos em "despesas". */
export type GrupoMeta = "receitas" | "despesas";

export type ItemMetaResumo = {
    categoria: string | null;
    /** Tipo da conta do plano; ausente ou desconhecido conta como despesa. */
    tipo?: string | null;
    subcategoria?: string | null;
    mes: number;
    valor_projetado: number;
    valor_realizado: number | null;
    juros: number | null;
};

export type ValoresMeta = {
    orcadoCents: number;
    realizadoCents: number;
    jurosCents: number;
};

export type LinhaCategoriaMeta = {
    /** tipo + nome: identifica a linha (o mesmo nome pode existir em tipos diferentes). */
    chave: string;
    categoria: string;
    tipo: TipoCategoria;
    grupo: GrupoMeta;
    /** Subcategorias (contas do plano) que somaram nesta linha, em ordem alfabética. */
    subcategorias: string[];
    /** Tem orçado no recorte selecionado. Sem orçado a linha vai para "Sem meta". */
    comMeta: boolean;
    /** Outra linha tem nome igual ou parecido (maiúsculas/acentos): mostrar tipo/caminho. */
    nomeParecido: boolean;
    /** Na mesma ordem dos períodos recebidos. */
    porPeriodo: ValoresMeta[];
    total: ValoresMeta;
};

export type BlocoMetas = {
    grupo: GrupoMeta;
    /** Só as categorias com orçado no recorte. */
    linhas: LinhaCategoriaMeta[];
    /** Soma das linhas com meta (base do %). */
    totalPorPeriodo: ValoresMeta[];
    total: ValoresMeta;
    /** Realizado do grupo em categorias sem orçado (fora do %). */
    semMetaPorPeriodo: ValoresMeta[];
    semMeta: ValoresMeta;
};

export type ResumoMetas = {
    receitas: BlocoMetas;
    despesas: BlocoMetas;
    /** Categorias realizadas sem orçado no recorte: receitas primeiro, depois despesas. */
    semMeta: LinhaCategoriaMeta[];
    /**
     * Receitas − despesas. Orçado: o das metas. Realizado: tudo o que foi realizado
     * (com e sem meta), porque é o resultado de fato. Juros: todos.
     */
    resultadoPorPeriodo: ValoresMeta[];
    resultado: ValoresMeta;
};

export const SEM_CATEGORIA = "Sem categoria";

export const ROTULO_TIPO: Record<TipoCategoria, string> = {
    receita: "Receita",
    custo: "Custo",
    despesa: "Despesa",
};

export const ROTULO_GRUPO: Record<GrupoMeta, string> = {
    receitas: "Receitas",
    despesas: "Despesas",
};

export function toCents(v: number | null | undefined): number {
    return Math.round((Number(v) || 0) * 100);
}

export function normalizarTipo(tipo: string | null | undefined): TipoCategoria {
    const t = (tipo ?? "").trim().toLowerCase();
    return t === "receita" || t === "custo" ? t : "despesa";
}

export function grupoDoTipo(tipo: TipoCategoria): GrupoMeta {
    return tipo === "receita" ? "receitas" : "despesas";
}

/** Chave da linha do relatório a que o item pertence (tipo + nome da categoria). */
export function chaveDaLinha(item: Pick<ItemMetaResumo, "categoria" | "tipo">): string {
    return `${normalizarTipo(item.tipo)}|${item.categoria ?? SEM_CATEGORIA}`;
}

/** Nome para comparar categorias: sem maiúsculas, acentos e espaços extras. */
export function nomeComparavel(nome: string): string {
    return nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/** "Receita › Despesas gerais › Abracadabra, Moradia" */
export function caminhoCategoria(linha: Pick<LinhaCategoriaMeta, "tipo" | "categoria" | "subcategorias">): string {
    const partes = [ROTULO_TIPO[linha.tipo], linha.categoria];
    if (linha.subcategorias.length > 0) partes.push(linha.subcategorias.join(", "));
    return partes.join(" › ");
}

function zerado(): ValoresMeta {
    return {orcadoCents: 0, realizadoCents: 0, jurosCents: 0};
}

function somarValores(destino: ValoresMeta, v: ValoresMeta): void {
    destino.orcadoCents += v.orcadoCents;
    destino.realizadoCents += v.realizadoCents;
    destino.jurosCents += v.jurosCents;
}

function somarItem(destino: ValoresMeta, item: ItemMetaResumo): void {
    destino.orcadoCents += toCents(item.valor_projetado);
    destino.realizadoCents += toCents(item.valor_realizado);
    destino.jurosCents += toCents(item.juros);
}

function montarBloco(grupo: GrupoMeta, linhas: LinhaCategoriaMeta[], nPeriodos: number): BlocoMetas {
    const bloco: BlocoMetas = {
        grupo,
        linhas: [],
        totalPorPeriodo: Array.from({length: nPeriodos}, zerado),
        total: zerado(),
        semMetaPorPeriodo: Array.from({length: nPeriodos}, zerado),
        semMeta: zerado(),
    };
    for (const linha of linhas) {
        if (linha.grupo !== grupo) continue;
        const porPeriodo = linha.comMeta ? bloco.totalPorPeriodo : bloco.semMetaPorPeriodo;
        linha.porPeriodo.forEach((v, i) => somarValores(porPeriodo[i], v));
        somarValores(linha.comMeta ? bloco.total : bloco.semMeta, linha.total);
        if (linha.comMeta) bloco.linhas.push(linha);
    }
    return bloco;
}

function resultadoDe(rec: ValoresMeta, recSem: ValoresMeta, desp: ValoresMeta, despSem: ValoresMeta): ValoresMeta {
    return {
        orcadoCents: rec.orcadoCents - desp.orcadoCents,
        realizadoCents: rec.realizadoCents + recSem.realizadoCents - desp.realizadoCents - despSem.realizadoCents,
        jurosCents: rec.jurosCents + recSem.jurosCents + desp.jurosCents + despSem.jurosCents,
    };
}

function valoresZerados(v: ValoresMeta): boolean {
    return v.orcadoCents === 0 && v.realizadoCents === 0 && v.jurosCents === 0;
}

const ORDEM_TIPO: Record<TipoCategoria, number> = {receita: 0, custo: 1, despesa: 2};

/**
 * Agrupa os itens da API por tipo + categoria e por período. Itens de meses fora
 * dos períodos recebidos são ignorados. Linhas em ordem alfabética dentro do grupo.
 */
export function resumirMetas(itens: ItemMetaResumo[], periodos: Periodo[]): ResumoMetas {
    const periodoDoMes = new Map<number, number>();
    periodos.forEach((p, i) => p.meses.forEach((m) => periodoDoMes.set(m, i)));

    type Acumulada = { linha: LinhaCategoriaMeta; subs: Set<string> };
    const porChave = new Map<string, Acumulada>();

    for (const item of itens) {
        const idx = periodoDoMes.get(item.mes);
        if (idx === undefined) continue;
        const nome = item.categoria ?? SEM_CATEGORIA;
        const tipo = normalizarTipo(item.tipo);
        const chave = chaveDaLinha(item);
        let acc = porChave.get(chave);
        if (!acc) {
            acc = {
                linha: {
                    chave,
                    categoria: nome,
                    tipo,
                    grupo: grupoDoTipo(tipo),
                    subcategorias: [],
                    comMeta: false,
                    nomeParecido: false,
                    porPeriodo: periodos.map(zerado),
                    total: zerado(),
                },
                subs: new Set(),
            };
            porChave.set(chave, acc);
        }
        if (item.subcategoria) acc.subs.add(item.subcategoria);
        somarItem(acc.linha.porPeriodo[idx], item);
        somarItem(acc.linha.total, item);
    }

    const contagemNomes = new Map<string, number>();
    for (const {linha} of porChave.values()) {
        const n = nomeComparavel(linha.categoria);
        contagemNomes.set(n, (contagemNomes.get(n) ?? 0) + 1);
    }

    const linhas: LinhaCategoriaMeta[] = [...porChave.values()]
        .map(({linha, subs}) => ({
            ...linha,
            subcategorias: [...subs].sort((a, b) => a.localeCompare(b, "pt-BR")),
            comMeta: linha.total.orcadoCents > 0,
            nomeParecido: (contagemNomes.get(nomeComparavel(linha.categoria)) ?? 0) > 1,
        }))
        // Receitas antes; dentro do grupo, ordem alfabética (custo antes de despesa no empate).
        .sort((a, b) =>
            (a.grupo === b.grupo ? 0 : a.grupo === "receitas" ? -1 : 1) ||
            a.categoria.localeCompare(b.categoria, "pt-BR", {sensitivity: "base"}) ||
            ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo],
        );

    const receitas = montarBloco("receitas", linhas, periodos.length);
    const despesas = montarBloco("despesas", linhas, periodos.length);

    return {
        receitas,
        despesas,
        // Sem meta e sem movimento (orçado, realizado e juros zerados) não diz nada: fica fora.
        semMeta: linhas.filter((l) => !l.comMeta && !valoresZerados(l.total)),
        resultadoPorPeriodo: periodos.map((_, i) =>
            resultadoDe(
                receitas.totalPorPeriodo[i],
                receitas.semMetaPorPeriodo[i],
                despesas.totalPorPeriodo[i],
                despesas.semMetaPorPeriodo[i],
            ),
        ),
        resultado: resultadoDe(receitas.total, receitas.semMeta, despesas.total, despesas.semMeta),
    };
}

/** % de atingimento (realizado / orçado × 100). Orçado zero (ou negativo) → null. */
export function atingimentoPct(v: Pick<ValoresMeta, "orcadoCents" | "realizadoCents">): number | null {
    if (v.orcadoCents <= 0) return null;
    return (v.realizadoCents / v.orcadoCents) * 100;
}

/** Leitura do % para colorir. Receita acima da meta é bom; despesa acima da meta é alerta. */
export type AvaliacaoMeta = "bom" | "alerta" | "neutro";

export function avaliarMeta(grupo: GrupoMeta, pct: number | null): AvaliacaoMeta {
    if (pct == null || !Number.isFinite(pct)) return "neutro";
    if (grupo === "receitas") return pct >= 100 ? "bom" : "neutro";
    return pct > 100 ? "alerta" : "bom";
}

/** "95,3%" ou "—" quando não há orçado. */
export function formatarPct(pct: number | null, casas = 1): string {
    if (pct == null || !Number.isFinite(pct)) return "—";
    return `${pct.toLocaleString("pt-BR", {minimumFractionDigits: casas, maximumFractionDigits: casas})}%`;
}

export function reais(cents: number): number {
    return cents / 100;
}
