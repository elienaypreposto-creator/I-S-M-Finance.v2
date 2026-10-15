/**
 * Núcleo puro dos filtros padronizados (sem React): definições, leitura e
 * escrita na query string, contagem e chips de filtros ativos.
 *
 * O estado de cada filtro mora na URL com o mesmo nome do parâmetro da API:
 * - multi → `status=pendente,atrasado`
 * - faixa-moeda → `valor_min=100` e `valor_max=500` (chave + `_min`/`_max`)
 * - select / combobox → `conta_id=3`
 */

export type OpcaoFiltro = {
    valor: string;
    rotulo: string;
    /** Agrupa opções no combobox (ex.: categoria do plano de contas). */
    grupo?: string;
};

export type ValoresFiltros = Record<string, string>;

export type TipoFiltro = "multi" | "faixa-moeda" | "select" | "combobox";

export type DefinicaoFiltro = {
    chave: string;
    rotulo: string;
    tipo: TipoFiltro;
    /** Lista fixa ou calculada a partir do rascunho (ex.: centros do departamento escolhido). */
    opcoes?: OpcaoFiltro[] | ((rascunho: ValoresFiltros) => OpcaoFiltro[]);
    /** Chave de outro filtro: este fica desabilitado sem ela e é limpo quando ela muda. */
    dependeDe?: string;
    /** Texto da opção vazia ("Todas as contas") ou do campo vazio. */
    placeholder?: string;
    /** Placeholder quando `dependeDe` ainda não tem valor. */
    placeholderDependente?: string;
};

export type ChipFiltro = {
    chave: string;
    rotulo: string;
    texto: string;
};

export const SEPARADOR_MULTI = ",";

export function chavesDaDefinicao(def: DefinicaoFiltro): string[] {
    return def.tipo === "faixa-moeda" ? [`${def.chave}_min`, `${def.chave}_max`] : [def.chave];
}

export function opcoesDaDefinicao(def: DefinicaoFiltro, valores: ValoresFiltros): OpcaoFiltro[] {
    if (!def.opcoes) return [];
    return typeof def.opcoes === "function" ? def.opcoes(valores) : def.opcoes;
}

export function separarMulti(valor: string | undefined | null): string[] {
    if (!valor) return [];
    return valor
        .split(SEPARADOR_MULTI)
        .map((v) => v.trim())
        .filter(Boolean);
}

export function juntarMulti(valores: string[]): string {
    return Array.from(new Set(valores.filter(Boolean))).join(SEPARADOR_MULTI);
}

/** Lê da query string só os parâmetros que pertencem às definições. */
export function lerValoresDaQuery(defs: DefinicaoFiltro[], params: URLSearchParams): ValoresFiltros {
    const valores: ValoresFiltros = {};
    for (const def of defs) {
        for (const chave of chavesDaDefinicao(def)) {
            const bruto = params.get(chave)?.trim();
            if (!bruto) continue;
            if (def.tipo === "faixa-moeda") {
                const n = Number(bruto);
                if (!Number.isFinite(n) || n < 0) continue;
            }
            if (def.tipo === "multi") {
                const lista = juntarMulti(separarMulti(bruto));
                if (lista) valores[chave] = lista;
                continue;
            }
            valores[chave] = bruto;
        }
    }
    return valores;
}

/** Monta o patch da URL: toda chave das definições recebe o novo valor ou é removida. */
export function patchDosValores(defs: DefinicaoFiltro[], valores: ValoresFiltros): Record<string, string | null> {
    const patch: Record<string, string | null> = {};
    for (const def of defs) {
        for (const chave of chavesDaDefinicao(def)) {
            const v = valores[chave]?.trim();
            patch[chave] = v ? v : null;
        }
    }
    return patch;
}

export function definicaoAtiva(def: DefinicaoFiltro, valores: ValoresFiltros): boolean {
    return chavesDaDefinicao(def).some((c) => Boolean(valores[c]));
}

export function contarFiltrosAtivos(defs: DefinicaoFiltro[], valores: ValoresFiltros): number {
    return defs.filter((d) => definicaoAtiva(d, valores)).length;
}

/** Remove um filtro e, em cascata, os que dependem dele. */
export function removerFiltro(defs: DefinicaoFiltro[], valores: ValoresFiltros, chave: string): ValoresFiltros {
    const proximo = {...valores};
    const remover = (c: string) => {
        const def = defs.find((d) => d.chave === c);
        if (!def) return;
        for (const k of chavesDaDefinicao(def)) delete proximo[k];
        for (const filho of defs.filter((d) => d.dependeDe === c)) remover(filho.chave);
    };
    remover(chave);
    return proximo;
}

/** Atualiza um valor do rascunho limpando os filtros dependentes quando o pai muda. */
export function atualizarRascunho(
    defs: DefinicaoFiltro[],
    rascunho: ValoresFiltros,
    chave: string,
    valor: string,
): ValoresFiltros {
    const anterior = rascunho[chave] ?? "";
    let proximo: ValoresFiltros = {...rascunho};
    if (valor) proximo[chave] = valor;
    else delete proximo[chave];
    if (anterior !== valor) {
        for (const filho of defs.filter((d) => d.dependeDe === chave)) {
            proximo = removerFiltro(defs, proximo, filho.chave);
        }
    }
    return proximo;
}

// ── Moeda ────────────────────────────────────────────────────────────────────

const fmtMoeda = new Intl.NumberFormat("pt-BR", {style: "currency", currency: "BRL"});
const fmtNumero = new Intl.NumberFormat("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});

export function formatarMoeda(valor: string | number): string {
    return fmtMoeda.format(Number(valor));
}

/** "1.234,56" | "1234,56" | "1.000" | "1234.5" → número em texto ("1234.56"); vazio ou inválido → "". */
export function moedaDigitadaParaUrl(texto: string): string {
    const limpo = texto.replace(/[R$\s]/g, "").trim();
    if (!limpo) return "";
    let normalizado = limpo;
    if (limpo.includes(",")) {
        normalizado = limpo.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
        // Sem vírgula e com grupos de 3 dígitos: ponto é separador de milhar ("1.000").
        normalizado = limpo.replace(/\./g, "");
    }
    if (!/^\d+(\.\d+)?$/.test(normalizado)) return "";
    const n = Number(normalizado);
    if (!Number.isFinite(n) || n < 0) return "";
    return String(Math.round(n * 100) / 100);
}

/** "1234.5" → "1.234,50" (para exibir no campo). */
export function moedaUrlParaDigitada(valor: string | undefined): string {
    if (!valor) return "";
    const n = Number(valor);
    return Number.isFinite(n) ? fmtNumero.format(n) : "";
}

/** Mensagem de erro da faixa ou null se válida. */
export function validarFaixa(min: string | undefined, max: string | undefined): string | null {
    if (!min || !max) return null;
    return Number(min) > Number(max) ? "O valor mínimo não pode ser maior que o máximo." : null;
}

// ── Chips ────────────────────────────────────────────────────────────────────

export function chipsDosFiltros(defs: DefinicaoFiltro[], valores: ValoresFiltros): ChipFiltro[] {
    const chips: ChipFiltro[] = [];
    for (const def of defs) {
        if (!definicaoAtiva(def, valores)) continue;
        const rotuloDe = (v: string) =>
            opcoesDaDefinicao(def, valores).find((o) => o.valor === v)?.rotulo ?? v;
        let texto = "";
        if (def.tipo === "multi") {
            texto = separarMulti(valores[def.chave]).map(rotuloDe).join(", ");
        } else if (def.tipo === "faixa-moeda") {
            const min = valores[`${def.chave}_min`];
            const max = valores[`${def.chave}_max`];
            if (min && max) texto = `${formatarMoeda(min)} a ${formatarMoeda(max)}`;
            else if (min) texto = `a partir de ${formatarMoeda(min)}`;
            else texto = `até ${formatarMoeda(max)}`;
        } else {
            texto = rotuloDe(valores[def.chave]);
        }
        chips.push({chave: def.chave, rotulo: def.rotulo, texto});
    }
    return chips;
}

// ── Busca no navegador ──────────────────────────────────────────────────────

export function normalizarBusca(s: string | null | undefined): string {
    return (s ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
}

/** true se algum dos campos contém o termo (sem acento e sem caixa). */
export function contemBusca(termo: string, ...campos: Array<string | number | null | undefined>): boolean {
    const q = normalizarBusca(termo);
    if (!q) return true;
    return campos.some((c) => normalizarBusca(c == null ? "" : String(c)).includes(q));
}

/** Para filtros multi aplicados no navegador: vazio = sem restrição. */
export function casaMulti(valorFiltro: string | undefined, valorItem: string | null | undefined): boolean {
    const lista = separarMulti(valorFiltro);
    if (lista.length === 0) return true;
    return valorItem != null && lista.includes(valorItem);
}
