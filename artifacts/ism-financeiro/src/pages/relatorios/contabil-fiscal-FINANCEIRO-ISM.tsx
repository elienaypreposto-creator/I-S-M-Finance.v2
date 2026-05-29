import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download, FileText, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format, startOfYear, endOfYear } from "date-fns";

const lancamentos = [
  { data: "05/06/2024", dataPgto: "05/06/2024", documento: "NFS-001234", descricao: "Prestação de Serviços - Junho", parceiro: "Tech Solutions S.A.", contaBancaria: "Itaú CC 56789-0", valor: 15000, tipo: "cr", categoria: "1.01 Receita de Serviços" },
  { data: "10/06/2024", dataPgto: "10/06/2024", documento: "NFS-001235", descricao: "Projeto Implementação", parceiro: "Global Industries", contaBancaria: "Itaú CC 56789-0", valor: 35000, tipo: "cr", categoria: "1.01 Receita de Serviços" },
  { data: "25/06/2024", dataPgto: "25/06/2024", documento: "NF-004567", descricao: "AWS - Serviços de Cloud", parceiro: "Amazon Web Services", contaBancaria: "Bradesco CC 98765-4", valor: 4500, tipo: "cp", categoria: "2.02 Fornecedores CSP" },
  { data: "28/06/2024", dataPgto: "28/06/2024", documento: "RPA-00089", descricao: "Pagamento PJ - Dev Sr.", parceiro: "João Silva", contaBancaria: "Bradesco CC 98765-4", valor: 8000, tipo: "cp", categoria: "2.01 Folha PJ" },
  { data: "30/06/2024", dataPgto: "30/06/2024", documento: "NF-004601", descricao: "Aluguel Sala Comercial", parceiro: "Imobiliária Central", contaBancaria: "Nubank PJ 11223344-5", valor: 3200, tipo: "cp", categoria: "3.03 Ocupação" },
  { data: "30/06/2024", dataPgto: "30/06/2024", documento: "TRANSF-001", descricao: "ISS Retido Junho", parceiro: "Prefeitura SP", contaBancaria: "Bradesco CC 98765-4", valor: 1800, tipo: "cp", categoria: "3.01 Administrativas" },
  { data: "30/06/2024", dataPgto: "30/06/2024", documento: "NFS-001236", descricao: "Serviços Consultoria", parceiro: "Alpha Consultoria", contaBancaria: "Itaú CC 56789-0", valor: 22000, tipo: "cr", categoria: "1.01 Receita de Serviços" },
  { data: "15/06/2024", dataPgto: "15/06/2024", documento: "NF-004580", descricao: "Material de Escritório", parceiro: "Office Supplies Ltda", contaBancaria: "Nubank PJ 11223344-5", valor: 850, tipo: "cp", categoria: "3.01 Administrativas" },
];

const impostos = [
  { nome: "ISS", base: 72000, aliquota: 2.5, valor: 1800, vencimento: "10/07/2024", status: "pendente" },
  { nome: "COFINS", base: 72000, aliquota: 3, valor: 2160, vencimento: "15/07/2024", status: "pendente" },
  { nome: "PIS", base: 72000, aliquota: 0.65, valor: 468, vencimento: "15/07/2024", status: "pendente" },
  { nome: "CSLL", base: 20400, aliquota: 9, valor: 1836, vencimento: "30/07/2024", status: "pendente" },
  { nome: "IRPJ", base: 20400, aliquota: 15, valor: 3060, vencimento: "30/07/2024", status: "pendente" },
];

const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtValorPdf(valor: number, tipo: string) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
  return tipo === "cr" ? `+${formatted}` : `-${formatted}`;
}

function fmtBRL(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

/**
 * Converte caracteres especiais do português para equivalentes ASCII simples.
 * Necessário porque a fonte helvetica do jsPDF não suporta UTF-8 completo —
 * ã, ç, é etc. causam caixinhas ou quebras de layout.
 */
function sanitize(str: string): string {
  return str
    .normalize("NFD")                        // decompõe letras com acento em base + diacrítico
    .replace(/[\u0300-\u036f]/g, "")         // remove todos os diacríticos
    .replace(/[^\x00-\x7F]/g, (c) => {      // substitui qualquer não-ASCII restante
      const map: Record<string, string> = {
        "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o",
        "Æ": "AE", "Œ": "OE", "Ø": "O",
        "\u2013": "-", "\u2014": "-",        // en-dash, em-dash
        "\u2018": "'", "\u2019": "'",        // aspas tipográficas
        "\u201C": '"', "\u201D": '"',
        "R$": "R$",
      };
      return map[c] ?? "?";
    });
}

// ─── Exportação PDF via jsPDF + autoTable ────────────────────────────────────
async function exportarPDF(
  filtrados: typeof lancamentos,
  totalEntradas: number,
  totalSaidas: number,
  titulo: string,
  tipoFiltroLabel: string,
) {
  try {
    const jsPDFModule = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
    const autoTable = autoTableModule.default;

    // ── Landscape A4: 297 × 210 mm ───────────────────────────────────────────
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    // Largura útil = 297 - 24 = 273 mm
    // Soma das colunas fixas: 42+20+22+46+28+38 = 196 → sobra 77 mm para "auto" (Descricao)
    const colWidths = { conta: 42, data: 20, doc: 22, descAuto: true, parceiro: 46, valor: 28, cat: 38 };

    // ── Cabeçalho escuro ─────────────────────────────────────────────────────
    doc.setFillColor(22, 22, 38);
    doc.rect(0, 0, pageW, 24, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(sanitize(titulo), margin, 13);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(170, 170, 195);
    doc.text(`Filtro: ${sanitize(tipoFiltroLabel)}  |  ${filtrados.length} registros`, margin, 20);

    // Totais no canto direito
    const saldo = totalEntradas - totalSaidas;
    doc.setFontSize(7.5);
    doc.setTextColor(52, 211, 153);
    doc.text(`Entradas: ${sanitize(fmtBRL(totalEntradas))}`, pageW - margin, 11, { align: "right" });
    doc.setTextColor(239, 68, 68);
    doc.text(`Saidas: ${sanitize(fmtBRL(totalSaidas))}`, pageW - margin, 16.5, { align: "right" });
    doc.setTextColor(...(saldo >= 0 ? [52, 211, 153] : [239, 68, 68]) as [number, number, number]);
    doc.text(`Saldo: ${sanitize(fmtBRL(saldo))}`, pageW - margin, 22, { align: "right" });

    // ── Dados da tabela — tudo sanitizado ────────────────────────────────────
    const head = [[
      "Conta Bancaria", "Data Pagto", "Documento",
      "Descricao", "Cliente / Fornecedor", "Valor (R$)", "Categoria",
    ]];

    const body = filtrados.map((l) => [
      sanitize(l.contaBancaria),
      l.dataPgto,
      l.documento,
      sanitize(l.descricao),
      sanitize(l.parceiro),
      sanitize(fmtValorPdf(l.valor, l.tipo)),
      sanitize(l.categoria),
    ]);

    body.push(["", "", "", "", "TOTAL PERIODO", sanitize(fmtBRL(saldo)), ""]);

    autoTable(doc, {
      head,
      body,
      startY: 27,
      margin: { left: margin, right: margin },
      tableWidth: pageW - margin * 2,          // 273 mm — ocupa toda a largura útil
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        overflow: "linebreak",
        textColor: [25, 25, 40],
        lineColor: [210, 215, 230],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "left",
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: {
        fillColor: [245, 247, 255],
      },
      columnStyles: {
        0: { cellWidth: colWidths.conta },
        1: { cellWidth: colWidths.data, halign: "center" },
        2: { cellWidth: colWidths.doc },
        3: { cellWidth: "auto" },              // absorve o espaço restante (~77 mm)
        4: { cellWidth: colWidths.parceiro },
        5: { cellWidth: colWidths.valor, halign: "right", fontStyle: "bold" },
        6: { cellWidth: colWidths.cat },
      },
      didParseCell(data) {
        if (data.section !== "body") return;

        // Colorir valores
        if (data.column.index === 5) {
          const raw = String(data.cell.raw ?? "");
          if (raw.startsWith("+")) data.cell.styles.textColor = [5, 150, 105];
          else if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38];
        }

        // Linha de total
        if (data.row.index === filtrados.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.textColor = [30, 64, 175];
        }
      },
      didDrawPage(data) {
        // Redesenha o cabeçalho em páginas seguintes
        if (data.pageNumber > 1) {
          doc.setFillColor(22, 22, 38);
          doc.rect(0, 0, pageW, 14, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text(sanitize(titulo), margin, 10);
        }

        // Rodapé com data e paginação
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 160);
        const dateStr = new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }).format(new Date());
        doc.text(
          `${dateStr}  |  Pagina ${data.pageNumber}`,
          pageW - margin,
          pageH - 5,
          { align: "right" },
        );
        // Linha separadora no rodapé
        doc.setDrawColor(200, 205, 220);
        doc.setLineWidth(0.2);
        doc.line(margin, pageH - 8, pageW - margin, pageH - 8);
      },
    });

    doc.save(`Extrato_Contabil_${new Date().toISOString().split("T")[0]}.pdf`);
  } catch (err) {
    console.warn("jsPDF nao encontrado, usando window.print():", err);
    window.print();
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ContabilFiscal() {
  const [tab, setTab] = useState<"livro" | "impostos">("livro");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "cr" | "cp">("todos");
  const [dateStart, setDateStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const mesFiltro = new Date(dateStart).getMonth();
  const anoFiltro = new Date(dateStart).getFullYear();

  const filtrados = lancamentos.filter((l) => tipoFiltro === "todos" || l.tipo === tipoFiltro);

  const totalEntradas = filtrados.filter((l) => l.tipo === "cr").reduce((a, l) => a + l.valor, 0);
  const totalSaidas   = filtrados.filter((l) => l.tipo === "cp").reduce((a, l) => a + l.valor, 0);
  const totalImpostos = impostos.reduce((a, i) => a + i.valor, 0);

  const tipoFiltroLabel =
    tipoFiltro === "todos" ? "Entradas e Saídas" :
    tipoFiltro === "cr"    ? "Somente Entradas"  : "Somente Saídas";

  const tituloPDF = `Relatório Contábil / Fiscal — ${meses[mesFiltro]} ${anoFiltro}`;

  function handleExportPDF() {
    void exportarPDF(filtrados, totalEntradas, totalSaidas, tituloPDF, tipoFiltroLabel);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório Contábil / Fiscal"
        description="Exportável para contabilidade · Conta Bancária · Data Pgto · Descrição · Cliente/Fornecedor · Valor · Categoria"
        actions={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-sm font-medium transition-all"
            >
              <FileText className="w-4 h-4" /> Exportar PDF
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
            >
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button
          onClick={() => setTab("livro")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "livro" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}
        >
          Extrato Contábil
        </button>
        <button
          onClick={() => setTab("impostos")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "impostos" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}
        >
          Obrigações Fiscais
        </button>
      </div>

      {tab === "livro" && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Filtros:</span>
            </div>
            <DateRangePicker
              startDate={dateStart}
              endDate={dateEnd}
              onChange={(start, end) => {
                setDateStart(start);
                setDateEnd(end);
              }}
            />
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
              {([["todos", "Todos"], ["cr", "A Receber"], ["cp", "A Pagar"]] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setTipoFiltro(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tipoFiltro === v ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm">
                  {meses[mesFiltro]} {anoFiltro} — {filtrados.length} lançamentos
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Colunas conforme solicitado pela contabilidade</p>
              </div>
              <div className="flex gap-6 text-right text-xs">
                <div>
                  <p className="text-muted-foreground">Entradas</p>
                  <p className="font-bold text-teal-400">{formatCurrency(totalEntradas)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Saídas</p>
                  <p className="font-bold text-destructive">{formatCurrency(totalSaidas)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Saldo</p>
                  <p className={`font-bold ${totalEntradas - totalSaidas >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(totalEntradas - totalSaidas)}
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Conta Bancária</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Data Pgto</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Nome Cliente / Fornecedor</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtrados.map((l, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{l.contaBancaria}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{l.dataPgto}</td>
                      <td className="px-4 py-3 text-white text-sm max-w-[200px] truncate">{l.descricao}</td>
                      <td className="px-4 py-3 text-white text-sm font-medium whitespace-nowrap">{l.parceiro}</td>
                      <td className={`px-4 py-3 text-right font-bold text-sm ${l.tipo === "cr" ? "text-teal-400" : "text-destructive"}`}>
                        {l.tipo === "cr" ? "+" : "-"}{formatCurrency(l.valor)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{l.categoria}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-white/5 border-t border-white/10">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-bold text-white text-sm">TOTAIS</td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-teal-400 font-bold text-xs">+{formatCurrency(totalEntradas)}</div>
                      <div className="text-destructive font-bold text-xs">-{formatCurrency(totalSaidas)}</div>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "impostos" && (
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Obrigações Fiscais — {meses[mesFiltro]} {anoFiltro}</h3>
            <span className="text-sm font-bold text-destructive">{formatCurrency(totalImpostos)} a recolher</span>
          </div>
          <div className="space-y-3">
            {impostos.map((imp, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <span className="font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg text-sm">{imp.nome}</span>
                  <div>
                    <p className="text-sm text-white">Base: <span className="font-medium">{formatCurrency(imp.base)}</span></p>
                    <p className="text-xs text-muted-foreground">Alíquota: {imp.aliquota}%</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-warning">{formatCurrency(imp.valor)}</p>
                  <p className="text-xs text-muted-foreground">Venc: {imp.vencimento}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}