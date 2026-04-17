import React, { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type FluxoRow = { label: string; tipo: "titulo" | "item" | "subtotal" | "total"; valores: number[]; negativo?: boolean };

const fluxoData: FluxoRow[] = [
  { label: "ENTRADAS OPERACIONAIS", tipo: "titulo", valores: [] },
  { label: "Recebimento de Clientes", tipo: "item", valores: [105000, 128000, 119000, 126000, 135000, 142000, 130000, 140000, 148000, 152000, 145000, 160000] },
  { label: "Recebimentos Antecipados", tipo: "item", valores: [8000, 5000, 12000, 7000, 5000, 8000, 6000, 9000, 5000, 7000, 8000, 5000] },
  { label: "TOTAL ENTRADAS", tipo: "subtotal", valores: [113000, 133000, 131000, 133000, 140000, 150000, 136000, 149000, 153000, 159000, 153000, 165000] },
  { label: "SAÍDAS OPERACIONAIS", tipo: "titulo", valores: [] },
  { label: "Pagamento Fornecedores", tipo: "item", negativo: true, valores: [54200, 56800, 57500, 58100, 57200, 59000, 58000, 60000, 61000, 62000, 60000, 65000] },
  { label: "Despesas Administrativas", tipo: "item", negativo: true, valores: [8000, 8200, 7500, 8100, 7900, 8300, 8000, 8200, 8100, 8300, 8200, 8500] },
  { label: "Impostos e Tributos", tipo: "item", negativo: true, valores: [9412, 10302, 9905, 10238, 11090, 12375, 10500, 11200, 11500, 12000, 11800, 12500] },
  { label: "Ocupação", tipo: "item", negativo: true, valores: [3200, 3200, 3200, 3200, 3200, 3200, 3200, 3200, 3200, 3200, 3200, 3200] },
  { label: "TOTAL SAÍDAS", tipo: "subtotal", negativo: true, valores: [74812, 78502, 78105, 79638, 79390, 82875, 79700, 82600, 83800, 85500, 83200, 89700] },
  { label: "FLUXO OPERACIONAL LÍQUIDO", tipo: "total", valores: [38188, 54498, 52895, 53362, 60610, 67125, 56300, 66400, 69200, 73500, 69800, 75300] },
  { label: "SALDO INICIAL", tipo: "item", valores: [150000, 188188, 242686, 295581, 348943, 409553, 476678, 532978, 599378, 668578, 742078, 811878] },
  { label: "SALDO FINAL", tipo: "total", valores: [188188, 242686, 295581, 348943, 409553, 476678, 532978, 599378, 668578, 742078, 811878, 887178] },
];

const chartData = meses.map((m, i) => ({
  mes: m,
  entradas: fluxoData.find(r => r.label === "TOTAL ENTRADAS")!.valores[i],
  saidas: fluxoData.find(r => r.label === "TOTAL SAÍDAS")!.valores[i],
  saldo: fluxoData.find(r => r.label === "SALDO FINAL")!.valores[i],
}));

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
        <p className="text-white font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm font-medium">
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

import { useQuery } from "@tanstack/react-query";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format, startOfYear, endOfYear } from "date-fns";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function FluxoCaixa() {
  const [dateStart, setDateStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const ano = new Date(dateStart).getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-fluxo", ano],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/relatorios/fluxo-caixa?ano=${ano}`);
      if (!res.ok) throw new Error("Erro ao buscar Fluxo de Caixa");
      return res.json();
    }
  });

  const secoes = data?.secoes || [];
  
  // Converte as seções para o formato que o gráfico e a tabela esperam
  const chartData = meses.map((m, i) => {
    const entradas = secoes.find((s: any) => s.tipo === "entradas")?.linhas[0]?.valores[i] || 0;
    const saidas = secoes.find((s: any) => s.tipo === "saidas")?.linhas[0]?.valores[i] || 0;
    const saldo = secoes.find((s: any) => s.tipo === "saldo_final")?.linhas[0]?.valores[i] || 0;
    return { mes: m, entradas, saidas: Math.abs(saidas), saldo };
  });

  const getRowStyle = (tipo: string) => {
    switch (tipo) {
      case "total": return "text-white font-bold bg-primary/10 border-t border-primary/20";
      case "saldo_final": return "text-white font-black bg-primary/20 scale-[1.01] shadow-lg ring-1 ring-primary/20";
      default: return "text-muted-foreground hover:bg-white/5 transition-colors";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="Demonstrativo de entradas e saídas financeiras"
        actions={
          <div className="flex gap-3">
            <DateRangePicker 
              startDate={dateStart} 
              endDate={dateEnd} 
              onChange={(start, end) => {
                setDateStart(start);
                setDateEnd(end);
              }}
            />
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      <div className="glass-panel rounded-2xl p-6">
        <h3 className="font-bold text-white mb-6">Evolução do Saldo de Caixa — {ano}</h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3BA8DC" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3BA8DC" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#27AE60" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#27AE60" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="mes" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              <Area type="monotone" dataKey="saldo" name="Saldo Final" stroke="#3BA8DC" strokeWidth={2} fill="url(#colorSaldo)" />
              <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#27AE60" strokeWidth={2} fill="url(#colorEntradas)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-card/90 backdrop-blur-sm min-w-[240px]">Descrição</th>
                {meses.map(m => (
                  <th key={m} className="px-3 py-3 text-right font-medium text-white min-w-[90px]">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {secoes.map((secao: any) => (
                <React.Fragment key={secao.titulo}>
                  <tr className="bg-white/5 text-primary font-bold text-xs uppercase tracking-wider">
                    <td colSpan={meses.length + 1} className="px-4 py-2">{secao.titulo}</td>
                  </tr>
                  {secao.linhas.map((row: any, i: number) => (
                    <tr key={i} className={getRowStyle(secao.tipo)}>
                      <td className={`px-4 py-3 sticky left-0 backdrop-blur-sm ${secao.tipo === 'total' ? 'bg-primary/10' : 'bg-card/60'}`}>
                        <span className="pl-3">{row.label}</span>
                      </td>
                      {row.valores.map((v: number, j: number) => (
                        <td key={j} className={`px-3 py-3 text-right ${secao.tipo === 'total' || secao.tipo === 'saldo_final' ? (v >= 0 ? 'text-success' : 'text-destructive') : row.negativo ? 'text-destructive' : v === 0 ? 'text-muted-foreground/30' : 'text-white'}`}>
                          {v !== 0 ? (row.negativo ? `-${formatCurrency(v)}` : formatCurrency(v)) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
