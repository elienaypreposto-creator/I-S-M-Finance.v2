/**
 * Montagem das células exportadas (XLSX e PDF), sem libs de arquivo, para
 * poder testar sem gerar nada em disco. Usado por `export.ts` (genérico) e
 * `export-extrato-conta.ts`.
 */
import {formatarData} from "./datas";

/**
 * Tipo da coluna exportada. Com tipo, a exportação formata a célula a partir
 * do valor bruto (`row[key]`) e o `formatter` só vale quando o valor não é
 * reconhecido.
 *   - "moeda": reais (number, "1234.56" da API ou "R$ 1.234,56"). XLSX numérico
 *     com formato monetário; PDF "1.234,56" (centavos sempre).
 *   - "data": data civil ("AAAA-MM-DD"), "dd/mm/aaaa", timestamp ou Date. XLSX
 *     como data de verdade (dd/mm/aaaa); PDF "dd/mm/aaaa".
 */
export type TipoColunaExport = "moeda" | "data";

/** Formato monetário (R$) do Excel; os separadores seguem o idioma do Excel de quem abre. */
export const FORMATO_MOEDA_XLSX = '"R$" #,##0.00;-"R$" #,##0.00';
export const FORMATO_DATA_XLSX = "dd/mm/yyyy";

const NUMERO_2_CASAS = new Intl.NumberFormat("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});

/** Reais a partir de number, "1234.56" (API) ou texto pt-BR ("R$ 1.234,56", "-1.234,56"). */
export function numeroMoeda(valor: unknown): number | null {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (typeof valor !== "string") return null;
    const texto = valor.replace(/R\$/g, "").replace(/\s/g, "");
    if (texto === "") return null;
    if (texto.includes(",")) {
        if (!/^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/.test(texto)) return null;
        return Number(texto.replace(/\./g, "").replace(",", "."));
    }
    if (!/^-?\d+(\.\d+)?$/.test(texto)) return null;
    return Number(texto);
}

/** "1.234,56": sempre com centavos, sem "R$" (o cabeçalho ou o título indicam a moeda). */
export function textoMoeda(valor: number): string {
    return NUMERO_2_CASAS.format(valor === 0 ? 0 : valor); // sem "-0,00"
}

const DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DIA_MS = 86_400_000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

function serialDe(ano: number, mes: number, dia: number): number | null {
    const utc = Date.UTC(ano, mes - 1, dia);
    const d = new Date(utc);
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
    return Math.round((utc - EPOCA_EXCEL) / DIA_MS);
}

/**
 * Número de série da data no Excel (dias desde 30/12/1899), só a data.
 * Data civil e dd/mm/aaaa são lidas como estão (sem fuso); timestamp com hora
 * usa o dia no fuso local, como na tela (`formatarData`).
 */
export function serialExcel(valor: unknown): number | null {
    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) return null;
        return serialDe(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
    }
    if (typeof valor !== "string") return null;
    const texto = valor.trim();
    const civil = DATA_CIVIL.exec(texto);
    if (civil) return serialDe(Number(civil[1]), Number(civil[2]), Number(civil[3]));
    const br = DATA_BR.exec(texto);
    if (br) return serialDe(Number(br[3]), Number(br[2]), Number(br[1]));
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(texto)) return null;
    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return null;
    return serialDe(data.getFullYear(), data.getMonth() + 1, data.getDate());
}

export type CelulaXlsx = { v: string | number; z?: string };

/**
 * Célula do XLSX. Moeda e data viram número com formato; o resto sai como o
 * `alternativo()` devolver (o valor já formatado pela coluna).
 */
export function celulaXlsx(
    tipo: TipoColunaExport | undefined,
    bruto: unknown,
    alternativo: () => string | number,
): CelulaXlsx {
    if (tipo === "moeda") {
        const n = numeroMoeda(bruto);
        if (n !== null) return {v: n, z: FORMATO_MOEDA_XLSX};
    } else if (tipo === "data") {
        const serial = serialExcel(bruto);
        if (serial !== null) return {v: serial, z: FORMATO_DATA_XLSX};
    }
    return {v: alternativo()};
}

/** Texto da célula no PDF: moeda com centavos, data dd/mm/aaaa, o resto como veio. */
export function textoPdf(
    tipo: TipoColunaExport | undefined,
    bruto: unknown,
    alternativo: () => string | number,
): string {
    if (tipo === "moeda") {
        const n = numeroMoeda(bruto);
        if (n !== null) return textoMoeda(n);
    } else if (tipo === "data") {
        if (serialExcel(bruto) !== null) return formatarData(bruto, "");
    }
    const v = alternativo();
    return typeof v === "number" ? v.toLocaleString("pt-BR") : String(v ?? "");
}

// ─── Larguras das colunas no PDF ────────────────────────────────────────────

export type MedidaColunaPdf = {
    /** Maior largura entre as células do corpo, em unidades de fonte (multiplique pelo tamanho). */
    corpo: number;
    /** Maior palavra do cabeçalho (o cabeçalho quebra linha entre palavras). */
    cabecalho: number;
};

export type LayoutPdf = { fonte: number; larguras: number[] };

/**
 * Larguras das colunas e tamanho da fonte da tabela do PDF.
 * Padrão (o de sempre): 1ª coluna (rótulo) com o dobro das demais, fonte 7.
 * Quando algum valor não cabe nesse padrão, as colunas de valor ganham a
 * largura do conteúdo, o rótulo fica com o resto e a fonte diminui (até
 * `fonteMinima`) até caber - valor nunca é cortado.
 */
export function layoutTabelaPdf(
    larguraTabela: number,
    colunas: readonly MedidaColunaPdf[],
    {fonte = 7, fonteMinima = 5, respiro = 6}: { fonte?: number; fonteMinima?: number; respiro?: number } = {},
): LayoutPdf {
    const n = colunas.length;
    if (n <= 1) return {fonte, larguras: [larguraTabela]};

    const precisa = (c: MedidaColunaPdf, f: number) => Math.max(c.corpo, c.cabecalho) * f + respiro;

    const unidade = larguraTabela / (n + 1);
    const padrao = colunas.map((_, i) => (i === 0 ? unidade * 2 : unidade));
    if (colunas.every((c, i) => i === 0 || precisa(c, fonte) <= padrao[i]!)) {
        return {fonte, larguras: padrao};
    }

    const minimoRotulo = (f: number) => Math.min(precisa(colunas[0]!, f), larguraTabela * 0.18);
    let f = fonte;
    for (; f > fonteMinima; f = Math.round((f - 0.25) * 100) / 100) {
        const valores = colunas.slice(1).reduce((s, c) => s + precisa(c, f), 0);
        if (valores + minimoRotulo(f) <= larguraTabela) break;
    }
    const valores = colunas.slice(1).map((c) => precisa(c, f));
    const somaValores = valores.reduce((s, v) => s + v, 0);
    const rotulo = larguraTabela - somaValores;
    if (rotulo >= minimoRotulo(f)) return {fonte: f, larguras: [rotulo, ...valores]};

    // Nem na fonte mínima: o rótulo fica com o mínimo e as colunas de valor
    // dividem o resto na proporção do conteúdo (aí o valor quebra linha).
    const resto = larguraTabela - minimoRotulo(f);
    return {fonte: f, larguras: [minimoRotulo(f), ...valores.map((v) => (v / somaValores) * resto)]};
}
