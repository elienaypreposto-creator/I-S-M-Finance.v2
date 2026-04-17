import { PageHeader } from "@/components/shared/page-header";
import { Download, Target, TrendingUp, TrendingDown, CheckCircle, XCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];

const metasVsRealizado = [
  {
    categoria: "Receita Total",
    meta: 769000, realizado: 792000,
    porMes: meses.map((m, i) => ({
      mes: m,
      meta: [120000, 125000, 130000, 128000, 135000, 140000][i],
      realizado: [118500, 131200, 127800, 132000, 139000, 143500][i],
    })),
    tipo: "receita",
  },
  {
    categoria: "Custos CSP",
    meta: 330000, realizado: 342600,
    porMes: meses.map((m, i) => ({
      mes: m,
      meta: [55000, 55000, 57000, 57000, 58000, 58000][i],
      realizado: [54200, 56800, 57500, 58100, 57200, 59000][i],
    })),
    tipo: "custo",
  },
  {
    categoria: "Lucro Líquido",
    meta: 201000, realizado: 214961,
    porMes: meses.map((m, i) => ({
      mes: m,
      meta: [34000, 36000, 37000, 35000, 28000, 31000][i],
      realizado: [34288, 41380, 39395, 41162, 48011, 49725][i],
    })),
    tipo: "resultado",
  },
];

const indicadores = [
  { nome: "Ticket Médio", meta: 25000, realizado: 26800, unidade: "R$" },
  { nome: "Nº Contratos Ativos", meta: 18, realizado: 21, unidade: "" },
  { nome: "Prazo Médio Recebimento", meta: 25, realizado: 22, unidade: "dias" },
  { nome: "Inadimplência", meta: 3, realizado: 2.1, unidade: "%" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
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
  }
  return null;
};

import { useState } from "react";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format, startOfYear, endOfYear } from "date-fns";

export default function MetasRelatorio() {
  const [dateStart, setDateStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de Metas"
        description="Acompanhamento de metas × realizado por categoria"
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
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {indicadores.map(ind => {
          const positiveIsBetter = ind.nome !== "Prazo Médio Recebimento" && ind.nome !== "Inadimplência";
          const atingido = positiveIsBetter ? ind.realizado >= ind.meta : ind.realizado <= ind.meta;
          const pct = ((ind.realizado / ind.meta) * 100).toFixed(1);
          return (
            <div key={ind.nome} className="glass-panel rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">{ind.nome}</p>
                {atingido ? <CheckCircle className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}
              </div>
              <p className={`text-xl font-bold ${atingido ? 'text-success' : 'text-destructive'}`}>
                {ind.unidade === "R$" ? formatCurrency(ind.realizado) : `${ind.realizado}${ind.unidade}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Meta: {ind.unidade === "R$" ? formatCurrency(ind.meta) : `${ind.meta}${ind.unidade}`}
              </p>
              <div className="mt-2 w-full bg-white/5 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${atingido ? 'bg-success' : 'bg-destructive'}`} style={{ width: `${Math.min(100, Number(pct))}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {metasVsRealizado.map(meta => {
        const variacao = ((meta.realizado - meta.meta) / meta.meta) * 100;
        const positiveIsBetter = meta.tipo === "receita" || meta.tipo === "resultado";
        const atingido = positiveIsBetter ? meta.realizado >= meta.meta : meta.realizado <= meta.meta;

        return (
          <div key={meta.categoria} className="glass-panel rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-primary" />
                  <h3 className="font-bold text-white">{meta.categoria}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${atingido ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                    {atingido ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {atingido ? 'Meta Atingida' : 'Abaixo da Meta'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Acumulado Jan–Jun 2024</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Realizado vs Meta</p>
                <p className={`text-2xl font-bold ${atingido ? 'text-success' : 'text-destructive'}`}>
                  {variacao > 0 ? "+" : ""}{variacao.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">{formatCurrency(meta.realizado)} / {formatCurrency(meta.meta)}</p>
              </div>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={meta.porMes} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={20} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="mes" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="meta" name="Meta" fill="#3BA8DC" fillOpacity={0.5} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                    {meta.porMes.map((entry, i) => (
                      <Cell key={i} fill={entry.realizado >= entry.meta ? '#27AE60' : '#E74C3C'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
