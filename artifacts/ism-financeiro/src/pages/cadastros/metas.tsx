import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download, Target, TrendingUp, TrendingDown, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import {
  formatValorBrInput,
  brMoneyDisplayToApiString,
  apiValorToValorBr,
} from "@/validations/lancamentos.schema";
import { invalidateRelated } from "@/App";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

// ─── Tipos 
type PlanoConta = {
  id: number;
  tipo: string;
  categoria: string;
  subcategoria: string | null;
  ativo: boolean;
};

type MetaRow = {
  id: number;
  plano_conta_id: number;
  ano: number;
  mes: number;
  valor_projetado: string;
};

type ActiveCell = {
  plano_conta_id: number;
  mes: number;
  value: string;
};

// ─── Constantes 
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR + 3 - i);

const TIPO_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  receita: {
    label: "Receitas (+)",
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
  },
  custo: {
    label: "Custos (-)",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  despesa: {
    label: "Despesas (-)",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
};
const TIPO_ORDER = ["receita", "custo", "despesa"];

// ─── Utilitário de exibição compacta (sem "R$") ─────────────────────────────
function compactBrl(valor: string | undefined): string {
  if (!valor) return "—";
  const n = parseFloat(valor);
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Exportação CSV ────────────────────────────────────────────────────────────
function exportarCSV(
  ano: number,
  grouped: Map<string, Map<string, PlanoConta[]>>,
  metasMap: Map<string, string>,
  stats: { receitas: number; saidas: number; resultado: number },
) {
  const BOM = "\uFEFF"; // garante acentos no Excel
  const sep = ";";
  const rows: string[] = [];

  // Cabeçalho
  const header = ["Tipo", "Categoria", "Subcategoria", ...MESES, "Total Ano"];
  rows.push(header.map((c) => `"${c}"`).join(sep));

  for (const tipo of TIPO_ORDER) {
    const catMap = grouped.get(tipo);
    if (!catMap || catMap.size === 0) continue;
    const cfg = TIPO_CONFIG[tipo];

    for (const [categoria, items] of catMap.entries()) {
      for (const pc of items) {
        const valores = Array.from({ length: 12 }, (_, i) => {
          const v = parseFloat(metasMap.get(`${pc.id}-${i + 1}`) ?? "0") || 0;
          return v.toFixed(2).replace(".", ",");
        });
        const total = valores
          .reduce((acc, v) => acc + parseFloat(v.replace(",", ".")), 0)
          .toFixed(2)
          .replace(".", ",");

        const row = [
          cfg.label,
          categoria,
          pc.subcategoria ?? pc.categoria,
          ...valores,
          total,
        ];
        rows.push(row.map((c) => `"${c}"`).join(sep));
      }
    }
  }

  // Linha em branco + resumo
  rows.push("");
  rows.push(`"Resumo ${ano}"`);
  rows.push(`"Total Receitas"${sep}${sep}"${stats.receitas.toFixed(2).replace(".", ",")}"`);
  rows.push(`"Total Saídas"${sep}${sep}"${stats.saidas.toFixed(2).replace(".", ",")}"`);
  rows.push(`"Resultado Projetado"${sep}${sep}"${stats.resultado.toFixed(2).replace(".", ",")}"`);

  const blob = new Blob([BOM + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metas-orcamentarias-${ano}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Célula editável ───────────────────────────────────────────────────────────
interface MetaCellProps {
  plano_conta_id: number;
  mes: number;
  currentValue: string;
  activeCell: ActiveCell | null;
  onActivate: (cell: ActiveCell) => void;
  onChange: (value: string) => void;
  onSave: (plano_conta_id: number, mes: number) => void;
  onCancel: () => void;
}

function MetaCell({
  plano_conta_id,
  mes,
  currentValue,
  activeCell,
  onActivate,
  onChange,
  onSave,
  onCancel,
}: MetaCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive =
    activeCell?.plano_conta_id === plano_conta_id && activeCell?.mes === mes;

  useEffect(() => {
    if (isActive) inputRef.current?.select();
  }, [isActive]);

  if (isActive) {
    return (
      <input
        ref={inputRef}
        value={activeCell.value}
        onChange={(e) => onChange(formatValorBrInput(e.target.value))}
        onBlur={() => onSave(plano_conta_id, mes)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(plano_conta_id, mes);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full text-right bg-primary/15 border border-primary/50 rounded px-1.5 py-0.5 text-xs text-white outline-none font-mono"
        placeholder="0,00"
      />
    );
  }

  const hasValue = currentValue && parseFloat(currentValue) > 0;
  return (
    <button
      type="button"
      onClick={() =>
        onActivate({
          plano_conta_id,
          mes,
          value: hasValue ? apiValorToValorBr(currentValue) : "",
        })
      }
      className={`w-full text-right text-xs rounded px-1 py-0.5 transition-colors hover:bg-white/10 font-mono ${
        hasValue ? "text-white" : "text-muted-foreground/30"
      }`}
    >
      {hasValue ? compactBrl(currentValue) : "—"}
    </button>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────────
export default function Metas() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [ano, setAno] = useState(CURRENT_YEAR);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [collapsedTipos, setCollapsedTipos] = useState<Set<string>>(new Set());

  // Reset active cell when year changes
  useEffect(() => {
    setActiveCell(null);
  }, [ano]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: planoContas = [], isLoading: loadingPC } = useQuery<PlanoConta[]>({
    queryKey: ["plano-contas"],
    queryFn: () => fetchApiData<PlanoConta[]>("/plano-contas"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: metas = [], isLoading: loadingMetas } = useQuery<MetaRow[]>({
    queryKey: ["metas", ano],
    queryFn: () => fetchApiData<MetaRow[]>(`/metas?ano=${ano}`),
  });

  // ── Mutation com Optimistic Update ────────────────────────────────────────
  const saveMeta = useMutation({
    mutationFn: (payload: {
      plano_conta_id: number;
      ano: number;
      mes: number;
      valor_projetado: string;
    }) =>
      fetchApiData<MetaRow>("/metas", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["metas", ano] });
      const previous = queryClient.getQueryData<MetaRow[]>(["metas", ano]);

      queryClient.setQueryData<MetaRow[]>(["metas", ano], (old = []) => {
        const exists = old.find(
          (m) => m.plano_conta_id === payload.plano_conta_id && m.mes === payload.mes,
        );
        if (exists) {
          return old.map((m) =>
            m.plano_conta_id === payload.plano_conta_id && m.mes === payload.mes
              ? { ...m, valor_projetado: payload.valor_projetado }
              : m,
          );
        }
        return [
          ...old,
          {
            id: -(Date.now()),
            plano_conta_id: payload.plano_conta_id,
            ano: payload.ano,
            mes: payload.mes,
            valor_projetado: payload.valor_projetado,
          },
        ];
      });

      return { previous };
    },

    onError: (_e, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["metas", ano], context.previous);
      }
      toast({
        variant: "destructive",
        title: "Erro ao salvar meta",
        description: "Não foi possível guardar o valor. Tente novamente.",
      });
    },

    onSettled: () => {
      invalidateRelated(queryClient, "metas"); // ← ALTERADO: era invalidateQueries(["metas", ano])
    },
  });

  // ── Lookup: "plano_conta_id-mes" → valor_projetado ────────────────────────
  const metasMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of metas) {
      map.set(`${m.plano_conta_id}-${m.mes}`, m.valor_projetado);
    }
    return map;
  }, [metas]);

  // ── Agrupamento: tipo → categoria → PlanoConta[] ──────────────────────────
  const grouped = useMemo(() => {
    const result = new Map<string, Map<string, PlanoConta[]>>();
    TIPO_ORDER.forEach((t) => result.set(t, new Map()));

    for (const pc of planoContas) {
      if (!pc.ativo) continue;
      const catMap = result.get(pc.tipo);
      if (!catMap) continue;
      const arr = catMap.get(pc.categoria);
      if (arr) arr.push(pc);
      else catMap.set(pc.categoria, [pc]);
    }
    return result;
  }, [planoContas]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const byTipo: Record<string, number> = { receita: 0, custo: 0, despesa: 0 };
    const pcById = new Map(planoContas.map((p) => [p.id, p]));

    for (const m of metas) {
      const pc = pcById.get(m.plano_conta_id);
      if (!pc) continue;
      const v = parseFloat(m.valor_projetado) || 0;
      if (pc.tipo in byTipo) byTipo[pc.tipo] += v;
    }

    const receitas = byTipo.receita;
    const saidas = byTipo.custo + byTipo.despesa;
    const resultado = receitas - saidas;
    const categoriasComMeta = new Set(metas.map((m) => m.plano_conta_id)).size;

    return { receitas, saidas, resultado, categoriasComMeta };
  }, [metas, planoContas]);

  // ── Handlers de célula ─────────────────────────────────────────────────────
  const handleActivate = (cell: ActiveCell) => setActiveCell(cell);

  const handleChange = (value: string) => {
    if (!activeCell) return;
    setActiveCell({ ...activeCell, value });
  };

  const handleSave = (plano_conta_id: number, mes: number) => {
    if (!activeCell) return;
    setActiveCell(null);

    const apiValue = brMoneyDisplayToApiString(activeCell.value) || "0.00";
    const current = metasMap.get(`${plano_conta_id}-${mes}`) ?? "";

    if (apiValue === current) return;

    saveMeta.mutate({ plano_conta_id, ano, mes, valor_projetado: apiValue });
  };

  const handleCancel = () => setActiveCell(null);

  const toggleTipo = (tipo: string) =>
    setCollapsedTipos((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });

  // ── Total anual de uma linha ───────────────────────────────────────────────
  function rowTotal(pcId: number): number {
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      sum += parseFloat(metasMap.get(`${pcId}-${m}`) ?? "0") || 0;
    }
    return sum;
  }

  const isLoading = loadingPC || loadingMetas;
  const canExport = !isLoading && metas.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas Financeiras"
        description="Planeamento orçamentário por categoria — clique numa célula para editar"
        actions={
          <div className="flex gap-3">
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none cursor-pointer"
            >
              {YEARS.map((y) => (
                <option key={y} value={y} className="bg-card text-white">
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => exportarCSV(ano, grouped, metasMap, stats)}
              disabled={!canExport}
              title={
                isLoading
                  ? "Carregando…"
                  : metas.length === 0
                  ? "Nenhuma meta cadastrada para exportar"
                  : `Exportar metas de ${ano} em CSV`
              }
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> Exportar
            </button>
          </div>
        }
      />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-teal-400" />
            <p className="text-xs text-muted-foreground">Meta Receita {ano}</p>
          </div>
          <p className="text-lg font-bold text-teal-400">
            {isLoading ? "…" : formatCurrency(stats.receitas)}
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-destructive" />
            <p className="text-xs text-muted-foreground">Despesas + Custos</p>
          </div>
          <p className="text-lg font-bold text-destructive">
            {isLoading ? "…" : formatCurrency(stats.saidas)}
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={`w-5 h-5 ${stats.resultado >= 0 ? "text-success" : "text-destructive"}`} />
            <p className="text-xs text-muted-foreground">Resultado Projetado</p>
          </div>
          <p className={`text-lg font-bold ${stats.resultado >= 0 ? "text-success" : "text-destructive"}`}>
            {isLoading ? "…" : formatCurrency(stats.resultado)}
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-orange-400" />
            <p className="text-xs text-muted-foreground">Categorias com Meta</p>
          </div>
          <p className="text-lg font-bold text-orange-400">
            {isLoading ? "…" : `${stats.categoriasComMeta} / ${planoContas.filter((p) => p.ativo).length}`}
          </p>
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-bold text-white">
            Planilha de Metas Orçamentárias — {ano}
          </h3>
          {saveMeta.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Salvando…
            </div>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : planoContas.filter((p) => p.ativo).length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Target className="text-muted-foreground/40" />
              </EmptyMedia>
              <EmptyTitle className="text-white">Nenhuma categoria ativa</EmptyTitle>
              <EmptyDescription>
                Cadastre categorias no Plano de Contas para definir metas orçamentárias.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-card/95 backdrop-blur-sm min-w-[200px] z-10">
                    Categoria / Subcategoria
                  </th>
                  {MESES.map((mes) => (
                    <th
                      key={mes}
                      className="px-2 py-3 text-right font-medium text-muted-foreground min-w-[90px] text-xs"
                    >
                      {mes}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold text-white min-w-[110px] text-xs">
                    Total Ano
                  </th>
                </tr>
              </thead>
              <tbody>
                {TIPO_ORDER.map((tipo) => {
                  const catMap = grouped.get(tipo);
                  if (!catMap || catMap.size === 0) return null;
                  const cfg = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.despesa;
                  const isCollapsed = collapsedTipos.has(tipo);

                  return (
                    <Fragment key={`tipo-${tipo}`}>
                      {/* ── Cabeçalho de Tipo ── */}
                      <tr
                        className={`${cfg.bg} border-y ${cfg.border} cursor-pointer select-none`}
                        onClick={() => toggleTipo(tipo)}
                      >
                        <td
                          className={`px-4 py-2.5 font-bold ${cfg.color} sticky left-0 bg-inherit z-10`}
                          colSpan={14}
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            {cfg.label}
                          </div>
                        </td>
                      </tr>

                      {!isCollapsed &&
                        Array.from(catMap.entries()).map(([categoria, items]) => (
                          <Fragment key={`cat-${tipo}-${categoria}`}>
                            {/* ── Cabeçalho de Categoria ── */}
                            <tr className="bg-white/[0.03] border-b border-white/5">
                              <td
                                className="px-4 py-2 text-xs font-semibold text-white/70 uppercase tracking-wide sticky left-0 bg-card/90 z-10 pl-8"
                                colSpan={14}
                              >
                                {categoria}
                              </td>
                            </tr>

                            {/* ── Linhas de Subcategoria (folhas editáveis) ── */}
                            {items.map((pc) => {
                              const total = rowTotal(pc.id);
                              return (
                                <tr
                                  key={`pc-${pc.id}`}
                                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                                >
                                  <td className="px-4 py-2.5 sticky left-0 bg-card/80 backdrop-blur-sm z-10 pl-12">
                                    <span className="text-sm text-white/80 capitalize">
                                      {pc.subcategoria ?? pc.categoria}
                                    </span>
                                  </td>
                                  {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
                                    <td key={mes} className="px-2 py-2">
                                      <MetaCell
                                        plano_conta_id={pc.id}
                                        mes={mes}
                                        currentValue={metasMap.get(`${pc.id}-${mes}`) ?? ""}
                                        activeCell={activeCell}
                                        onActivate={handleActivate}
                                        onChange={handleChange}
                                        onSave={handleSave}
                                        onCancel={handleCancel}
                                      />
                                    </td>
                                  ))}
                                  <td className="px-4 py-2 text-right">
                                    <span
                                      className={`text-xs font-semibold ${total > 0 ? cfg.color : "text-muted-foreground/40"}`}
                                    >
                                      {total > 0 ? formatCurrency(total) : "—"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Clique em qualquer célula para definir ou editar o valor projetado.
        Pressione <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-mono">Enter</kbd> para confirmar
        ou <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-mono">Esc</kbd> para cancelar.
      </p>
    </div>
  );
}