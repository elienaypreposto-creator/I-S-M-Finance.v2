import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  Download,
  FileText,
  Filter,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchApiData } from "@/lib/api-config";
import { exportToExcel, exportToPDF, fmtBRL, fmtDate } from "@/lib/export";

// ─── Constantes ────────────────────────────────────────────────────────────────
const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 2 - i);
const PAGE_SIZE = 20;

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type ContabilItem = {
  conta_bancaria: string | null;
  data_pgto: string | null;
  descricao: string | null;
  nome_parceiro: string | null;
  /** valor vem como number (já convertido pelo backend via toNumber) */
  valor: number;
  categoria: string;
  tipo: string; // "CR" | "CP"
};

type TipoFiltro = "ambos" | "CR" | "CP";

// Aritmética inteira para evitar ponto flutuante ao agregar valores
function toCents(v: number): number {
  return Math.round(v * 100);
}

// Último dia do mês (espelha a lógica do backend)
function lastDayOfMonth(ano: number, mes: number): string {
  return new Date(ano, mes, 0).toISOString().split("T")[0];
}

// ─── Página ────────────────────────────────────────────────────────────────────
export default function ContabilFiscal() {
  const [tab, setTab] = useState<"livro" | "impostos">("livro");
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth() + 1);
  const [anoFiltro, setAnoFiltro] = useState(CURRENT_YEAR);
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("ambos");
  const [pagina, setPagina] = useState(1);

  const dataInicio = `${anoFiltro}-${String(mesFiltro).padStart(2, "0")}-01`;
  const dataFim = lastDayOfMonth(anoFiltro, mesFiltro);

  const params = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
  if (tipoFiltro !== "ambos") params.set("tipo", tipoFiltro);

  const { data: todos = [], isLoading, isError } = useQuery<ContabilItem[]>({
    queryKey: ["contabil-fiscal", dataInicio, dataFim, tipoFiltro],
    queryFn: () =>
      fetchApiData<ContabilItem[]>(`/relatorios/contabil-fiscal?${params.toString()}`),
  });

  // ── Totais via toCents para precisão ────────────────────────────────────────
  const { totalEntradas, totalSaidas } = useMemo(() => {
    let e = 0;
    let s = 0;
    for (const l of todos) {
      if (l.tipo === "CR") e += toCents(l.valor);
      else s += toCents(l.valor);
    }
    return { totalEntradas: e, totalSaidas: s };
  }, [todos]);

  // ── Paginação ────────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(todos.length / PAGE_SIZE));
  // Clamp: garante que a página atual não ultrapasse o total após mudança de filtro
  const paginaAtual = Math.min(pagina, totalPages);
  const paginados = todos.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);

  // Ao mudar filtro, volta para página 1
  const handleMes = (v: number) => { setMesFiltro(v); setPagina(1); };
  const handleAno = (v: number) => { setAnoFiltro(v); setPagina(1); };
  const handleTipo = (v: TipoFiltro) => { setTipoFiltro(v); setPagina(1); };

  // ── Exportação ──────────────────────────────────────────────────────────────
  const EXPORT_COLUMNS = [
    { header: "Data Pgto",    key: "data_pgto",      width: 14, formatter: (v: unknown) => fmtDate(v) },
    { header: "Tipo",         key: "tipo",           width: 8,  formatter: (v: unknown) => v === "CR" ? "Entrada" : "Saída" },
    { header: "Descrição",    key: "descricao",      width: 36 },
    { header: "Parceiro",     key: "nome_parceiro",  width: 30 },
    { header: "Categoria",    key: "categoria",      width: 28 },
    { header: "Conta",        key: "conta_bancaria", width: 24 },
    { header: "Valor (R$)",   key: "valor",          width: 18, formatter: (v: unknown) => fmtBRL(v) },
  ] as const;

  const exportFilename = `Contabil_Fiscal_${MESES_LONGOS[mesFiltro - 1]}_${anoFiltro}`;
  const exportTitle    = `Relatório Contábil / Fiscal — ${MESES_LONGOS[mesFiltro - 1]} ${anoFiltro}`;
  const exportSubtitle = `Filtro: ${tipoFiltro === "ambos" ? "Entradas e Saídas" : tipoFiltro === "CR" ? "Entradas (CR)" : "Saídas (CP)"}  |  ${todos.length} registos`;

  const exportData = todos as unknown as Record<string, unknown>[];

  function handleExportExcel() {
    exportToExcel(exportFilename, exportData, [...EXPORT_COLUMNS]);
  }

  function handleExportPDF() {
    exportToPDF(exportFilename, exportData, [...EXPORT_COLUMNS], {
      title: exportTitle,
      subtitle: exportSubtitle,
      orientation: "landscape",
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório Contábil / Fiscal"
        description="Transações quitadas — exportável para contabilidade"
        actions={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={todos.length === 0 || isLoading}
              title="Exportar PDF"
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" /> Exportar PDF
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={todos.length === 0 || isLoading}
              title="Exportar XLSX"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        {(["livro", "impostos"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
            }`}
          >
            {t === "livro" ? "Extrato Contábil" : "Obrigações Fiscais"}
          </button>
        ))}
      </div>

      {/* ── Tab: Extrato ── */}
      {tab === "livro" && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Filtros:</span>
            </div>
            <select
              value={mesFiltro}
              onChange={(e) => handleMes(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none cursor-pointer"
            >
              {MESES_LONGOS.map((m, i) => (
                <option key={i} value={i + 1} className="bg-card text-white">
                  {m}
                </option>
              ))}
            </select>
            <select
              value={anoFiltro}
              onChange={(e) => handleAno(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none cursor-pointer"
            >
              {YEARS.map((y) => (
                <option key={y} value={y} className="bg-card text-white">
                  {y}
                </option>
              ))}
            </select>
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
              {(["ambos", "CR", "CP"] as TipoFiltro[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleTipo(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    tipoFiltro === v
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {v === "ambos" ? "Todos" : v === "CR" ? "A Receber" : "A Pagar"}
                </button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center h-40 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Carregando lançamentos…</span>
            </div>
          )}

          {/* Erro */}
          {isError && !isLoading && (
            <div className="glass-panel rounded-2xl p-5 border border-destructive/20 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">
                Erro ao carregar dados. Tente novamente.
              </p>
            </div>
          )}

          {/* Tabela */}
          {!isLoading && !isError && (
            <div className="glass-panel rounded-2xl overflow-hidden">
              {/* Cabeçalho com resumo */}
              <div className="p-4 border-b border-white/5 flex flex-wrap items-center gap-4 justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {MESES_LONGOS[mesFiltro - 1]} {anoFiltro} —{" "}
                    {todos.length} lançamento{todos.length !== 1 ? "s" : ""} quitado
                    {todos.length !== 1 ? "s" : ""}
                  </h3>
                  {totalPages > 1 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Página {paginaAtual}/{totalPages} · Exibindo{" "}
                      {(paginaAtual - 1) * PAGE_SIZE + 1}–
                      {Math.min(paginaAtual * PAGE_SIZE, todos.length)} de {todos.length}
                    </p>
                  )}
                </div>
                <div className="flex gap-6 text-right text-xs">
                  <div>
                    <p className="text-muted-foreground">Entradas</p>
                    <p className="font-bold text-teal-400">
                      {formatCurrency(totalEntradas / 100)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saídas</p>
                    <p className="font-bold text-destructive">
                      {formatCurrency(totalSaidas / 100)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saldo</p>
                    <p
                      className={`font-bold ${
                        totalEntradas - totalSaidas >= 0
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {formatCurrency((totalEntradas - totalSaidas) / 100)}
                    </p>
                  </div>
                </div>
              </div>

              {todos.length === 0 ? (
                <div className="py-14 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">
                    Nenhum lançamento quitado em{" "}
                    {MESES_LONGOS[mesFiltro - 1]} {anoFiltro}.
                  </p>
                  <p className="text-xs mt-1 opacity-70">
                    O filtro considera apenas lançamentos com status "pago" ou "recebido".
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">
                            Conta Bancária
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">
                            Data Pgto
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs">
                            Descrição
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap text-xs">
                            Parceiro
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground text-xs">
                            Valor
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs">
                            Categoria
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {paginados.map((l, i) => (
                          <tr key={i} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {l.conta_bancaria ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                              {l.data_pgto ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-white text-sm max-w-[200px] truncate">
                              {l.descricao ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-white text-sm font-medium whitespace-nowrap">
                              {l.nome_parceiro ?? "—"}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-bold text-sm ${
                                l.tipo === "CR" ? "text-teal-400" : "text-destructive"
                              }`}
                            >
                              {l.tipo === "CR" ? "+" : "-"}
                              {formatCurrency(l.valor)}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {l.categoria}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-white/5 border-t border-white/10">
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-3 font-bold text-white text-sm"
                          >
                            TOTAIS
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-teal-400 font-bold text-xs">
                              +{formatCurrency(totalEntradas / 100)}
                            </div>
                            <div className="text-destructive font-bold text-xs">
                              -{formatCurrency(totalSaidas / 100)}
                            </div>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* ── Paginação ── */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                      <span className="text-xs text-muted-foreground">
                        Página {paginaAtual} de {totalPages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPagina((p) => Math.max(1, p - 1))}
                          disabled={paginaAtual <= 1}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          aria-label="Página anterior"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        {/* Números de página (máx. 5 visíveis) */}
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const offset = Math.max(
                            0,
                            Math.min(totalPages - 5, paginaAtual - 3),
                          );
                          const p = offset + i + 1;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setPagina(p)}
                              className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                                p === paginaAtual
                                  ? "bg-primary text-white"
                                  : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                              }`}
                            >
                              {p}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setPagina((p) => Math.min(totalPages, p + 1))}
                          disabled={paginaAtual >= totalPages}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          aria-label="Próxima página"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Obrigações Fiscais (placeholder) ── */}
      {tab === "impostos" && (
        <div className="glass-panel rounded-2xl p-12 text-center border border-white/5">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="font-bold text-white mb-2">Obrigações Fiscais</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            O cálculo automático de obrigações fiscais (ISS, PIS, COFINS, CSLL, IRPJ)
            será implementado numa fase futura após integração com o módulo de apuração
            fiscal.
          </p>
        </div>
      )}
    </div>
  );
}
