import { useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { WorkSheet } from "xlsx";
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertCircle,
  Clock,
  Download,
  AlertTriangle,
  Gavel,
  FileX,
  ShieldAlert,
  Ban,
  Loader2,
  FileSpreadsheet,
  FileText,
  ChevronDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { formatCurrency, cn } from "@/lib/utils";
import { fetchApiData } from "@/lib/api-config";

const PIE_COLORS = ["#6366F1", "#F59E0B", "#E74C3C", "#22C55E", "#3B82F6", "#EC4899"];

const RISK_CONFIG: Record<string, { label: string; icon: ReactNode; cls: string }> = {
  "Multas e Juros": { label: "Multas e Juros", icon: <Clock className="w-3 h-3" />, cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  "Perda de Desconto": { label: "Perda de Desconto", icon: <ArrowUpRight className="w-3 h-3" />, cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  "Restrição de Crédito": { label: "Restrição de Crédito", icon: <AlertCircle className="w-3 h-3" />, cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  "Corte de Serviço": { label: "Corte de Serviço", icon: <FileX className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  "Suspensão de Fornecimento": { label: "Suspensão de Fornecimento", icon: <Ban className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  "Negativação": { label: "Negativação", icon: <AlertTriangle className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  "Perda de Benefício Fiscal": { label: "Perda de Benefício Fiscal", icon: <FileX className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  "Protesto": { label: "Protesto", icon: <Gavel className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  "Ação Judicial": { label: "Ação Judicial", icon: <ShieldAlert className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  "Dívida Ativa": { label: "Dívida Ativa", icon: <FileX className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  "Quebra de Contrato": { label: "Quebra de Contrato", icon: <FileX className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  "Bloqueio de Contas (Sisbajud)": { label: "Bloqueio de Contas (Sisbajud)", icon: <Ban className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
  "Penhora de Bens": { label: "Penhora de Bens", icon: <Gavel className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
  "Pedido de Falência": { label: "Pedido de Falência", icon: <ShieldAlert className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
  "Impedimento de Certidão": { label: "Impedimento de Certidão", icon: <FileX className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
};

const RISK_FILTER_KEYS = Object.keys(RISK_CONFIG);

function toCents(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return Math.round(v * 100);
  const str = String(v).replace(",", ".");
  return Math.round(Number(str) * 100);
}

function lucroLiquidoFromProjecao(p: ProjecaoMes | undefined): number {
  if (!p) return 0;
  return (toCents(p.projecaoRecebimentos) - toCents(p.projecaoPagamentos)) / 100;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
        {label && <p className="text-white font-medium mb-2 text-xs">{label}</p>}
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color || entry.fill }} className="text-sm font-medium">
            {entry.name}:{" "}
            {typeof entry.value === "number" && Math.abs(entry.value) > 0.01 ? formatCurrency(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function KPICard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={color}>{icon}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function LoadingPanel({ h = 140 }: { h?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ height: h }}>
      <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
    </div>
  );
}

type KPIs = {
  contasReceberAtraso: number;
  contasReceberAberto: number;
  contasPagarAberto: number;
  contasPagarAtraso: number;
};

type ProjecaoMes = {
  projecaoRecebimentos: number;
  projecaoPagamentos: number;
  projecaoLucroLiquido: number;
  totalRecebimentos?: number;
  totalPagamentos?: number;
};

type ProjecaoDia = { data: string; saldo: number; receber: number; pagar: number };

type ParceiroInadimplente = {
  parceiro_id: number;
  nome: string;
  total: number;
  maior_dias_atraso: number;
  quantidade_titulos: number;
};

type AlertaRisco = { id: number; nome: string; dias_atraso: number; valor: number; riscos: string[] };

type FluxoMes = { mes: string; entradas: number; saidas: number };

type PlanoItem = { categoria: string; valor: number; percentual: number };

export type InadimplenciaTab = "vencidos" | "proximos_vencer";

// ─── Export helpers ───────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Formatos de célula nativos do Excel — mantém o valor como número real
// (permite soma/ordenação/fórmulas na planilha) em vez de texto formatado.
const XLSX_CURRENCY_FMT = '"R$" #,##0.00';
const XLSX_PERCENT_FMT = '0.0"%"';

function applyCellFormat(ws: WorkSheet, col: string, fromRow: number, toRow: number, fmt: string) {
  for (let r = fromRow; r <= toRow; r++) {
    const ref = `${col}${r}`;
    const cell = (ws as any)[ref];
    if (cell) cell.z = fmt;
  }
}

async function exportarXLSX(dashboardData: DashboardExportData) {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // Sheet 1 – KPIs
  if (dashboardData.kpis) {
    const kpiRows: (string | number)[][] = [
      ["Indicador", "Valor"],
      ["A Receber (Mês Atual)", dashboardData.kpis.contasReceberAberto],
      ["A Pagar (Mês Atual)", dashboardData.kpis.contasPagarAberto],
      ["CR Vencidos", dashboardData.kpis.contasReceberAtraso],
      ["CP Vencidos", dashboardData.kpis.contasPagarAtraso],
    ];
    if (dashboardData.projecao) {
      kpiRows.push(
        ["Projeção Recebimentos", dashboardData.projecao.projecaoRecebimentos],
        ["Projeção Pagamentos", dashboardData.projecao.projecaoPagamentos],
        ["Lucro Líquido Projetado", lucroLiquidoFromProjecao(dashboardData.projecao)],
      );
    }
    const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
    applyCellFormat(wsKpi, "B", 2, kpiRows.length, XLSX_CURRENCY_FMT);
    wsKpi["!cols"] = [{ wch: 26 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsKpi, "KPIs");
  }

  // Sheet 2 – Fluxo de Caixa
  if (dashboardData.fluxoCaixa?.length) {
    const rows: (string | number)[][] = [
      ["Mês", "Entradas", "Saídas"],
      ...dashboardData.fluxoCaixa.map((r) => [r.mes, r.entradas, r.saidas]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applyCellFormat(ws, "B", 2, rows.length, XLSX_CURRENCY_FMT);
    applyCellFormat(ws, "C", 2, rows.length, XLSX_CURRENCY_FMT);
    ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Fluxo de Caixa");
  }

  // Sheet 3 – Projeção 30 dias
  if (dashboardData.projecaoDias?.length) {
    const rows: (string | number)[][] = [
      ["Data", "Saldo Acumulado", "A Receber", "A Pagar"],
      ...dashboardData.projecaoDias.map((r) => [r.data, r.saldo, r.receber, r.pagar]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applyCellFormat(ws, "B", 2, rows.length, XLSX_CURRENCY_FMT);
    applyCellFormat(ws, "C", 2, rows.length, XLSX_CURRENCY_FMT);
    applyCellFormat(ws, "D", 2, rows.length, XLSX_CURRENCY_FMT);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Projeção 30 dias");
  }

  // Sheet 4 – Alertas de risco
  if (dashboardData.alertasRisco?.length) {
    const rows: (string | number)[][] = [
      ["Nome / Fornecedor", "Dias em Atraso", "Valor", "Riscos"],
      ...dashboardData.alertasRisco.map((a) => [
        a.nome,
        a.dias_atraso,
        a.valor,
        (a.riscos ?? []).join(", "),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applyCellFormat(ws, "C", 2, rows.length, XLSX_CURRENCY_FMT);
    ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(wb, ws, "Alertas de Risco");
  }

  // Sheet 5 – Receitas por categoria
  if (dashboardData.entradasPlano?.length) {
    const rows: (string | number)[][] = [
      ["Categoria", "Valor", "%"],
      ...dashboardData.entradasPlano.map((r) => [r.categoria, r.valor, r.percentual]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applyCellFormat(ws, "B", 2, rows.length, XLSX_CURRENCY_FMT);
    applyCellFormat(ws, "C", 2, rows.length, XLSX_PERCENT_FMT);
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Receitas por Categoria");
  }

  // Sheet 6 – Despesas por categoria
  if (dashboardData.saidasPlano?.length) {
    const rows: (string | number)[][] = [
      ["Categoria", "Valor", "%"],
      ...dashboardData.saidasPlano.map((r) => [r.categoria, r.valor, r.percentual]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applyCellFormat(ws, "B", 2, rows.length, XLSX_CURRENCY_FMT);
    applyCellFormat(ws, "C", 2, rows.length, XLSX_PERCENT_FMT);
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Despesas por Categoria");
  }

  // Guarda de segurança: nunca tentar salvar um workbook sem nenhuma aba
  // (acontece se a exportação for disparada antes dos dados chegarem).
  if (wb.SheetNames.length === 0) {
    throw new Error("Nenhum dado disponível para exportação ainda. Aguarde o carregamento do dashboard.");
  }

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `dashboard-ISM-${date}.xlsx`);
}

async function exportarPDF(dashboardData: DashboardExportData) {
  const hasAnyData =
    dashboardData.kpis ||
    dashboardData.projecao ||
    dashboardData.fluxoCaixa?.length ||
    dashboardData.alertasRisco?.length ||
    dashboardData.entradasPlano?.length ||
    dashboardData.saidasPlano?.length;

  if (!hasAnyData) {
    throw new Error("Nenhum dado disponível para exportação ainda. Aguarde o carregamento do dashboard.");
  }

  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 14;
  let y = margin;

  const dataHoje = new Date().toLocaleDateString("pt-BR");

  // ── Cabeçalho ──
  doc.setFillColor(18, 20, 23);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ISM Finance · Painel de Controle", margin, 13);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 160);
  doc.text(`Relatório gerado em ${dataHoje}`, margin, 21);
  y = 36;

  function secTitle(title: string) {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(99, 102, 241); // indigo-500
    doc.text(title.toUpperCase(), margin, y);
    y += 1.5;
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.3);
    doc.line(margin, y, W - margin, y);
    y += 5;
    doc.setTextColor(30, 30, 30);
  }

  function row2(label: string, value: string, highlight = false) {
    if (y > 272) { doc.addPage(); y = margin; }
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(highlight ? 79 : 30, highlight ? 70 : 30, highlight ? 229 : 30);
    doc.text(value, W - margin, y, { align: "right" });
    y += 6;
  }

  // ── KPIs ──
  secTitle("Indicadores Financeiros");
  if (dashboardData.kpis) {
    row2("A Receber (Mês Atual)", fmtBRL(dashboardData.kpis.contasReceberAberto));
    row2("A Pagar (Mês Atual)", fmtBRL(dashboardData.kpis.contasPagarAberto));
    row2("CR Vencidos (A Receber)", fmtBRL(dashboardData.kpis.contasReceberAtraso));
    row2("CP Vencidos (A Pagar)", fmtBRL(dashboardData.kpis.contasPagarAtraso));
  }
  if (dashboardData.projecao) {
    y += 2;
    row2("Projeção Recebimentos", fmtBRL(dashboardData.projecao.projecaoRecebimentos));
    row2("Projeção Pagamentos", fmtBRL(dashboardData.projecao.projecaoPagamentos));
    row2("Lucro Líquido Projetado", fmtBRL(lucroLiquidoFromProjecao(dashboardData.projecao)), true);
  }
  y += 4;

  // ── Fluxo de Caixa ──
  if (dashboardData.fluxoCaixa?.length) {
    secTitle(`Fluxo de Caixa — ${new Date().getFullYear()}`);
    const colW = (W - margin * 2) / 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Mês", margin, y);
    doc.text("Entradas", margin + colW, y);
    doc.text("Saídas", margin + colW * 2, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    for (const r of dashboardData.fluxoCaixa) {
      if (y > 272) { doc.addPage(); y = margin; }
      doc.setTextColor(40, 40, 40);
      doc.text(r.mes, margin, y);
      doc.setTextColor(39, 174, 96);
      doc.text(fmtBRL(r.entradas), margin + colW, y);
      doc.setTextColor(231, 76, 60);
      doc.text(fmtBRL(r.saidas), margin + colW * 2, y);
      y += 5.5;
    }
    y += 3;
  }

  // ── Alertas de Risco ──
  if (dashboardData.alertasRisco?.length) {
    secTitle("Alertas de Inadimplência (CP)");
    for (const a of dashboardData.alertasRisco.slice(0, 20)) {
      if (y > 272) { doc.addPage(); y = margin; }
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(a.nome || "—", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(231, 76, 60);
      doc.text(fmtBRL(a.valor), W - margin, y, { align: "right" });
      y += 4.5;
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      const riscosTxt = (a.riscos ?? []).join(" · ");
      if (riscosTxt) {
        doc.text(`${a.dias_atraso}d de atraso  ·  ${riscosTxt}`, margin, y);
        y += 5;
      }
    }
    y += 2;
  }

  // ── Receitas & Despesas por categoria ──
  const planoPairs: Array<[string, PlanoItem[], string]> = [
    ["Receitas por Categoria", dashboardData.entradasPlano ?? [], "#27AE60"],
    ["Despesas por Categoria", dashboardData.saidasPlano ?? [], "#E74C3C"],
  ];
  for (const [title, items, hexColor] of planoPairs) {
    if (!items.length) continue;
    secTitle(title);
    for (const item of items) {
      if (y > 272) { doc.addPage(); y = margin; }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(`${item.categoria}`, margin, y);
      const [r, g, b] = hexToRgb(hexColor);
      doc.setTextColor(r, g, b);
      doc.text(`${fmtBRL(item.valor)} (${item.percentual}%)`, W - margin, y, { align: "right" });
      y += 5.5;
    }
    y += 3;
  }

  // ── Rodapé última página ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`ISM Finance · ${dataHoje} · Pág. ${i}/${pageCount}`, W / 2, 292, { align: "center" });
  }

  doc.save(`dashboard-ISM-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

type DashboardExportData = {
  kpis?: KPIs;
  projecao?: ProjecaoMes;
  projecaoDias?: ProjecaoDia[];
  fluxoCaixa?: FluxoMes[];
  alertasRisco?: AlertaRisco[];
  entradasPlano?: PlanoItem[];
  saidasPlano?: PlanoItem[];
};

// ─── Export Dropdown ──────────────────────────────────────────────────────────

function ExportDropdown({
  getData,
  isLoading,
}: {
  getData: () => DashboardExportData;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleExport(type: "xlsx" | "pdf") {
    setOpen(false);

    if (isLoading) {
      toast.error("Aguarde o carregamento completo do dashboard antes de exportar.");
      return;
    }

    setExporting(type);
    try {
      const data = getData();
      if (type === "xlsx") await exportarXLSX(data);
      else await exportarPDF(data);
      toast.success(type === "xlsx" ? "Planilha XLSX gerada com sucesso." : "Relatório PDF gerado com sucesso.");
    } catch (err) {
      console.error("Erro ao exportar dashboard:", err);
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o relatório. Tente novamente.");
    } finally {
      setExporting(null);
    }
  }

  const disabled = exporting !== null || isLoading;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={isLoading ? "Aguardando o carregamento dos dados do dashboard" : undefined}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-60">
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {exporting === "xlsx"
          ? "Gerando XLSX…"
          : exporting === "pdf"
            ? "Gerando PDF…"
            : isLoading
              ? "Carregando dados…"
              : "Exportar Relatório"}
        {!exporting && !isLoading && <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />}
      </button>

      {open && !disabled && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-[#121417] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Formato</p>
          </div>
          <button
            type="button"
            onClick={() => handleExport("xlsx")}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Planilha XLSX</p>
              <p className="text-[10px] text-muted-foreground">Excel · múltiplas abas</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-t border-white/5">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Documento PDF</p>
              <p className="text-[10px] text-muted-foreground">Relatório formatado A4</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ContasPanel ──────────────────────────────────────────────────────────────

function ContasPanel({
  tipo,
  title,
  color,
  tab,
}: {
  tipo: "CP" | "CR";
  title: string;
  color: "teal" | "orange";
  tab: InadimplenciaTab;
}) {
  const path =
    tipo === "CR"
      ? `/dashboard/inadimplencia-clientes?tab=${tab}&limit=20`
      : `/dashboard/inadimplencia-fornecedores?tab=${tab}&limit=20`;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["dashboard-inadimplencia", tipo, tab],
    queryFn: () => fetchApiData<ParceiroInadimplente[]>(path),
  });

  const colorMap = {
    teal: {
      dot: "bg-teal-400",
      badge: "bg-teal-500/20 text-teal-300",
      header: "bg-teal-500/5",
      val: "text-teal-300",
      icoCls: <ArrowDownRight className="w-4 h-4 text-teal-400" />,
    },
    orange: {
      dot: "bg-orange-400",
      badge: "bg-orange-500/20 text-orange-300",
      header: "bg-orange-500/5",
      val: "text-orange-300",
      icoCls: <ArrowUpRight className="w-4 h-4 text-orange-400" />,
    },
  }[color];

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
      <div className={`p-3 border-b border-white/5 flex items-center gap-2 ${colorMap.header}`}>
        {colorMap.icoCls}
        <h3 className="font-bold text-white text-sm">{title}</h3>
        <span className={`ml-auto text-xs ${colorMap.badge} px-2 py-0.5 rounded-full font-bold`}>
          {isLoading ? "…" : items.length}
        </span>
      </div>
      <div className="divide-y divide-white/5 flex-1 overflow-y-auto max-h-72">
        {isLoading ? (
          <LoadingPanel />
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-8">Nenhum registro encontrado</p>
        ) : (
          items.slice(0, 8).map((c, i) => (
            <div key={`${c.parceiro_id}-${i}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
              <div className={`w-1.5 h-1.5 ${colorMap.dot} rounded-full shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{c.nome}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.maior_dias_atraso > 0 ? `${c.maior_dias_atraso}d de atraso máx · ` : ""}
                  {c.quantidade_titulos} título(s)
                </p>
              </div>
              <p className={`text-sm font-bold ${colorMap.val} shrink-0`}>
                {tipo === "CP" ? "- " : ""}
                {formatCurrency(c.total)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [anoFluxo] = useState(new Date().getFullYear());
  const [tabInadimplencia, setTabInadimplencia] = useState<InadimplenciaTab>("vencidos");
  const [filtroRisco, setFiltroRisco] = useState<string>("");

  const alertasPath = useMemo(() => {
    const base = "/dashboard/alertas-atraso?limit=100";
    if (!filtroRisco) return base;
    return `${base}&risco=${encodeURIComponent(filtroRisco)}`;
  }, [filtroRisco]);

  const { data: kpis, isLoading: kpisLoading, isError: kpisError } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: () => fetchApiData<KPIs>("/dashboard/kpis"),
    refetchInterval: 60000,
  });

  const { data: projecao } = useQuery({
    queryKey: ["dashboard-projecao-mes"],
    queryFn: () => fetchApiData<ProjecaoMes>("/dashboard/projecao-mes"),
  });

  const { data: projecaoDias = [], isLoading: projDiasLoading } = useQuery({
    queryKey: ["dashboard-projecao-dias", 30],
    queryFn: () => fetchApiData<ProjecaoDia[]>("/dashboard/projecao-dias?dias=30"),
  });

  const { data: fluxoCaixa = [], isLoading: fluxoLoading } = useQuery({
    queryKey: ["dashboard-fluxo", anoFluxo],
    queryFn: () => fetchApiData<FluxoMes[]>(`/dashboard/fluxo-caixa-mensal?ano=${anoFluxo}`),
  });

  const { data: alertasRisco = [], isLoading: alertasLoading } = useQuery({
    queryKey: ["dashboard-alertas-atraso", filtroRisco || "all"],
    queryFn: () => fetchApiData<AlertaRisco[]>(alertasPath),
  });

  const { data: saidasPlano = [] } = useQuery({
    queryKey: ["dashboard-saidas-plano"],
    queryFn: () => fetchApiData<PlanoItem[]>("/dashboard/saidas-plano-contas"),
  });

  const { data: entradasPlano = [] } = useQuery({
    queryKey: ["dashboard-entradas-plano"],
    queryFn: () => fetchApiData<PlanoItem[]>("/dashboard/entradas-plano-contas"),
  });

  const lucroLiquidoFmt = useMemo(() => formatCurrency(lucroLiquidoFromProjecao(projecao)), [projecao]);

  // Considerado "carregando" para fins de exportação enquanto os blocos
  // principais do relatório (KPIs, fluxo de caixa, alertas) ainda não chegaram.
  const exportIsLoading = kpisLoading || fluxoLoading || alertasLoading;

  // Snapshot de todos os dados em memória para exportação
  const getExportData = (): DashboardExportData => ({
    kpis,
    projecao,
    projecaoDias,
    fluxoCaixa,
    alertasRisco,
    entradasPlano,
    saidasPlano,
  });

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Painel de Controle"
        description="Visão geral financeira e indicadores da ISM Tecnologia"
        actions={<ExportDropdown getData={getExportData} isLoading={exportIsLoading} />}
      />

      {kpisError && (
        <div className="glass-panel rounded-xl border border-destructive/30 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Não foi possível carregar os KPIs. Verifique a sessão ou tente mais tarde.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpisLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-2xl p-5 animate-pulse">
              <div className="h-3 bg-white/10 rounded mb-3 w-3/4" />
              <div className="h-6 bg-white/10 rounded w-1/2" />
            </div>
          ))
        ) : (
          <>
            <KPICard
              label="A Receber (Mês Atual)"
              value={formatCurrency(kpis?.contasReceberAberto ?? 0)}
              icon={<ArrowDownRight className="w-5 h-5" />}
              color="text-teal-400"
              sub={projecao ? `Projeção: ${formatCurrency(projecao.projecaoRecebimentos)}` : undefined}
            />
            <KPICard
              label="A Pagar (Mês Atual)"
              value={formatCurrency(kpis?.contasPagarAberto ?? 0)}
              icon={<ArrowUpRight className="w-5 h-5" />}
              color="text-orange-400"
              sub={projecao ? `Projeção: ${formatCurrency(projecao.projecaoPagamentos)}` : undefined}
            />
            <KPICard
              label="CR Vencidos (A Receber)"
              value={formatCurrency(kpis?.contasReceberAtraso ?? 0)}
              icon={<AlertCircle className="w-5 h-5" />}
              color="text-destructive"
            />
            <KPICard
              label="CP Vencidos (A Pagar)"
              value={formatCurrency(kpis?.contasPagarAtraso ?? 0)}
              icon={<Clock className="w-5 h-5" />}
              color="text-warning"
              sub={projecao ? `Saldo líquido (projeção mês): ${lucroLiquidoFmt}` : undefined}
            />
          </>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <h3 className="font-bold text-white text-sm mb-5">Projeção de saldo — próximos 30 dias</h3>
        {projDiasLoading ? (
          <LoadingPanel h={220} />
        ) : projecaoDias.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-12">Sem dados de projeção diária.</p>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projecaoDias} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3BA8DC" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3BA8DC" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis
                  dataKey="data"
                  stroke="#ffffff50"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(d: string) => (typeof d === "string" ? d.slice(5) : d)}
                />
                <YAxis
                  stroke="#ffffff50"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                  }
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Line type="monotone" dataKey="saldo" name="Saldo acumulado" stroke="#3BA8DC" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="receber" name="A receber (dia)" stroke="#27AE60" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="pagar" name="A pagar (dia)" stroke="#E74C3C" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Inadimplência e janela de vencimentos</p>
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setTabInadimplencia("vencidos")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                tabInadimplencia === "vencidos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-white",
              )}>
              Vencidos
            </button>
            <button
              type="button"
              onClick={() => setTabInadimplencia("proximos_vencer")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                tabInadimplencia === "proximos_vencer"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-white",
              )}>
              Próximos a vencer
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ContasPanel tipo="CR" title="Contas a Receber (Por Parceiro)" color="teal" tab={tabInadimplencia} />
          <ContasPanel tipo="CP" title="Contas a Pagar (Por Fornecedor)" color="orange" tab={tabInadimplencia} />
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-destructive/20 shadow-xl shadow-destructive/5">
        <div className="p-4 border-b border-white/5 bg-destructive/10 flex items-center gap-2 flex-wrap">
          <div className="p-1.5 bg-destructive/20 border border-destructive/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <h3 className="font-bold text-white text-sm">Alertas de Inadimplência e Risco (Contas a Pagar)</h3>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <select
              value={filtroRisco}
              onChange={(e) => setFiltroRisco(e.target.value)}
              className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-primary/50 max-w-[220px]">
              <option value="">Sem filtro</option>
              {RISK_FILTER_KEYS.map((k) => (
                <option key={k} value={k}>
                  {RISK_CONFIG[k]?.label ?? k}
                </option>
              ))}
            </select>
            <span className="text-[10px] bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              {alertasLoading ? "…" : `${alertasRisco.length} ocorrências`}
            </span>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {alertasLoading ? (
            <LoadingPanel h={160} />
          ) : alertasRisco.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-40">
              <ShieldAlert className="w-12 h-12" />
              <p className="text-center text-sm font-medium">Nenhum alerta para o filtro atual</p>
            </div>
          ) : (
            alertasRisco.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.04] transition-all group border-l-2 border-transparent hover:border-l-destructive">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-lg bg-destructive shadow-destructive/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{a.nome || "Não identificado"}</p>
                  <p className="text-xs text-secondary-foreground/60 mt-0.5">
                    Contas a Pagar · {Math.max(0, a.dias_atraso || 0)} dias em atraso
                  </p>
                </div>
                <div className="hidden md:flex flex-wrap gap-2 justify-end max-w-[40%]">
                  {a.riscos?.map((r) => {
                    const cfg = RISK_CONFIG[r] ?? {
                      label: r,
                      icon: <Ban className="w-3 h-3" />,
                      cls: "bg-white/10 text-white border-white/20",
                    };
                    return (
                      <span
                        key={r}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-bold border flex items-center gap-1.5 ${cfg.cls} shadow-sm`}>
                        {cfg.icon}
                        <span className="uppercase tracking-tighter">{cfg.label}</span>
                      </span>
                    );
                  })}
                </div>
                <p className="text-sm font-black shrink-0 ml-4 text-orange-400 font-mono">{formatCurrency(a.valor)}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <h3 className="font-bold text-white text-sm mb-5">Fluxo de Caixa — {anoFluxo}</h3>
        {fluxoLoading ? (
          <LoadingPanel h={260} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fluxoCaixa} margin={{ top: 10, right: 0, left: 0, bottom: 0 }} barSize={16} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="mes" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#ffffff50"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      v >= 1000000 ? `R$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                    }
                  />
                  <RechartsTooltip cursor={{ fill: "#ffffff05" }} content={<CustomTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="entradas" name="Recebimentos" fill="#27AE60" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saidas" name="Pagamentos" fill="#E74C3C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-[260px] flex flex-col">
              <p className="text-xs text-center text-muted-foreground mb-2">Saídas por Categoria</p>
              <div className="flex-1">
                {saidasPlano.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-xs">Sem dados</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={saidasPlano}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="valor"
                        nameKey="categoria"
                        stroke="none">
                        {saidasPlano.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend
                        layout="vertical"
                        verticalAlign="middle"
                        align="right"
                        wrapperStyle={{ fontSize: "10px", color: "#fff" }}
                        formatter={(v: string) => (v.length > 15 ? `${v.slice(0, 15)}…` : v)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {(entradasPlano.length > 0 || saidasPlano.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="font-bold text-white text-sm mb-4">Receitas por Categoria</h3>
            <div className="space-y-2">
              {entradasPlano.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-xs text-white/70 flex-1 truncate">{item.categoria}</span>
                  <span className="text-xs font-bold text-teal-300">{formatCurrency(item.valor)}</span>
                  <span className="text-xs text-muted-foreground w-8 text-right">{item.percentual}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="font-bold text-white text-sm mb-4">Despesas por Categoria</h3>
            <div className="space-y-2">
              {saidasPlano.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-xs text-white/70 flex-1 truncate">{item.categoria}</span>
                  <span className="text-xs font-bold text-orange-300">- {formatCurrency(item.valor)}</span>
                  <span className="text-xs text-muted-foreground w-8 text-right">{item.percentual}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}