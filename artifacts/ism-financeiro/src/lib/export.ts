/**
 * Utilitário de exportação global — Fase 5
 *
 * Duas funções genéricas, agnósticas ao domínio:
 *   - exportToExcel  -> usa a lib `xlsx` (SheetJS)
 *   - exportToPDF    -> usa `jspdf` + `jspdf-autotable`
 */

import * as XLSX from "xlsx";
import {jsPDF} from "jspdf";
import autoTable from "jspdf-autotable";
import {formatarData} from "./datas";
import {celulaXlsx, layoutTabelaPdf, textoPdf, type MedidaColunaPdf, type TipoColunaExport} from "./export-celulas";

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type ExportColumn = {
    header: string;
    key: string;
    width?: number;
    /** Moeda ou data: a exportação formata a partir de `row[key]` (ver export-celulas). */
    tipo?: TipoColunaExport;
    /** Texto da célula; com `tipo`, só vale quando o valor bruto não é reconhecido. */
    formatter?: (value: unknown, row: Record<string, unknown>) => string | number;
};

export type PDFOptions = {
    title?: string;
    subtitle?: string;
    orientation?: "portrait" | "landscape";
    /** Última linha é um total: negrito com fundo destacado. Padrão: não. */
    destacarUltimaLinha?: boolean;
};

// ─── Helpers internos ───────────────────────────────────────────────────────

function resolveCell(
    col: ExportColumn,
    row: Record<string, unknown>,
): string | number {
    const raw = row[col.key];
    if (col.formatter) return col.formatter(raw, row);
    if (raw === null || raw === undefined) return "";
    return raw as string | number;
}

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, "-");
}

/** Linhas do XLSX (cabeçalho + dados) com o formato de número de cada célula. */
export function montarPlanilhaExport(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
): Array<Array<{ v: string | number; z?: string }>> {
    return [
        columns.map((c) => ({v: c.header})),
        ...data.map((row) => columns.map((c) => celulaXlsx(c.tipo, row[c.key], () => resolveCell(c, row)))),
    ];
}

/** Corpo da tabela do PDF: valores com centavos, datas dd/mm/aaaa. */
export function montarCorpoPdf(data: Record<string, unknown>[], columns: ExportColumn[]): string[][] {
    return data.map((row) => columns.map((c) => textoPdf(c.tipo, row[c.key], () => resolveCell(c, row))));
}

// ─── Excel (XLSX) ───────────────────────────────────────────────────────────

export function exportToExcel(
    filename: string,
    data: Record<string, unknown>[],
    columns: ExportColumn[],
): void {
    if (data.length === 0) {
        console.warn("[exportToExcel] Nenhum dado para exportar.");
        return;
    }

    const celulas = montarPlanilhaExport(data, columns);
    const ws = XLSX.utils.aoa_to_sheet(celulas.map((linha) => linha.map((c) => c.v)));
    celulas.forEach((linha, r) => {
        linha.forEach((c, col) => {
            const cel = ws[XLSX.utils.encode_cell({r, c: col})];
            if (cel && c.z) cel.z = c.z;
        });
    });

    ws["!cols"] = columns.map((c) => ({wch: c.width ?? 22}));

    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({r: 0, c: C});
        if (!ws[addr]) continue;
        ws[addr].s = {font: {bold: true}};
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, `${sanitizeFilename(filename)}.xlsx`);
}

// ─── PDF (jsPDF + autoTable) ────────────────────────────────────────────────

export function exportToPDF(
    filename: string,
    data: Record<string, unknown>[],
    columns: ExportColumn[],
    options: PDFOptions = {},
): void {
    if (data.length === 0) {
        console.warn("[exportToPDF] Nenhum dado para exportar.");
        return;
    }

    const {title, subtitle, orientation = "portrait", destacarUltimaLinha = false} = options;

    const doc = new jsPDF({orientation, unit: "pt", format: "a4"});

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginLeft = 30;
    const marginRight = 30;
    const tableWidth = pageWidth - marginLeft - marginRight;

    // ── Corpo com centavos; larguras e fonte ajustadas para nenhum valor ser cortado ──
    const bodyRows = montarCorpoPdf(data, columns);
    const medir = (texto: string, negrito: boolean) => {
        doc.setFont("helvetica", negrito ? "bold" : "normal");
        return doc.getStringUnitWidth(texto); // largura em unidades de fonte (unit "pt")
    };
    const medidas: MedidaColunaPdf[] = columns.map((c, idx) => ({
        corpo: Math.max(0, ...bodyRows.map((linha) => medir(linha[idx] ?? "", destacarUltimaLinha))),
        cabecalho: Math.max(0, ...c.header.split(/\s+/).map((p) => medir(p, true))),
    }));
    const layout = layoutTabelaPdf(tableWidth, medidas);

    const columnStyles = columns.reduce<
        Record<number, { cellWidth: number; halign?: "left" | "right" | "center" }>
    >((acc, _, idx) => {
        acc[idx] = {
            cellWidth: layout.larguras[idx]!,
            halign: idx === 0 ? "left" : "right",
        };
        return acc;
    }, {});

    let cursorY = 36;

    if (title) {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(title, marginLeft, cursorY);
        cursorY += 20;
    }

    if (subtitle) {
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(subtitle, marginLeft, cursorY);
        cursorY += 16;
    }

    autoTable(doc, {
        startY: cursorY + 6,
        margin: {left: marginLeft, right: marginRight},
        tableWidth,
        head: [columns.map((c) => c.header)],
        body: bodyRows,
        styles: {
            fontSize: layout.fonte,
            cellPadding: {top: 3, bottom: 3, left: 3, right: 3},
            overflow: "linebreak",
            valign: "middle",
        },
        headStyles: {
            fillColor: [59, 168, 220],
            textColor: 255,
            fontStyle: "bold",
            fontSize: layout.fonte,
            halign: "center",
            cellPadding: {top: 4, bottom: 4, left: 3, right: 3},
        },
        alternateRowStyles: {
            fillColor: [248, 249, 252],
        },
        didParseCell: (hookData) => {
            // Linha de total (opção explícita do chamador) em negrito com fundo diferenciado
            if (destacarUltimaLinha && hookData.row.index === data.length - 1 && hookData.section === "body") {
                hookData.cell.styles.fontStyle = "bold";
                hookData.cell.styles.fillColor = [225, 235, 245];
            }
        },
        columnStyles,
        didDrawPage: (hookData) => {
            const pageCount = (
                doc as jsPDF & { internal: { getNumberOfPages: () => number } }
            ).internal.getNumberOfPages();
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            const now = new Date().toLocaleString("pt-BR");
            doc.text(
                `${now}  |  Página ${hookData.pageNumber} de ${pageCount}`,
                pageWidth - marginRight,
                doc.internal.pageSize.getHeight() - 14,
                {align: "right"},
            );
        },
    });

    doc.save(`${sanitizeFilename(filename)}.pdf`);
}

// ─── Helpers de formatação reutilizáveis ────────────────────────────────────

export function fmtBRL(value: unknown): string {
    const n = Number(value);
    if (isNaN(n)) return "—";
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(n);
}

export function fmtCents(cents: unknown): string {
    const n = Number(cents);
    if (isNaN(n)) return "—";
    return fmtBRL(n / 100);
}

export function fmtDate(value: unknown): string {
    return formatarData(value, "—");
}
