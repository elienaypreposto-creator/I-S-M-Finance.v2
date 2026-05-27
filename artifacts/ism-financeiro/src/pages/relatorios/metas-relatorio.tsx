import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  Download,
  FileText,
  Target,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchApiData } from "@/lib/api-config";
import { exportToExcel, exportToPDF, fmtBRL } from "@/lib/export";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

// ─── Constantes ────────────────────────────────────────────────────────────────
const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + 2 - i);

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type MetaItem = {
  plano_conta_id: number;
  /** categoria vem do JOIN com plano_contas */
  categoria: string;
  /** mes 1-12 */
  mes: number;
  /** já convertido para number pelo backend */
  valor_projetado: number;
};

type DreLinha = {
  codigo: string;
  descricao: string;
  /** chaves "01"…"12" → valor mensal */
  valores: Record<string, number>;
  total: number;
};

type DreResponse = {
  ano: number;
  regime: string;
  meses: string[];
  linhas: DreLinha[];
};

// ─── Tooltip customizado do recharts ──────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
      <p className="text-white font-medium mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="text-sm">
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};

// ─── Página ────────────────────────────────────────────────────────────────────
export default function MetasRelatorio() {
  const [ano, setAno] = useState(CURRENT_YEAR);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: metas = [], isLoading: loadingMetas, isError: errMetas } = useQuery<
    MetaItem[]
  >({
    queryKey: ["relatorio-metas", ano],
    queryFn: () => fetchApiData<MetaItem[]>(`/relatorios/metas?ano=${ano}`),
  });

  const { data: dre, isLoading: loadingDre, isError: errDre } = useQuery<DreResponse>(
    {
      queryKey: ["relatorio-dre", ano],
      queryFn: () => fetchApiData<DreResponse>(`/relatorios/dre?ano=${ano}`),
    },
  );

  const isLoading = loadingMetas || loadingDre;

  // ── Agregações de metas ────────────────────────────────────────────────────
  /** Total orçado por mês (mes 1-12 → soma de todas as categorias) */
  const metasPorMes = useMemo(() => {
    const m: Record<number, number> = {};
    for (const item of metas) {
      m[item.mes] = (m[item.mes] ?? 0) + item.valor_projetado;
    }
    return m;
  }, [metas]);

  /** Orçado por categoria → Record<mes, valor> */
  const metasPorCategoria = useMemo(() => {
    const cat = new Map<string, Record<number, number>>();
    for (const item of metas) {
      if (!cat.has(item.categoria)) cat.set(item.categoria, {});
      const m = cat.get(item.categoria)!;
      m[item.mes] = (m[item.mes] ?? 0) + item.valor_projetado;
    }
    return cat;
  }, [metas]);

  // ── Linhas do DRE ──────────────────────────────────────────────────────────
  /** linha "1" = RECEITA BRUTA DE SERVIÇOS */
  const dreReceita = dre?.linhas.find((l) => l.codigo === "1");
  /** linha "7" = LUCRO LÍQUIDO DO PERÍODO */
  const dreResultado = dre?.linhas.find((l) => l.codigo === "7");

  // ── Dados do gráfico mensal ────────────────────────────────────────────────
  const chartData = useMemo(
    () =>
      MESES_CURTOS.map((mes, i) => {
        const mesKey = String(i + 1).padStart(2, "0");
        return {
          mes,
          orcado: metasPorMes[i + 1] ?? 0,
          realizado: dreReceita?.valores[mesKey] ?? 0,
        };
      }),
    [metasPorMes, dreReceita],
  );

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalOrcado = Object.values(metasPorMes).reduce((a, b) => a + b, 0);
  const totalRealizadoReceita = dreReceita?.total ?? 0;
  const totalResultado = dreResultado?.total ?? 0;
  const variacaoPct =
    totalOrcado > 0
      ? ((totalRealizadoReceita - totalOrcado) / totalOrcado) * 100
      : null;

  const hasChartData = totalOrcado > 0 || totalRealizadoReceita > 0;

  // ── Exportação ──────────────────────────────────────────────────────────────
  const EXPORT_COLUMNS = [
    { header: "Categoria",       key: "categoria", width: 34 },
    ...MESES_CURTOS.map((m, i) => ({
      header: m,
      key: `mes_${i + 1}`,
      width: 14,
      formatter: (v: unknown) => fmtBRL(v ?? 0),
    })),
    { header: "Total Orçado", key: "total", width: 18, formatter: (v: unknown) => fmtBRL(v ?? 0) },
  ];

  function buildMetasExportRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    for (const [cat, mesMapa] of metasPorCategoria.entries()) {
      const row: Record<string, unknown> = { categoria: cat };
      let total = 0;
      for (let m = 1; m <= 12; m++) {
        const v = mesMapa[m] ?? 0;
        row[`mes_${m}`] = v;
        total += v;
      }
      row["total"] = total;
      rows.push(row);
    }
    // Linha de totais
    const totRow: Record<string, unknown> = { categoria: "TOTAL" };
    for (let m = 1; m <= 12; m++) totRow[`mes_${m}`] = metasPorMes[m] ?? 0;
    totRow["total"] = totalOrcado;
    rows.push(totRow);
    return rows;
  }

  const exportFilename = `Metas_${ano}`;

  function handleExportExcel() {
    exportToExcel(exportFilename, buildMetasExportRows(), EXPORT_COLUMNS);
  }

  function handleExportPDF() {
    exportToPDF(exportFilename, buildMetasExportRows(), EXPORT_COLUMNS, {
      title: `Relatório de Metas — ${ano}`,
      subtitle: `Total Orçado: ${fmtBRL(totalOrcado)}  |  Receita Realizada: ${fmtBRL(totalRealizadoReceita)}`,
      orientation: "landscape",
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de Metas"
        description={`Orçado × Realizado — ${ano}`}
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
              onClick={handleExportPDF}
              disabled={metas.length === 0 || isLoading}
              title="Exportar PDF"
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" /> Exportar PDF
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={metas.length === 0 || isLoading}
              title="Exportar XLSX"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Carregando relatório de metas…</span>
        </div>
      )}

      {/* ── Erros parciais ── */}
      {(errMetas || errDre) && !isLoading && (
        <div className="glass-panel rounded-2xl p-5 border border-warning/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-warning shrink-0" />
          <p className="text-sm text-muted-foreground">
            {errMetas && errDre
              ? "Erro ao carregar metas e DRE."
              : errMetas
                ? "Erro ao carregar metas — realizado disponível abaixo."
                : "Erro ao carregar DRE — orçamento disponível abaixo."}
          </p>
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Total Orçado */}
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-primary" />
                <p className="text-xs text-muted-foreground">Total Orçado</p>
              </div>
              <p className="text-xl font-bold text-primary">
                {formatCurrency(totalOrcado)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {metasPorCategoria.size} categoria{metasPorCategoria.size !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Receita Realizada (DRE linha 1) */}
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-teal-400" />
                <p className="text-xs text-muted-foreground">Receita Realizada</p>
              </div>
              <p className="text-xl font-bold text-teal-400">
                {formatCurrency(totalRealizadoReceita)}
              </p>
              {totalOrcado > 0 && (
                <p
                  className={`text-xs mt-1 ${
                    totalRealizadoReceita >= totalOrcado
                      ? "text-success"
                      : "text-warning"
                  }`}
                >
                  {((totalRealizadoReceita / totalOrcado) * 100).toFixed(1)}% do orçado
                </p>
              )}
            </div>

            {/* Resultado Realizado (DRE linha 7) */}
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                {totalResultado >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-success" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-destructive" />
                )}
                <p className="text-xs text-muted-foreground">Resultado Realizado</p>
              </div>
              <p
                className={`text-xl font-bold ${
                  totalResultado >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {formatCurrency(totalResultado)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Lucro líquido (DRE)</p>
            </div>

            {/* Δ Orçado vs Realizado */}
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-orange-400" />
                <p className="text-xs text-muted-foreground">Δ Receita vs Meta</p>
              </div>
              <p
                className={`text-xl font-bold ${
                  variacaoPct === null
                    ? "text-muted-foreground"
                    : variacaoPct >= 0
                      ? "text-success"
                      : "text-destructive"
                }`}
              >
                {variacaoPct === null
                  ? "—"
                  : `${variacaoPct >= 0 ? "+" : ""}${variacaoPct.toFixed(1)}%`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {variacaoPct === null
                  ? "Sem metas cadastradas"
                  : variacaoPct >= 0
                    ? "Acima da meta"
                    : "Abaixo da meta"}
              </p>
            </div>
          </div>

          {/* ── Gráfico Mensal: Orçado vs Realizado Receita ── */}
          {hasChartData && (
            <div className="glass-panel rounded-2xl p-6">
              <div className="mb-5">
                <h3 className="font-bold text-white">
                  Orçado × Receita Realizada — {ano}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Realizado = Receita Bruta de Serviços (regime competência).
                  Verde = atingiu meta; Vermelho = abaixo da meta.
                </p>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    barSize={18}
                    barGap={4}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#ffffff10"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="mes"
                      stroke="#ffffff50"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#ffffff50"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                      }
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{ fill: "#ffffff05" }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: "12px" }}
                    />
                    <Bar
                      dataKey="orcado"
                      name="Orçado"
                      fill="#3BA8DC"
                      fillOpacity={0.5}
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="realizado"
                      name="Realizado"
                      radius={[3, 3, 0, 0]}
                    >
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.realizado >= entry.orcado ? "#27AE60" : "#E74C3C"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Tabela de orçamento por categoria ── */}
          {metasPorCategoria.size > 0 && (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/5">
                <h3 className="font-bold text-white">
                  Orçamento por Categoria — {ano}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valores planeados. Realizado por categoria disponível numa fase
                  futura.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-card/95 min-w-[180px] text-xs">
                        Categoria
                      </th>
                      {MESES_CURTOS.map((m) => (
                        <th
                          key={m}
                          className="px-3 py-3 text-right font-medium text-muted-foreground min-w-[80px] text-xs"
                        >
                          {m}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right font-semibold text-white text-xs min-w-[100px]">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {Array.from(metasPorCategoria.entries()).map(([cat, meses]) => {
                      const total = Object.values(meses).reduce(
                        (a, b) => a + b,
                        0,
                      );
                      return (
                        <tr key={cat} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-medium text-white sticky left-0 bg-card/80 backdrop-blur-sm capitalize text-sm">
                            {cat}
                          </td>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(
                            (mes) => {
                              const v = meses[mes] ?? 0;
                              return (
                                <td
                                  key={mes}
                                  className="px-3 py-3 text-right text-xs text-muted-foreground font-mono"
                                >
                                  {v > 0
                                    ? v.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0,
                                      })
                                    : "—"}
                                </td>
                              );
                            },
                          )}
                          <td className="px-4 py-3 text-right font-bold text-primary text-xs">
                            {formatCurrency(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Estado vazio ── */}
          {metas.length === 0 && !errMetas && (
            <div className="glass-panel rounded-2xl py-14 text-center border border-white/5">
              <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">
                Nenhuma meta cadastrada para {ano}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Acesse{" "}
                <strong className="text-white">
                  Cadastros → Metas Financeiras
                </strong>{" "}
                para definir o orçamento.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
