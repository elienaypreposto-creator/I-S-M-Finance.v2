import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download, Target, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const metasData = [
  {
    id: 1, categoria: "Receita Total", tipo: "receita",
    valores: [120000, 125000, 130000, 128000, 135000, 140000, 138000, 142000, 145000, 150000, 148000, 155000],
    realizado: [118500, 131200, 127800, 132000, 139000, 143500, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 2, categoria: "Custos CSP", tipo: "custo",
    valores: [55000, 55000, 57000, 57000, 58000, 58000, 60000, 60000, 60000, 62000, 62000, 65000],
    realizado: [54200, 56800, 57500, 58100, 57200, 59000, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 3, categoria: "Despesas Administrativas", tipo: "despesa",
    valores: [18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000, 18000],
    realizado: [17800, 18200, 17500, 18100, 17900, 18300, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 4, categoria: "Folha de Pagamento PJ", tipo: "custo",
    valores: [40000, 40000, 42000, 42000, 44000, 44000, 44000, 46000, 46000, 46000, 48000, 48000],
    realizado: [40000, 40000, 42000, 42000, 44000, 44000, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 5, categoria: "Lucro Líquido", tipo: "resultado",
    valores: [7000, 12000, 13000, 11000, 15000, 20000, 16000, 18000, 21000, 24000, 20000, 24000],
    realizado: [6500, 16200, 10800, 13900, 19900, 22200, 0, 0, 0, 0, 0, 0],
  },
];

const [anoAtual] = [2024];

function varPercent(meta: number, real: number) {
  if (!real) return null;
  return ((real - meta) / meta) * 100;
}

export default function Metas() {
  const [ano, setAno] = useState(anoAtual);
  const mesAtual = 6;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas Financeiras"
        description="Planejamento orçamentário e acompanhamento de metas"
        actions={
          <div className="flex gap-3">
            <select value={ano} onChange={e => setAno(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none">
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Meta Receita Anual", value: formatCurrency(metasData[0].valores.reduce((a, b) => a + b, 0)), icon: <Target className="w-5 h-5 text-primary" />, color: "text-primary" },
          { label: "Realizado até Junho", value: formatCurrency(metasData[0].realizado.filter(v => v > 0).reduce((a, b) => a + b, 0)), icon: <TrendingUp className="w-5 h-5 text-success" />, color: "text-success" },
          { label: "Lucro Projetado Anual", value: formatCurrency(metasData[4].valores.reduce((a, b) => a + b, 0)), icon: <TrendingUp className="w-5 h-5 text-teal-400" />, color: "text-teal-400" },
          { label: "% Metas Atingidas", value: "4 de 6", icon: <Target className="w-5 h-5 text-orange-400" />, color: "text-orange-400" },
        ].map(item => (
          <div key={item.label} className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">{item.icon}<p className="text-xs text-muted-foreground">{item.label}</p></div>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-bold text-white">Planilha de Metas × Realizado — {ano}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-card/80 backdrop-blur-sm min-w-[200px]">Categoria</th>
                {meses.map((mes, i) => (
                  <th key={mes} className={`px-3 py-3 text-right font-medium min-w-[100px] ${i < mesAtual ? 'text-white' : 'text-muted-foreground'}`}>
                    {mes}
                    {i < mesAtual && <div className="text-[10px] font-normal text-muted-foreground">Real</div>}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold text-white min-w-[120px]">Total Ano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {metasData.map(meta => (
                <>
                  <tr key={`meta-${meta.id}`} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white sticky left-0 bg-card/60 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${meta.tipo === 'receita' ? 'bg-teal-400' : meta.tipo === 'resultado' ? 'bg-primary' : 'bg-destructive'}`} />
                        {meta.categoria}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">META</span>
                      </div>
                    </td>
                    {meta.valores.map((v, i) => (
                      <td key={i} className="px-3 py-3 text-right text-muted-foreground">
                        {formatCurrency(v).replace("R$\u00a0", "R$ ")}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-bold text-white">
                      {formatCurrency(meta.valores.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                  <tr key={`real-${meta.id}`} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-card/60 backdrop-blur-sm">
                      <div className="flex items-center gap-2 pl-4">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Realizado</span>
                      </div>
                    </td>
                    {meta.realizado.map((v, i) => {
                      const vari = v ? varPercent(meta.valores[i], v) : null;
                      const positiveIsBetter = meta.tipo === 'receita' || meta.tipo === 'resultado';
                      const good = vari !== null && (positiveIsBetter ? vari >= 0 : vari <= 0);
                      return (
                        <td key={i} className="px-3 py-3 text-right">
                          {v > 0 ? (
                            <div>
                              <div className={`font-medium ${good ? 'text-success' : 'text-destructive'}`}>
                                {formatCurrency(v).replace("R$\u00a0", "R$ ")}
                              </div>
                              {vari !== null && (
                                <div className={`text-[10px] flex items-center justify-end gap-0.5 ${good ? 'text-success' : 'text-destructive'}`}>
                                  {vari > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : vari < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                                  {Math.abs(vari).toFixed(1)}%
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-bold text-white">
                      {formatCurrency(meta.realizado.filter(v => v > 0).reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
