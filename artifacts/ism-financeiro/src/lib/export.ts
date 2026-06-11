/**
 * Utilitário de exportação global — Fase 5
 *
 * Duas funções genéricas, agnósticas ao domínio:
 *   - exportToExcel  → usa a lib `xlsx` (SheetJS)
 *   - exportToPDF    → usa `jspdf` + `jspdf-autotable`
 */

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type ExportColumn = {
  header: string;
  key: string;
  width?: number;
  formatter?: (value: unknown, row: Record<string, unknown>) => string | number;
};

export type PDFOptions = {
  title?: string;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
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


function fmtCompact(raw: unknown): string {

  if (typeof raw === "number") {
    return raw.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  const str = String(raw ?? "");
  
  const cleaned = str.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = Number(cleaned);
  if (isNaN(n)) return str;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

  const headerRow = columns.map((c) => c.header);
  const dataRows = data.map((row) => columns.map((c) => resolveCell(c, row)));

  const wsData = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 22 }));

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true } };
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

  const { title, subtitle, orientation = "portrait" } = options;

  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 30;
  const marginRight = 30;
  const tableWidth = pageWidth - marginLeft - marginRight;

  // ── Larguras proporcionais: col 0 (Categoria) = 2× as demais ─────────────
  const firstColWeight = 2;
  const totalWeight = firstColWeight + (columns.length - 1);
  const unitPt = tableWidth / totalWeight;
  const firstColPt = unitPt * firstColWeight;
  const otherColPt = unitPt;

  const columnStyles = columns.reduce<
    Record<number, { cellWidth: number; halign?: "left" | "right" | "center" }>
  >((acc, _, idx) => {
    acc[idx] = {
      cellWidth: idx === 0 ? firstColPt : otherColPt,
      halign: idx === 0 ? "left" : "right",
    };
    return acc;
  }, {});

  // ── Corpo do PDF com valores compactos ────────────────────────────────────
  const bodyRows = data.map((row) =>
    columns.map((c, idx) => {
      const val = resolveCell(c, row);
      if (idx === 0) return String(val ?? "");
      return fmtCompact(val);
    }),
  );

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
    margin: { left: marginLeft, right: marginRight },
    tableWidth,
    head: [columns.map((c) => c.header)],
    body: bodyRows,
    styles: {
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      overflow: "ellipsize",
      valign: "middle",
    },
    headStyles: {
      fillColor: [59, 168, 220],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    alternateRowStyles: {
      fillColor: [248, 249, 252],
    },
    didParseCell: (hookData) => {
      // Última linha (TOTAL) em negrito com fundo diferenciado
      if (hookData.row.index === data.length - 1 && hookData.section === "body") {
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
        { align: "right" },
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
  if (!value) return "—";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pt-BR");
}
