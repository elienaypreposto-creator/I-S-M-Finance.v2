import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { useQuery } from "@tanstack/react-query";
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

/** Conversão segura para cêntimos (agregações na UI). */
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

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Painel de Controle"
        description="Visão geral financeira e indicadores da ISM Tecnologia"
        actions={
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
            <Download className="w-4 h-4" /> Exportar Relatório
          </button>
        }
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
