import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  ArrowDownRight, ArrowUpRight, AlertCircle, Clock, Download,
  AlertTriangle, Gavel, FileX, ShieldAlert, Ban
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const saldosContas = [
  { banco: "Itaú CC", agencia: "1234", conta: "56789-0", saldo: 215430.50 },
  { banco: "Bradesco CC", agencia: "4321", conta: "98765-4", saldo: 87200.00 },
  { banco: "Nubank PJ", agencia: "0001", conta: "11223344-5", saldo: 42000.00 },
];
const totalSaldo = saldosContas.reduce((a, c) => a + c.saldo, 0);

const contasPagar = [
  { id: 1, descricao: "AWS Cloud Services", parceiro: "Amazon Web Services", vencimento: "10/10/2023", valor: 4500, status: "vencido", diasAtraso: 165 },
  { id: 2, descricao: "Materiais de Escritório", parceiro: "Office Supplies Ltda", vencimento: "20/10/2023", valor: 850, status: "vencido", diasAtraso: 155 },
  { id: 3, descricao: "Serviços Dev", parceiro: "João Silva", vencimento: "25/10/2023", valor: 8000, status: "pendente", diasAtraso: 0 },
  { id: 4, descricao: "Aluguel Outubro", parceiro: "Imobiliária Central", vencimento: "05/10/2023", valor: 3200, status: "pago", diasAtraso: 0 },
];

const contasReceber = [
  { id: 1, descricao: "Mensalidade Outubro", parceiro: "Tech Solutions S.A.", vencimento: "15/10/2023", valor: 15000, status: "vencido", diasAtraso: 160 },
  { id: 2, descricao: "Projeto Setup", parceiro: "Global Industries", vencimento: "05/10/2023", valor: 35000, status: "vencido", diasAtraso: 170 },
  { id: 3, descricao: "Consultoria", parceiro: "Alpha Consultoria", vencimento: "30/10/2023", valor: 22000, status: "pendente", diasAtraso: 0 },
  { id: 4, descricao: "Suporte TI", parceiro: "Inova Sistemas", vencimento: "28/10/2023", valor: 8500, status: "recebido", diasAtraso: 0 },
];

const alertasAtraso = [
  { id: 1, parceiro: "Tech Solutions S.A.", valor: 15000, diasAtraso: 160, riscos: ["Protesto", "Ação Judicial"], tipo: "cr" },
  { id: 2, parceiro: "Global Industries", valor: 35000, diasAtraso: 170, riscos: ["Ação Judicial", "Bloqueio de Certidão"], tipo: "cr" },
  { id: 3, parceiro: "Amazon Web Services", valor: 4500, diasAtraso: 165, riscos: ["Protesto"], tipo: "cp" },
  { id: 4, parceiro: "Office Supplies Ltda", valor: 850, diasAtraso: 155, riscos: ["Impedimento de Certidão"], tipo: "cp" },
];

const diasAtrasoPorParceiro = alertasAtraso.map(a => ({ nome: a.parceiro.split(" ")[0], dias: a.diasAtraso, valor: a.valor }));

const riscoData = [
  { name: "Protesto", value: 2, color: "#E74C3C" },
  { name: "Ação Judicial", value: 2, color: "#F39C12" },
  { name: "Bloqueio Certidão", value: 1, color: "#E67E22" },
  { name: "Impedimento Certidão", value: 1, color: "#8B5CF6" },
];

const fluxoCaixaData = [
  { mes: "Jan", entradas: 120000, saidas: 90000 },
  { mes: "Fev", entradas: 135000, saidas: 95000 },
  { mes: "Mar", entradas: 140000, saidas: 105000 },
  { mes: "Abr", entradas: 130000, saidas: 110000 },
  { mes: "Mai", entradas: 155000, saidas: 98000 },
  { mes: "Jun", entradas: 165000, saidas: 102000 },
];

const saidasPlanoContas = [
  { name: "Folha PJ", value: 45000, color: "#3BA8DC" },
  { name: "Fornecedores CSP", value: 25000, color: "#E67E22" },
  { name: "Impostos", value: 15000, color: "#E74C3C" },
  { name: "Despesas Admin", value: 10000, color: "#F39C12" },
];

const riskIcons: Record<string, React.ReactNode> = {
  "Protesto": <Gavel className="w-3 h-3" />,
  "Ação Judicial": <ShieldAlert className="w-3 h-3" />,
  "Impedimento de Certidão": <FileX className="w-3 h-3" />,
  "Bloqueio de Certidão": <Ban className="w-3 h-3" />,
  "Bloqueios": <Ban className="w-3 h-3" />,
};

const riskColors: Record<string, string> = {
  "Protesto": "bg-destructive/20 text-destructive border-destructive/30",
  "Ação Judicial": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Impedimento de Certidão": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Bloqueio de Certidão": "bg-warning/20 text-warning border-warning/30",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
        <p className="text-white font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm font-medium">
            {entry.name}: {typeof entry.value === "number" && entry.value > 1000 ? formatCurrency(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

type CpCrFilter = "todos" | "vencido" | "pendente" | "pago" | "recebido";

export default function Dashboard() {
  const [filterCP, setFilterCP] = useState<CpCrFilter>("todos");
  const [filterCR, setFilterCR] = useState<CpCrFilter>("todos");

  const filteredCP = filterCP === "todos" ? contasPagar : contasPagar.filter(c => c.status === filterCP);
  const filteredCR = filterCR === "todos" ? contasReceber : contasReceber.filter(c => c.status === filterCR);

  return (
    <div className="space-y-6 pb-12">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Saldo Total Bancos", value: formatCurrency(totalSaldo), icon: <Clock className="w-5 h-5" />, color: "text-primary", trend: null },
          { label: "A Receber em Aberto", value: formatCurrency(contasReceber.filter(c => c.status !== "recebido").reduce((a, b) => a + b.valor, 0)), icon: <ArrowDownRight className="w-5 h-5" />, color: "text-teal-400", trend: "+8%" },
          { label: "A Pagar em Aberto", value: formatCurrency(contasPagar.filter(c => c.status !== "pago").reduce((a, b) => a + b.valor, 0)), icon: <ArrowUpRight className="w-5 h-5" />, color: "text-orange-400", trend: "-3%" },
          { label: "Vencidos (CP+CR)", value: formatCurrency([...contasPagar, ...contasReceber].filter(c => c.status === "vencido").reduce((a, b) => a + b.valor, 0)), icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", trend: null },
        ].map(kpi => (
          <div key={kpi.label} className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase font-bold tracking-wider">{kpi.label}</p>
              <span className={kpi.color}>{kpi.icon}</span>
            </div>
            <p className={`text-lg sm:text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            {kpi.trend && <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{kpi.trend} vs. último mês</p>}
          </div>
        ))}
      </div>

      {/* Saldo das Contas + Tabelas CP/CR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Saldo por Conta */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/5">
            <h3 className="font-bold text-white text-sm">Saldo das Contas Bancárias</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Banco / Conta</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {saldosContas.map((c, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 min-w-[150px]">
                      <p className="font-medium text-white text-xs">{c.banco}</p>
                      <p className="text-[11px] text-muted-foreground">Ag: {c.agencia} | CC: {c.conta}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary text-sm">{formatCurrency(c.saldo)}</td>
                  </tr>
                ))}
                <tr className="bg-primary/5 border-t border-primary/20">
                  <td className="px-4 py-3 font-bold text-white text-xs">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(totalSaldo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Contas a Pagar */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
            <h3 className="font-bold text-white text-sm truncate">Contas a Pagar</h3>
            <select value={filterCP} onChange={e => setFilterCP(e.target.value as CpCrFilter)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white outline-none shrink-0">
              <option value="todos">Todos</option>
              <option value="vencido">Vencidos</option>
              <option value="pendente">Pendentes</option>
              <option value="pago">Pagos</option>
            </select>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Descrição</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredCP.map(c => (
                  <tr key={c.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="text-white text-xs font-medium">{c.descricao}</p>
                      <p className="text-[11px] text-muted-foreground">{c.parceiro} · {c.vencimento}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.status === "vencido" ? "bg-destructive/20 text-destructive" : c.status === "pago" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                        {c.status === "vencido" ? `Vencido (${c.diasAtraso}d)` : c.status === "pago" ? "Pago" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-destructive text-sm">{formatCurrency(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contas a Receber */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
            <h3 className="font-bold text-white text-sm truncate">Contas a Receber</h3>
            <select value={filterCR} onChange={e => setFilterCR(e.target.value as CpCrFilter)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white outline-none shrink-0">
              <option value="todos">Todos</option>
              <option value="vencido">Vencidos</option>
              <option value="pendente">Pendentes</option>
              <option value="recebido">Recebidos</option>
            </select>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Descrição</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredCR.map(c => (
                  <tr key={c.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="text-white text-xs font-medium">{c.descricao}</p>
                      <p className="text-[11px] text-muted-foreground">{c.parceiro} · {c.vencimento}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.status === "vencido" ? "bg-destructive/20 text-destructive" : c.status === "recebido" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                        {c.status === "vencido" ? `Vencido (${c.diasAtraso}d)` : c.status === "recebido" ? "Recebido" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-teal-400 text-sm">{formatCurrency(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Alertas de Atraso / Risco */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-destructive/20">
        <div className="p-4 border-b border-white/5 bg-destructive/5 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h3 className="font-bold text-white text-sm">Alertas de Inadimplência e Risco</h3>
          </div>
          <span className="sm:ml-auto text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-bold w-fit">{alertasAtraso.length} ocorrências</span>
        </div>
        <div className="divide-y divide-white/5">
          {alertasAtraso.map(a => (
            <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4 sm:py-3 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${a.tipo === "cr" ? "bg-teal-400" : "bg-destructive"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{a.parceiro}</p>
                  <p className="text-[11px] text-muted-foreground">{a.tipo === "cr" ? "A Receber" : "A Pagar"} · {a.diasAtraso} dias em atraso</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {a.riscos.map(r => (
                  <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${riskColors[r] || "bg-white/10 text-white border-white/20"}`}>
                    {riskIcons[r]} {r}
                  </span>
                ))}
              </div>
              <p className="text-sm font-bold text-destructive shrink-0 text-right sm:text-left">{formatCurrency(a.valor)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gráficos de Atraso */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="font-bold text-white text-sm mb-4">Dias em Atraso por Parceiro</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={diasAtrasoPorParceiro} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="nome" stroke="#ffffff50" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={11} tickLine={false} axisLine={false} unit="d" />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff05" }} />
                <Bar dataKey="dias" name="Dias em Atraso" fill="#E74C3C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <h3 className="font-bold text-white text-sm mb-4">Nível de Risco por Tipo</h3>
          <div className="h-[250px] sm:h-[220px] flex flex-col sm:flex-row gap-4 items-center">
            <div className="w-full sm:flex-1 h-full min-h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={riscoData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value" stroke="none">
                    {riscoData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
              {riscoData.map(r => (
                <div key={r.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-[10px] text-muted-foreground truncate">{r.name}</span>
                  <span className="text-[10px] font-bold text-white ml-auto">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Visão Financeira Anual */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="font-bold text-white text-sm mb-5">Fluxo de Caixa — Visão Anual</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fluxoCaixaData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }} barSize={18} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="mes" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `R$${v / 1000}k`} />
                <RechartsTooltip cursor={{ fill: "#ffffff05" }} content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="entradas" name="Entradas" fill="#27AE60" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill="#E74C3C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[260px] flex flex-col">
            <p className="text-xs text-center text-muted-foreground mb-2">Saídas por Categoria</p>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={saidasPlanoContas} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">
                    {saidasPlanoContas.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "11px", color: "#fff" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
