import {tenantQueryKey} from "@/lib/tenant-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  Download,
  FileText,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDinheiro } from "@/components/conta/saldos-visiveis";
import { useQuery } from "@tanstack/react-query";
import { fetchApiData } from "@/lib/api-config";
import { exportToExcel, exportToPDF, fmtBRL, fmtDate } from "@/lib/export";
import { SelectCampo } from "@/components/ui/select-campo";
import {
  FiltrosAtivos,
  FiltrosPopover,
  FOCO_VISIVEL,
  useFiltrosNaUrl,
  type DefinicaoFiltro,
} from "@/components/shared/filtros";

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

type ContaOpcao = { id: number; nome: string };

/** Mês da URL (1–12); inválido ou ausente cai no mês atual. */
function lerMes(valor: string): number {
  const n = Number.parseInt(valor, 10);
  return n >= 1 && n <= 12 ? n : new Date().getMonth() + 1;
}

/** Ano da URL (4 dígitos); inválido ou ausente cai no ano atual. */
function lerAno(valor: string): number {
  return /^\d{4}$/.test(valor) ? Number(valor) : CURRENT_YEAR;
}

/** Tipo da URL (?tipo=CR|CP); ausente = ambos. */
function lerTipo(valor: string): TipoFiltro {
  return valor === "CR" || valor === "CP" ? valor : "ambos";
}

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
  const dinheiro = useDinheiro();
  const [tab, setTab] = useState<"livro" | "impostos">("livro");

  // Opções do filtro "Conta bancária" (mesma chave de cache da tela de lançamentos).
  const { data: contas = [] } = useQuery({
    queryKey: tenantQueryKey("contas-bancarias-filtro"),
    queryFn: () => fetchApiData<ContaOpcao[]>("/contas-bancarias"),
    staleTime: 60_000,
  });

  const definicoes: DefinicaoFiltro[] = useMemo(() => [
    {
      chave: "conta_id",
      rotulo: "Conta bancária",
      tipo: "select",
      placeholder: "Todas as contas",
      opcoes: contas.map((c) => ({ valor: String(c.id), rotulo: c.nome })),
    },
  ], [contas]);

  // Período, tipo, conta e página na URL (?mes=10&ano=2026&tipo=CR&conta_id=3&pagina=2).
  const filtros = useFiltrosNaUrl(definicoes);
  const { ler, atualizar, pagina, irParaPagina } = filtros;
  const mesFiltro = lerMes(ler("mes"));
  const anoFiltro = lerAno(ler("ano"));
  const tipoFiltro = lerTipo(ler("tipo"));
  const contaId = filtros.valores.conta_id ?? "";
  const contaNome = contaId ? contas.find((c) => String(c.id) === contaId)?.nome : undefined;

  const anosOpcoes = useMemo(
    () => (YEARS.includes(anoFiltro) ? YEARS : [...YEARS, anoFiltro].sort((a, b) => b - a)),
    [anoFiltro],
  );

  const dataInicio = `${anoFiltro}-${String(mesFiltro).padStart(2, "0")}-01`;
  const dataFim = lastDayOfMonth(anoFiltro, mesFiltro);

  const params = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
  if (tipoFiltro !== "ambos") params.set("tipo", tipoFiltro);
  if (contaId) params.set("conta_id", contaId);

  const { data: todos = [], isLoading, isError } = useQuery<ContabilItem[]>({
    queryKey: tenantQueryKey("contabil-fiscal", dataInicio, dataFim, tipoFiltro, contaId),
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

  // Ao mudar filtro, volta para página 1 (o atualizar da URL já remove ?pagina)
  const mudarPeriodo = (mes: number, ano: number) =>
    atualizar({ mes: String(mes), ano: String(ano) });
  const handleTipo = (v: TipoFiltro) => atualizar({ tipo: v === "ambos" ? null : v });

  const anuncio = isLoading
    ? ""
    : `${todos.length} ${todos.length === 1 ? "lançamento quitado encontrado" : "lançamentos quitados encontrados"}`;

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
  const exportSubtitle = `Filtro: ${tipoFiltro === "ambos" ? "Entradas e Saídas" : tipoFiltro === "CR" ? "Entradas (CR)" : "Saídas (CP)"}${contaNome ? `  |  Conta: ${contaNome}` : ""}  |  ${todos.length} registos`;

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
          {/* Barra padrão: período e Filtros à esquerda; tipo à direita */}
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
                  <label htmlFor="contabil-mes" className="sr-only">Mês</label>
                  <SelectCampo
                    id="contabil-mes"
                    value={String(mesFiltro)}
                    onChange={(v) => mudarPeriodo(Number(v), anoFiltro)}
                    className="w-[12em]"
                    opcoes={MESES_LONGOS.map((m, i) => ({value: String(i + 1), label: m}))}
                  />
                  <label htmlFor="contabil-ano" className="sr-only">Ano</label>
                  <SelectCampo
                    id="contabil-ano"
                    value={String(anoFiltro)}
                    onChange={(v) => mudarPeriodo(mesFiltro, Number(v))}
                    className="w-[8.5em]"
                    opcoes={anosOpcoes.map((y) => ({value: String(y), label: String(y)}))}
                  />
                </div>
                <FiltrosPopover
                  definicoes={definicoes}
                  valores={filtros.valores}
                  contagem={filtros.contagem}
                  onAplicar={filtros.aplicar}
                />
              </div>
              <div className="flex gap-1 p-0.5 bg-black/20 rounded-lg border border-white/5" role="group" aria-label="Tipo de lançamento">
                {(["ambos", "CR", "CP"] as TipoFiltro[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={tipoFiltro === v}
                    onClick={() => handleTipo(v)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-bold transition-colors",
                      tipoFiltro === v
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:text-white",
                      FOCO_VISIVEL,
                    )}
                  >
                    {v === "ambos" ? "Todos" : v === "CR" ? "A Receber" : "A Pagar"}
                  </button>
                ))}
              </div>
            </div>
            <FiltrosAtivos
              chips={filtros.chips}
              onRemover={filtros.remover}
              onLimparTodos={filtros.limpar}
              anuncio={anuncio}
              className="border-b-0 border-t border-white/5"
            />
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
                      {dinheiro(totalEntradas / 100)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saídas</p>
                    <p className="font-bold text-destructive">
                      {dinheiro(totalSaidas / 100)}
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
                      {dinheiro((totalEntradas - totalSaidas) / 100)}
                    </p>
                  </div>
                </div>
              </div>

              {todos.length === 0 ? (
                <div className="py-14 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">
                    {filtros.contagem > 0
                      ? `Nenhum resultado para os filtros aplicados em ${MESES_LONGOS[mesFiltro - 1]} ${anoFiltro}.`
                      : `Nenhum lançamento quitado em ${MESES_LONGOS[mesFiltro - 1]} ${anoFiltro}.`}
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
                              {dinheiro(l.valor)}
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
                              +{dinheiro(totalEntradas / 100)}
                            </div>
                            <div className="text-destructive font-bold text-xs">
                              -{dinheiro(totalSaidas / 100)}
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
                          onClick={() => irParaPagina(Math.max(1, paginaAtual - 1))}
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
                              onClick={() => irParaPagina(p)}
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
                          onClick={() => irParaPagina(Math.min(totalPages, paginaAtual + 1))}
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
