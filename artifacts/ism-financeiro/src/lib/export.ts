/**
 * Utilitário de exportação global — Fase 5
 *
 * Duas funções genéricas, agnósticas ao domínio:
 *   - exportToExcel  → usa a lib `xlsx` (SheetJS)
 *   - exportToPDF    → usa `jspdf` + `jspdf-autotable`
 *
 * Ambas recebem:
 *   filename  : nome do arquivo sem extensão
 *   data      : array de objetos (Record<string, unknown>)
 *   columns   : mapeamento header → key, com formatador opcional
 *   options   : metadados extras para o PDF (título, subtítulo, orientação)
 */

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type ExportColumn = {
  /** Texto exibido no cabeçalho da coluna */
  header: string;
  /** Chave do objeto de dados */
  key: string;
  /** Largura da coluna no XLSX (caracteres) – padrão 22 */
  width?: number;
  /**
   * Formata o valor antes de escrevê-lo na célula.
   * Retorne string para texto simples ou number para que o XLSX preserve
   * os dados numéricos nativos (permite soma no Excel).
   */
  formatter?: (value: unknown, row: Record<string, unknown>) => string | number;
};

export type PDFOptions = {
  title?: string;
  subtitle?: string;
  /** "landscape" para tabelas largas, "portrait" (padrão) para listas */
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

// ─── Excel (XLSX) ───────────────────────────────────────────────────────────

/**
 * Gera e faz download de um arquivo `.xlsx` com uma aba "Dados".
 *
 * O cabeçalho recebe negrito automático via estilo de célula.
 * Colunas que retornam `number` no formatter são preservadas como numéricas,
 * permitindo fórmulas e somas no Excel.
 */
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

  // Larguras de coluna
  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 22 }));

  // Estilo negrito no cabeçalho (SheetJS CE suporta apenas estrutura básica)
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

/**
 * Gera e faz download de um arquivo `.pdf` com tabela formatada.
 *
 * Usa paleta ISM Finance: azul primário #3BA8DC nos cabeçalhos.
 * Para tabelas largas, passe `options.orientation = "landscape"`.
 */
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

  let cursorY = 30;

  if (title) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text(title, 40, cursorY);
    cursorY += 18;
  }

  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 40, cursorY);
    cursorY += 14;
  }

  autoTable(doc, {
    startY: cursorY + 4,
    head: [columns.map((c) => c.header)],
    body: data.map((row) => columns.map((c) => resolveCell(c, row))),
    styles: {
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [59, 168, 220], // primary ISM Finance
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 250],
    },
    columnStyles: columns.reduce<Record<number, { cellWidth: number }>>(
      (acc, col, idx) => {
        if (col.width) acc[idx] = { cellWidth: col.width };
        return acc;
      },
      {},
    ),
    didDrawPage: (hookData) => {
      // Número de página no rodapé
      const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } })
        .internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      const pageWidth = doc.internal.pageSize.getWidth();
      const now = new Date().toLocaleString("pt-BR");
      doc.text(`${now}  |  Página ${hookData.pageNumber} de ${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 15, { align: "right" });
    },
  });

  doc.save(`${sanitizeFilename(filename)}.pdf`);
}

// ─── Helpers de formatação reutilizáveis ────────────────────────────────────

/** Converte valor numérico (em reais, não centavos) para string BRL formatada */
export function fmtBRL(value: unknown): string {
  const n = Number(value);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

/** Converte centavos (integer) para string BRL formatada */
export function fmtCents(cents: unknown): string {
  const n = Number(cents);
  if (isNaN(n)) return "—";
  return fmtBRL(n / 100);
}

/** Formata datas ISO como dd/mm/aaaa */
export function fmtDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pt-BR");
}
