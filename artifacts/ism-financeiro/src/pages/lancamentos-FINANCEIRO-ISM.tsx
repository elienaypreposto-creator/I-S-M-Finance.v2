import { useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Filter, Download, Loader2, AlertCircle, Calendar, Pencil, Trash2 } from "lucide-react";
import { ApiEnvelope, fetchApi, fetchApiData } from "@/lib/api-config";
import { LancamentoModal } from "@/components/lancamentos/lancamento-modal";
import { exportToExcel, fmtBRL, fmtDate as fmtDateExport } from "@/lib/export";

type Lancamento = {
  id: number;
  tipo: string;
  vencimento: string;
  competencia: string | null;
  conta_id: number | null;
  conta_nome: string | null;
  parceiro_id: number | null;
  parceiro_nome: string | null;
  descricao: string | null;
  valor: string | number;
  status: string;
  plano_conta_id: number | null;
  plano_conta_nome: string | null;
  riscos?: string[];
};

type LancamentosListResult = { items: Lancamento[]; total: number };

const BANK_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
  "itaú": { abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)" },
  "itau": { abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)" },
  "bradesco": { abbr: "BRA", color: "#CC0000", bg: "rgba(204,0,0,0.15)" },
  "santander": { abbr: "SAN", color: "#E50001", bg: "rgba(229,0,1,0.15)" },
  "banco do brasil": { abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)" },
  "bb rende": { abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)" },
  "caixa economica": { abbr: "CEF", color: "#1E78C8", bg: "rgba(30,120,200,0.18)" },
  "nubank": { abbr: "NU", color: "#820AD1", bg: "rgba(130,10,209,0.18)" },
  "inter": { abbr: "INT", color: "#FF6600", bg: "rgba(255,102,0,0.15)" },
  "sicoob": { abbr: "SCB", color: "#00703C", bg: "rgba(0,112,60,0.15)" },
  "sicredi": { abbr: "SIC", color: "#009D4F", bg: "rgba(0,157,79,0.15)" },
  "banpará": { abbr: "BNP", color: "#0055A6", bg: "rgba(0,85,166,0.15)" },
  "brb": { abbr: "BRB", color: "#1A6B3A", bg: "rgba(26,107,58,0.18)" },
  "c6": { abbr: "C6", color: "#272D3B", bg: "rgba(120,125,135,0.3)" },
  "mercado pago": { abbr: "MP", color: "#00BCFF", bg: "rgba(0,188,255,0.15)" },
  "pagseguro": { abbr: "PAG", color: "#009B3A", bg: "rgba(0,155,58,0.15)" },
  "stone": { abbr: "STN", color: "#00A868", bg: "rgba(0,168,104,0.15)" },
  "conta empréstimo": { abbr: "EMPR", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  "conta aplicação": { abbr: "APLI", color: "#6366F1", bg: "rgba(99,102,241,0.15)" },
  "a identificar": { abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  "--": { abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
};

function getBankBadge(contaNome: string | null) {
  if (!contaNome) return BANK_MAP["a identificar"];
  const lower = contaNome.toLowerCase();
  for (const [key, val] of Object.entries(BANK_MAP)) {
    if (lower.includes(key)) return val;
  }
  const firstWord = contaNome.trim().split(" ")[0].toUpperCase().slice(0, 3);
  return { abbr: firstWord, color: "#94A3B8", bg: "rgba(148,163,184,0.15)" };
}

export default function Lancamentos() {
  const [activeTab, setActiveTab] = useState("todos");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Lancamento | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const limit = 25;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout((window as any)._searchTimeout);
    (window as any)._searchTimeout = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 400);
  };

  const tipo = activeTab === "cr" ? "CR" : activeTab === "cp" ? "CP" : undefined;

  const { data, isLoading, isError } = useQuery<LancamentosListResult>({
    queryKey: ["lancamentos", tipo, debouncedSearch, page, dateStart, dateEnd],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (dateStart) params.set("data_inicio", dateStart);
      if (dateEnd) params.set("data_fim", dateEnd);
      params.set("page", String(page));
      params.set("limit", String(limit));
      const envelope = await fetchApi<ApiEnvelope<Lancamento[]>>(`/lancamentos?${params}`);
      const meta = envelope.meta as { total?: number } | null;
      return { items: envelope.data, total: meta?.total ?? 0 };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchApiData<{ deleted: boolean }>(`/lancamentos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({ title: "Excluído", description: "Lançamento removido com sucesso." });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Não foi possível excluir.";
      toast({ variant: "destructive", title: "Erro", description: msg });
    },
  });

  const lancamentos = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // ── Exportação ──────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  const EXPORT_COLUMNS_LANC = [
    { header: "Tipo",       key: "tipo",           width: 8  },
    { header: "Vencimento", key: "vencimento",     width: 14, formatter: (v: unknown) => fmtDateExport(v) },
    { header: "Parceiro",   key: "parceiro_nome",  width: 32 },
    { header: "Descrição",  key: "descricao",      width: 38 },
    { header: "Categoria",  key: "plano_conta_nome", width: 28 },
    { header: "Conta",      key: "conta_nome",     width: 24 },
    { header: "Valor (R$)", key: "valor_fmt",      width: 18 },
    { header: "Status",     key: "status",         width: 14 },
  ];

  async function handleExportLancamentos() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (dateStart) params.set("data_inicio", dateStart);
      if (dateEnd) params.set("data_fim", dateEnd);
      params.set("page", "1");
      params.set("limit", "5000");
      const envelope = await fetchApi<ApiEnvelope<Lancamento[]>>(`/lancamentos?${params}`);
      const rows = envelope.data.map((l) => ({
        ...l,
        valor_fmt: fmtBRL(Number(l.valor)),
      })) as Record<string, unknown>[];
      const suffix = activeTab !== "todos" ? `_${activeTab.toUpperCase()}` : "";
      exportToExcel(`Lancamentos${suffix}_${new Date().toISOString().split("T")[0]}`, rows, EXPORT_COLUMNS_LANC);
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível exportar os lançamentos." });
    } finally {
      setIsExporting(false);
    }
  }

  const TABS = [
    { key: "todos", label: "Todos" },
    { key: "cr", label: "C.R" },
    { key: "cp", label: "C.P" },
  ];

  return (
    <div className="flex flex-col gap-2 h-full">
      {(modalOpen || editItem) && (
        <LancamentoModal
          onClose={() => {
            setModalOpen(false);
            setEditItem(null);
          }}
          onSaved={() => {
            setModalOpen(false);
            setEditItem(null);
          }}
          editItem={editItem}
        />
      )}

      {/* Header compacto */}
      <div className="flex items-center justify-between px-1 py-1">
        <div>
          <h1 className="text-base font-bold text-white leading-tight">Lançamentos Financeiros</h1>
          <p className="text-xs text-muted-foreground">Gerencie suas contas a pagar e a receber</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportLancamentos}
            disabled={isExporting || total === 0}
            title="Exportar XLSX"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {isExporting ? "Exportando…" : "Exportar XLSX"}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-all shadow-md shadow-primary/30">
            <Plus className="w-3.5 h-3.5" />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* Painel principal */}
      <div className="glass-panel rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
          <div className="flex items-center gap-4">
            <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/5">
                {TABS.map(({ key, label }) => (
                <button key={key}
                    onClick={() => { setActiveTab(key); setPage(1); }}
                    className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${
                    activeTab === key
                        ? key === "cr" ? "bg-teal-500/20 text-teal-300 shadow-sm"
                        : key === "cp" ? "bg-orange-500/20 text-orange-300 shadow-sm"
                        : "bg-white/10 text-white shadow-sm"
                        : "text-muted-foreground hover:text-white"
                    }`}>
                    {label}
                </button>
                ))}
            </div>

            <div className="flex items-center gap-2">
              <DateRangePicker 
                startDate={dateStart} 
                endDate={dateEnd} 
                onChange={(start: string, end: string) => {
                  setDateStart(start);
                  setDateEnd(end);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/20 border border-white/5 focus-within:border-primary/50 transition-all">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por descrição..."
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                className="bg-transparent border-none outline-none text-xs w-52 placeholder:text-muted-foreground text-white"
              />
            </div>
            <button className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-muted-foreground hover:text-white">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-black/20 text-muted-foreground border-b border-white/5">
              <tr>
                <th className="px-3 py-3 font-semibold w-14 text-center">Tipo</th>
                <th className="px-3 py-3 font-semibold">Vencimento</th>
                <th className="px-3 py-3 font-semibold">Banco</th>
                <th className="px-3 py-3 font-semibold">Parceiro</th>
                <th className="px-3 py-3 font-semibold">Descrição</th>
                <th className="px-3 py-3 font-semibold">Categoria</th>
                <th className="px-3 py-3 font-semibold text-right">R$ Valor</th>
                <th className="px-3 py-3 font-semibold text-center">Status</th>
                <th className="px-3 py-3 font-semibold text-right w-16">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={9} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                    <span className="text-xs">Carregando...</span>
                  </div>
                </td></tr>
              ) : isError ? (
                <tr><td colSpan={9} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <AlertCircle className="w-7 h-7" />
                    <span className="text-xs">Erro ao carregar dados. Verifique se o servidor está ativo.</span>
                  </div>
                </td></tr>
              ) : lancamentos.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-muted-foreground text-xs">
                  Nenhum lançamento encontrado.
                </td></tr>
              ) : lancamentos.map((l) => {
                const bank = getBankBadge(l.conta_nome);
                const isCR = l.tipo === "CR";
                return (
                  <tr key={l.id} className="hover:bg-white/[0.04] transition-colors group">
                    {/* Tipo CP/CR badge */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded ${
                        isCR ? "bg-teal-500/15 text-teal-300 border border-teal-500/25"
                              : "bg-orange-500/15 text-orange-300 border border-orange-500/25"
                      }`}>
                        {l.tipo}
                      </span>
                    </td>

                    {/* Vencimento */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-white/80 font-medium">
                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                        {formatDate(l.vencimento)}
                      </div>
                    </td>

                    {/* Banco — ícone/badge */}
                    <td className="px-3 py-2.5">
                      <span
                        title={l.conta_nome || "A identificar"}
                        className="inline-flex items-center justify-center w-9 h-6 rounded text-[10px] font-black leading-none cursor-default"
                        style={{ color: bank.color, background: bank.bg, border: `1px solid ${bank.color}40` }}>
                        {bank.abbr}
                      </span>
                    </td>

                    {/* Parceiro */}
                    <td className="px-3 py-2.5 font-medium text-white max-w-[160px] truncate" title={l.parceiro_nome || ""}>
                      {l.parceiro_nome || <span className="text-white/30 italic">—</span>}
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-2.5 text-white/60 max-w-[200px] truncate" title={l.descricao || ""}>
                      {l.descricao || "—"}
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-2.5 max-w-[140px] truncate">
                      {l.plano_conta_nome
                        ? <span className="text-[10px] bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-white/70">{l.plano_conta_nome}</span>
                        : <span className="text-white/25 italic text-[10px]">Sem cat.</span>}
                    </td>

                    {/* Valor - sem $ na frente */}
                    <td className={`px-3 py-2.5 text-right font-bold ${isCR ? "text-teal-300" : "text-white/90"}`}>
                      {isCR ? "" : "- "}
                      {formatCurrency(Number(l.valor)).replace("R$", "").trim()}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>

                    {/* Ações - sempre visível */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditItem(l)}
                          className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors"
                          title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Deseja excluir este lançamento?")) deleteMutation.mutate(l.id);
                          }}
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                          title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground bg-black/10">
          <span>
            {isLoading ? "..." : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total.toLocaleString("pt-BR")} registros`}
          </span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2.5 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
              ‹ Anterior
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, page - 2);
              const pageNum = start + i;
              if (pageNum > totalPages) return null;
              return (
                <button key={pageNum} onClick={() => setPage(pageNum)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${pageNum === page ? "bg-primary text-white" : "hover:bg-white/5"}`}>
                  {pageNum}
                </button>
              );
            })}
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-2.5 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
              Próxima ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
