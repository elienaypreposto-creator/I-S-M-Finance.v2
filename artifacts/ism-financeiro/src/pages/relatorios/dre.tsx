import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type DreRow = { label: string; tipo: "titulo" | "item" | "subtotal" | "total"; valores: number[]; negativo?: boolean };

const dreData: DreRow[] = [
  { label: "RECEITA BRUTA", tipo: "titulo", valores: [] },
  { label: "Receita de Serviços", tipo: "item", valores: [118500, 131200, 127800, 132000, 139000, 143500, 0, 0, 0, 0, 0, 0] },
  { label: "Outras Receitas", tipo: "item", valores: [1200, 800, 1500, 900, 1100, 1200, 0, 0, 0, 0, 0, 0] },
  { label: "TOTAL RECEITA BRUTA", tipo: "subtotal", valores: [119700, 132000, 129300, 132900, 140100, 144700, 0, 0, 0, 0, 0, 0] },
  { label: "DEDUÇÕES", tipo: "titulo", valores: [] },
  { label: "ISS (2,5%)", tipo: "item", negativo: true, valores: [2993, 3300, 3233, 3323, 3503, 3618, 0, 0, 0, 0, 0, 0] },
  { label: "PIS + COFINS (3,65%)", tipo: "item", negativo: true, valores: [4369, 4818, 4720, 4851, 5114, 5282, 0, 0, 0, 0, 0, 0] },
  { label: "RECEITA LÍQUIDA", tipo: "total", valores: [112338, 123882, 121347, 124726, 131483, 135800, 0, 0, 0, 0, 0, 0] },
  { label: "CUSTOS (CSP)", tipo: "titulo", valores: [] },
  { label: "Folha PJ", tipo: "item", negativo: true, valores: [40000, 40000, 42000, 42000, 44000, 44000, 0, 0, 0, 0, 0, 0] },
  { label: "Fornecedores CSP", tipo: "item", negativo: true, valores: [14200, 16800, 15500, 16100, 13200, 15000, 0, 0, 0, 0, 0, 0] },
  { label: "LUCRO BRUTO", tipo: "total", valores: [58138, 67082, 63847, 66626, 74283, 76800, 0, 0, 0, 0, 0, 0] },
  { label: "DESPESAS OPERACIONAIS", tipo: "titulo", valores: [] },
  { label: "Despesas Administrativas", tipo: "item", negativo: true, valores: [8000, 8200, 7500, 8100, 7900, 8300, 0, 0, 0, 0, 0, 0] },
  { label: "Ocupação (Aluguel)", tipo: "item", negativo: true, valores: [3200, 3200, 3200, 3200, 3200, 3200, 0, 0, 0, 0, 0, 0] },
  { label: "Despesa Pessoal CLT", tipo: "item", negativo: true, valores: [5000, 5000, 5000, 5000, 5000, 5000, 0, 0, 0, 0, 0, 0] },
  { label: "Despesas Financeiras", tipo: "item", negativo: true, valores: [1600, 2000, 1800, 1900, 1700, 1800, 0, 0, 0, 0, 0, 0] },
  { label: "EBITDA", tipo: "total", valores: [40338, 48682, 46347, 48426, 56483, 58500, 0, 0, 0, 0, 0, 0] },
  { label: "IRPJ + CSLL (Estimado)", tipo: "item", negativo: true, valores: [6050, 7302, 6952, 7264, 8472, 8775, 0, 0, 0, 0, 0, 0] },
  { label: "RESULTADO LÍQUIDO", tipo: "total", valores: [34288, 41380, 39395, 41162, 48011, 49725, 0, 0, 0, 0, 0, 0] },
];

export default function DreGerencial() {
  const [ano, setAno] = useState(2024);
  const mesAtual = 6;

  const getRowStyle = (tipo: DreRow["tipo"]) => {
    switch (tipo) {
      case "titulo": return "bg-white/5 text-primary font-bold text-xs uppercase tracking-wider";
      case "subtotal": return "text-white font-semibold bg-primary/5";
      case "total": return "text-white font-bold bg-primary/10 border-t border-primary/20";
      default: return "text-muted-foreground hover:bg-white/5 transition-colors";
    }
  };

  const getCellColor = (row: DreRow, val: number) => {
    if (row.tipo === "titulo" || val === 0) return "text-muted-foreground/40";
    if (row.tipo === "total" || row.tipo === "subtotal") return val >= 0 ? "text-success" : "text-destructive";
    if (row.negativo) return "text-destructive";
    return "text-white";
  };

  const totalAnual = (row: DreRow) => row.valores.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DRE Gerencial"
        description="Demonstração do Resultado do Exercício"
        actions={
          <div className="flex gap-3">
            <select value={ano} onChange={e => setAno(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none">
              <option value={2024}>2024</option>
              <option value={2023}>2023</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Receita Líquida Acum.", value: dreData.find(r => r.label === "RECEITA LÍQUIDA")!.valores.filter(v => v > 0).reduce((a, b) => a + b, 0), icon: <TrendingUp className="w-4 h-4" />, color: "text-teal-400" },
          { label: "Lucro Bruto Acum.", value: dreData.find(r => r.label === "LUCRO BRUTO")!.valores.filter(v => v > 0).reduce((a, b) => a + b, 0), icon: <TrendingUp className="w-4 h-4" />, color: "text-primary" },
          { label: "Resultado Líquido Acum.", value: dreData.find(r => r.label === "RESULTADO LÍQUIDO")!.valores.filter(v => v > 0).reduce((a, b) => a + b, 0), icon: <TrendingUp className="w-4 h-4" />, color: "text-success" },
        ].map(item => (
          <div key={item.label} className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={item.color}>{item.icon}</span>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
            <p className={`text-xl font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-card/90 backdrop-blur-sm min-w-[220px]">Descrição</th>
                {meses.map((m, i) => (
                  <th key={m} className={`px-3 py-3 text-right font-medium min-w-[90px] ${i < mesAtual ? 'text-white' : 'text-muted-foreground/40'}`}>{m}</th>
                ))}
                <th className="px-4 py-3 text-right font-bold text-primary min-w-[110px]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {dreData.map((row, i) => (
                <tr key={i} className={getRowStyle(row.tipo)}>
                  <td className={`px-4 py-3 sticky left-0 backdrop-blur-sm ${row.tipo === 'titulo' ? 'bg-white/5' : row.tipo === 'total' ? 'bg-primary/10' : 'bg-card/60'}`}>
                    {row.tipo === "item" ? <span className="pl-3">{row.label}</span> : row.label}
                  </td>
                  {row.tipo === "titulo" ? (
                    <td colSpan={meses.length + 1} />
                  ) : (
                    <>
                      {row.valores.map((v, j) => (
                        <td key={j} className={`px-3 py-3 text-right ${getCellColor(row, v)}`}>
                          {v !== 0 ? (row.negativo ? `-${formatCurrency(v)}` : formatCurrency(v)) : "—"}
                        </td>
                      ))}
                      <td className={`px-4 py-3 text-right font-bold ${getCellColor(row, totalAnual(row))}`}>
                        {totalAnual(row) !== 0 ? (row.negativo ? `-${formatCurrency(totalAnual(row))}` : formatCurrency(totalAnual(row))) : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
