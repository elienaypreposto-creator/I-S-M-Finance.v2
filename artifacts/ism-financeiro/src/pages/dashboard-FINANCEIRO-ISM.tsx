import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight, ArrowUpRight, AlertCircle, Clock, Download,
  AlertTriangle, Gavel, FileX, ShieldAlert, Ban, Loader2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { formatCurrency } from "@/lib/utils";

import { API_URL, fetchApi } from "@/lib/api-config";

const PIE_COLORS = ["#6366F1", "#F59E0B", "#E74C3C", "#22C55E", "#3B82F6", "#EC4899"];

const RISK_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  // Nível 1 - Alerta (1-15 dias): Amarelo / Laranja claro
  "Multas e Juros": { label: "Multas e Juros", icon: <Clock className="w-3 h-3" />, cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  "Perda de Desconto": { label: "Perda de Desconto", icon: <ArrowUpRight className="w-3 h-3" />, cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  "Restrição de Crédito": { label: "Restrição de Crédito", icon: <AlertCircle className="w-3 h-3" />, cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  
  // Nível 2 - Risco Operacional (16-30 dias): Laranja escuro
  "Corte de Serviço": { label: "Corte de Serviço", icon: <FileX className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  "Suspensão de Fornecimento": { label: "Suspensão de Fornecimento", icon: <Ban className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  "Negativação": { label: "Negativação", icon: <AlertTriangle className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  "Perda de Benefício Fiscal": { label: "Perda de Benefício Fiscal", icon: <FileX className="w-3 h-3" />, cls: "bg-orange-600/15 text-orange-500 border-orange-600/30" },
  
  // Nível 3 - Risco Jurídico (31-60 dias): Vermelho
  "Protesto": { label: "Protesto", icon: <Gavel className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  "Ação Judicial": { label: "Ação Judicial", icon: <ShieldAlert className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  "Dívida Ativa": { label: "Dívida Ativa", icon: <FileX className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  "Quebra de Contrato": { label: "Quebra de Contrato", icon: <FileX className="w-3 h-3" />, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  
  // Nível 4 - Risco Crítico (> 60 dias): Roxo / Vinho
  "Bloqueio de Contas (Sisbajud)": { label: "Bloqueio de Contas (Sisbajud)", icon: <Ban className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
  "Penhora de Bens": { label: "Penhora de Bens", icon: <Gavel className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
  "Pedido de Falência": { label: "Pedido de Falência", icon: <ShieldAlert className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
  "Impedimento de Certidão": { label: "Impedimento de Certidão", icon: <FileX className="w-3 h-3" />, cls: "bg-purple-900/25 text-purple-400 border-purple-900/40" },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
        {label && <p className="text-white font-medium mb-2 text-xs">{label}</p>}
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color || entry.fill }} className="text-sm font-medium">
            {entry.name}: {typeof entry.value === "number" && entry.value > 100 ? formatCurrency(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function KPICard({ label, value, icon, color, sub }: { label: string; value: string; icon: React.ReactNode; color: string; sub?: string }) {
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

type KPIs = { contasReceberAtraso: number; contasReceberAberto: number; contasPagarAberto: number; contasPagarAtraso: number; };
type ProjecaoMes = { projecaoRecebimentos: number; projecaoPagamentos: number; projecaoLucroLiquido: number; };
type Lancamento = { id: number; nome: string; valor: number; vencimento: string; };
type AlertaRisco = { id: number; tipo: string; nome: string; dias: number; valor: number; riscos: string[]; };
type FluxoMes = { mes: string; entradas: number; saidas: number; };
type PlanoItem = { categoria: string; valor: number; percentual: number; };

const STATUSES = [
  { v: "todos", label: "Todos" },
  { v: "pendente", label: "Pendente" },
  { v: "pago", label: "Pago" },
  { v: "recebido", label: "Recebido" },
  { v: "atrasado", label: "Atrasado" },
  { v: "cancelado", label: "Cancelado" },
];

function ContasPanel({ tipo, title, color, tab }: { tipo: "CP" | "CR"; title: string; color: "teal" | "orange"; tab: string }) {
  const [status, setStatus] = useState("todos");

  const endpoint = tipo === "CR"
    ? `/dashboard/inadimplencia-clientes?tab=${tab}${status !== "todos" ? `&status=${status}` : ""}`
    : `/dashboard/inadimplencia-fornecedores?tab=${tab}${status !== "todos" ? `&status=${status}` : ""}`;

  const { data: items = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: [`dashboard-${tipo}`, status, tab],
    queryFn: () => fetchApi(endpoint),
  });

  const colorMap = {
    teal: { dot: "bg-teal-400", badge: "bg-teal-500/20 text-teal-300", header: "bg-teal-500/5", icon: "text-teal-400", val: "text-teal-300", icoCls: <ArrowDownRight className="w-4 h-4 text-teal-400" /> },
    orange: { dot: "bg-orange-400", badge: "bg-orange-500/20 text-orange-300", header: "bg-orange-500/5", icon: "text-orange-400", val: "text-orange-300", icoCls: <ArrowUpRight className="w-4 h-4 text-orange-400" /> },
  }[color];

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
      <div className={`p-3 border-b border-white/5 flex items-center gap-2 ${colorMap.header}`}>
        {colorMap.icoCls}
        <h3 className="font-bold text-white text-sm">{title}</h3>
        <div className="ml-auto flex items-center gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 text-xs text-white outline-none">
            {STATUSES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <span className={`text-xs ${colorMap.badge} px-2 py-0.5 rounded-full font-bold`}>
            {isLoading ? "..." : items.length}
          </span>
        </div>
      </div>
      <div className="divide-y divide-white/5 flex-1 overflow-y-auto max-h-72">
        {isLoading ? (
          <LoadingPanel />
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-8">Nenhum lançamento encontrado</p>
        ) : (
          items.slice(0, 8).map((c, i) => {
            const diasAtraso = Math.floor((Date.now() - new Date(c.vencimento).getTime()) / 86400000);
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                <div className={`w-1.5 h-1.5 ${colorMap.dot} rounded-full shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {diasAtraso > 0 ? `${diasAtraso}d em atraso · ` : ""}vcto {new Date(c.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <p className={`text-sm font-bold ${colorMap.val} shrink-0`}>
                  {tipo === "CP" ? "- " : ""}{formatCurrency(c.valor)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [anoFluxo] = useState(new Date().getFullYear());

  const { data: kpis, isLoading: kpisLoading } = useQuery<KPIs>({
    queryKey: ["dashboard-kpis"],
    queryFn: () => fetchApi("/dashboard/kpis"),
    refetchInterval: 60000,
  });

  const { data: projecao } = useQuery<ProjecaoMes>({
    queryKey: ["dashboard-projecao-mes"],
    queryFn: () => fetchApi("/dashboard/projecao-mes"),
  });

  const { data: fluxoCaixa = [], isLoading: fluxoLoading } = useQuery<FluxoMes[]>({
    queryKey: ["dashboard-fluxo", anoFluxo],
    queryFn: () => fetchApi(`/dashboard/fluxo-caixa-mensal?ano=${anoFluxo}`),
  });

  const { data: alertasRisco = [] } = useQuery<AlertaRisco[]>({
    queryKey: ["dashboard-nivel-risco"],
    queryFn: () => fetchApi("/dashboard/nivel-risco"),
  });

  const { data: saidasPlano = [] } = useQuery<PlanoItem[]>({
    queryKey: ["dashboard-saidas-plano"],
    queryFn: () => fetchApi("/dashboard/saidas-plano-contas"),
  });

  const { data: entradasPlano = [] } = useQuery<PlanoItem[]>({
    queryKey: ["dashboard-entradas-plano"],
    queryFn: () => fetchApi("/dashboard/entradas-plano-contas"),
  });

  const [filterLevel, setFilterLevel] = useState<number | "all">("all");

  const filteredAlertasRisco = alertasRisco.filter(a => {
    if (a.tipo !== "CP") return false;
    if (filterLevel === "all") return true;
    
    const d = a.dias || 0;
    if (filterLevel === 1) return d >= 1 && d <= 15;
    if (filterLevel === 2) return d >= 16 && d <= 30;
    if (filterLevel === 3) return d >= 31 && d <= 60;
    if (filterLevel === 4) return d > 60;
    return true;
  });

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Painel de Controle"
        description="Visão geral financeira e indicadores da ISM Tecnologia"
        actions={
          <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
            <Download className="w-4 h-4" /> Exportar Relatório
          </button>
        }
      />

      {/* KPIs */}
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
            <KPICard label="A Receber (Mês Atual)" value={formatCurrency(kpis?.contasReceberAberto ?? 0)} icon={<ArrowDownRight className="w-5 h-5" />} color="text-teal-400"
              sub={projecao ? `Projeção: ${formatCurrency(projecao.projecaoRecebimentos)}` : undefined} />
            <KPICard label="A Pagar (Mês Atual)" value={formatCurrency(kpis?.contasPagarAberto ?? 0)} icon={<ArrowUpRight className="w-5 h-5" />} color="text-orange-400"
              sub={projecao ? `Projeção: ${formatCurrency(projecao.projecaoPagamentos)}` : undefined} />
            <KPICard label="CR Vencidos (A Receber)" value={formatCurrency(kpis?.contasReceberAtraso ?? 0)} icon={<AlertCircle className="w-5 h-5" />} color="text-destructive" />
            <KPICard label="CP Vencidos (A Pagar)" value={formatCurrency(kpis?.contasPagarAtraso ?? 0)} icon={<Clock className="w-5 h-5" />} color="text-warning"
              sub={projecao ? `Saldo líquido: ${formatCurrency(projecao.projecaoLucroLiquido)}` : undefined} />
          </>
        )}
      </div>

      {/* Contas a Receber / Contas a Pagar com filtros */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ContasPanel tipo="CR" title="Contas a Receber" color="teal" tab="vencidos" />
        <ContasPanel tipo="CP" title="Contas a Pagar" color="orange" tab="vencidos" />
      </div>

      {/* Alertas de Inadimplência e Risco — 100% fiel ao modelo */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-destructive/20 shadow-xl shadow-destructive/5">
        <div className="p-4 border-b border-white/5 bg-destructive/10 flex items-center gap-2">
          <div className="p-1.5 bg-destructive/20 border border-destructive/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <h3 className="font-bold text-white text-sm">Alertas de Inadimplência e Risco (Contas a Pagar)</h3>
          <div className="ml-auto flex items-center gap-3">
            <select 
              value={filterLevel} 
              onChange={e => setFilterLevel(e.target.value === "all" ? "all" : parseInt(e.target.value))}
              className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-primary/50"
            >
              <option value="all">Todos Níveis</option>
              <option value={1}>Nível 1 (1-15 dias)</option>
              <option value={2}>Nível 2 (16-30 dias)</option>
              <option value={3}>Nível 3 (31-60 dias)</option>
              <option value={4}>Nível 4 (&gt; 60 dias)</option>
            </select>
            <span className="text-[10px] bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              {filteredAlertasRisco.length} ocorrências
            </span>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {filteredAlertasRisco.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-40">
              <ShieldAlert className="w-12 h-12" />
              <p className="text-center text-sm font-medium">Nenhum risco filtrado registrado</p>
            </div>
          ) : (
            filteredAlertasRisco.map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.04] transition-all group border-l-2 border-transparent hover:border-l-destructive">
                {/* Dot colorido: CP = vermelho */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-lg bg-destructive shadow-destructive/20`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{a.nome || "Não identificado"}</p>
                  <p className="text-xs text-secondary-foreground/60 mt-0.5">
                    Contas a Pagar · {Math.max(0, a.dias || 0)} dias em atraso
                  </p>
                </div>

                {/* Tags de risco */}
                <div className="hidden md:flex flex-wrap gap-2 justify-end max-w-[40%]">
                  {a.riscos?.map((r) => {
                    const cfg = RISK_CONFIG[r] ?? { label: r, icon: <Ban className="w-3 h-3" />, cls: "bg-white/10 text-white border-white/20" };
                    return (
                      <span key={r} className={`text-[10px] px-2.5 py-1 rounded-full font-bold border flex items-center gap-1.5 ${cfg.cls} shadow-sm`}>
                        {cfg.icon}
                        <span className="uppercase tracking-tighter">{cfg.label}</span>
                      </span>
                    );
                  })}
                </div>

                {/* Valor */}
                <p className="text-sm font-black shrink-0 ml-4 text-orange-400 font-mono">
                  {formatCurrency(a.valor)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Fluxo de Caixa Anual */}
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
                  <YAxis stroke="#ffffff50" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={v => v >= 1000000 ? `R$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`} />
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
                      <Pie data={saidasPlano} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                        paddingAngle={4} dataKey="valor" nameKey="categoria" stroke="none">
                        {saidasPlano.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend layout="vertical" verticalAlign="middle" align="right"
                        wrapperStyle={{ fontSize: "10px", color: "#fff" }}
                        formatter={(v: string) => v.length > 15 ? v.slice(0, 15) + "…" : v} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabelas de categorias laterais */}
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
