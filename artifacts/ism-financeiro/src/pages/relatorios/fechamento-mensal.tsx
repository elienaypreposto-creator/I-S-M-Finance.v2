import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  Download,
  Wallet,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchApiData } from "@/lib/api-config";

// ─── Constantes ────────────────────────────────────────────────────────────────
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 2 - i);

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type FechamentoData = {
  mes: number;
  ano: number;
  planejado_receber: number;
  realizado_receber: number;
  planejado_gastar: number;
  realizado_gastar: number;
};

// Aritmética de centavos para evitar ponto flutuante ao calcular saldo
function toCents(v: number): number {
  return Math.round(v * 100);
}

// ─── Componente de KPI individual ──────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  colorClass,
  icon,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  colorClass: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white/5 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────────
export default function FechamentoMensal() {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(CURRENT_YEAR);

  const { data, isLoading, isError } = useQuery<FechamentoData>({
    queryKey: ["fechamento-mensal", mes, ano],
    queryFn: () =>
      fetchApiData<FechamentoData>(
        `/relatorios/fechamento-mensal?mes=${mes}&ano=${ano}`,
      ),
  });

  // Saldo calculado em centavos para precisão
  const saldoCents = data
    ? toCents(data.realizado_receber) - toCents(data.realizado_gastar)
    : 0;
  const saldo = saldoCents / 100;

  const variacaoCR =
    data && data.planejado_receber > 0
      ? ((data.realizado_receber - data.planejado_receber) /
          data.planejado_receber) *
        100
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fechamento Mensal"
        description="Consolidação financeira do período selecionado"
        actions={
          <div className="flex gap-3">
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none cursor-pointer"
            >
              {MESES.map((m, i) => (
                <option key={i} value={i + 1} className="bg-card text-white">
                  {m}
                </option>
              ))}
            </select>
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
              disabled
              title="Exportar PDF — disponível na Fase 5"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium opacity-40 cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
          </div>
        }
      />

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Carregando fechamento…</span>
        </div>
      )}

      {/* ── Erro ── */}
      {isError && !isLoading && (
        <div className="glass-panel rounded-2xl p-6 border border-destructive/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-muted-foreground">
            Erro ao carregar dados do período. Tente novamente.
          </p>
        </div>
      )}

      {/* ── Dados ── */}
      {data && !isLoading && (
        <>
          {/* Cabeçalho do período */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-white">
                  {MESES[mes - 1]} {ano}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valores referentes a lançamentos quitados no período
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Meta (planejado) */}
              <KpiCard
                label="Meta Receita (Orçado)"
                value={formatCurrency(data.planejado_receber)}
                colorClass="text-primary"
                icon={<Wallet className="w-4 h-4 text-primary" />}
                sub={
                  <p className="text-xs text-muted-foreground">Orçado para o período</p>
                }
              />

              {/* Realizado CR */}
              <KpiCard
                label="Receitas Realizadas (CR)"
                value={formatCurrency(data.realizado_receber)}
                colorClass={
                  data.realizado_receber >= data.planejado_receber
                    ? "text-success"
                    : "text-warning"
                }
                icon={<ArrowUpCircle className="w-4 h-4 text-teal-400" />}
                sub={
                  variacaoCR !== null ? (
                    <p
                      className={`text-xs flex items-center gap-1 ${variacaoCR >= 0 ? "text-success" : "text-warning"}`}
                    >
                      {variacaoCR >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {variacaoCR > 0 ? "+" : ""}
                      {variacaoCR.toFixed(1)}% vs meta
                    </p>
                  ) : null
                }
              />

              {/* Realizado CP */}
              <KpiCard
                label="Saídas Realizadas (CP)"
                value={formatCurrency(data.realizado_gastar)}
                colorClass="text-destructive"
                icon={<ArrowDownCircle className="w-4 h-4 text-destructive" />}
                sub={
                  <p className="text-xs text-muted-foreground">Saídas quitadas</p>
                }
              />

              {/* Resultado */}
              <div
                className={`rounded-2xl p-5 border ${
                  saldo >= 0
                    ? "bg-success/10 border-success/20"
                    : "bg-destructive/10 border-destructive/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {saldo >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-success" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-destructive" />
                  )}
                  <p className="text-xs text-muted-foreground">Resultado Líquido</p>
                </div>
                <p
                  className={`text-2xl font-bold ${saldo >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {formatCurrency(saldo)}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Receitas − Saídas realizadas
                </p>
              </div>
            </div>
          </div>

          {/* Barra de comparação visual */}
          {data.planejado_receber > 0 && (
            <div className="glass-panel rounded-2xl p-5 border border-white/5">
              <p className="text-sm font-semibold text-white mb-4">
                Execução do Orçamento
              </p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Receita Realizada</span>
                    <span>
                      {Math.min(
                        100,
                        (data.realizado_receber / data.planejado_receber) * 100,
                      ).toFixed(1)}
                      % da meta
                    </span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        data.realizado_receber >= data.planejado_receber
                          ? "bg-success"
                          : "bg-warning"
                      }`}
                      style={{
                        width: `${Math.min(100, (data.realizado_receber / data.planejado_receber) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Nota sobre histórico */}
          <div className="glass-panel rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-3 text-muted-foreground/70">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="text-xs">
                Histórico de múltiplos meses estará disponível em versão futura. Use
                os seletores acima para navegar entre períodos.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
