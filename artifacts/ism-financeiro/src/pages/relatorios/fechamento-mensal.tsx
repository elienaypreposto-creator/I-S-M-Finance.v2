import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download, FileText, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const fechamentos = [
  { mes: 5, ano: 2024, status: "fechado", receitas: 143500, custos: 59000, despesas: 18300, resultado: 66200 },
  { mes: 4, ano: 2024, status: "fechado", receitas: 139000, custos: 57200, despesas: 17900, resultado: 63900 },
  { mes: 3, ano: 2024, status: "fechado", receitas: 132000, custos: 58100, despesas: 18100, resultado: 55800 },
  { mes: 2, ano: 2024, status: "fechado", receitas: 127800, custos: 57500, despesas: 17500, resultado: 52800 },
  { mes: 1, ano: 2024, status: "fechado", receitas: 131200, custos: 56800, despesas: 18200, resultado: 56200 },
  { mes: 0, ano: 2024, status: "fechado", receitas: 118500, custos: 54200, despesas: 17800, resultado: 46500 },
];

const lancamentosAbertos = [
  { id: 1, descricao: "Mensalidade Tech Solutions", valor: 15000, vencimento: "30/06/2024", tipo: "cr" },
  { id: 2, descricao: "Hospedagem AWS Junho", valor: -4500, vencimento: "25/06/2024", tipo: "cp" },
  { id: 3, descricao: "Salários PJ Junho", valor: -44000, vencimento: "30/06/2024", tipo: "cp" },
  { id: 4, descricao: "Projeto Global Industries", valor: 35000, vencimento: "28/06/2024", tipo: "cr" },
];

export default function FechamentoMensal() {
  const [mesSelecionado, setMesSelecionado] = useState(5);
  const [anoSelecionado, setAnoSelecionado] = useState(2024);
  const fechamentoAtual = fechamentos.find(f => f.mes === mesSelecionado && f.ano === anoSelecionado);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fechamento Mensal"
        description="Consolidação e fechamento contábil mensal"
        actions={
          <div className="flex gap-3">
            <select value={mesSelecionado} onChange={e => setMesSelecionado(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none">
              {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={anoSelecionado} onChange={e => setAnoSelecionado(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none">
              <option value={2024}>2024</option>
              <option value={2023}>2023</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
          </div>
        }
      />

      {fechamentoAtual ? (
        <>
          <div className="glass-panel rounded-2xl p-6 border border-success/20">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-5 h-5 text-success" />
              <h3 className="font-bold text-white">Fechamento de {meses[mesSelecionado]} {anoSelecionado} — Concluído</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Receitas", value: fechamentoAtual.receitas, color: "text-teal-400" },
                { label: "Total Custos (CSP)", value: -fechamentoAtual.custos, color: "text-destructive" },
                { label: "Total Despesas", value: -fechamentoAtual.despesas, color: "text-orange-400" },
                { label: "Resultado Líquido", value: fechamentoAtual.resultado, color: "text-success" },
              ].map(item => (
                <div key={item.label} className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>{formatCurrency(Math.abs(item.value))}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="font-bold text-white">Histórico de Fechamentos</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Período</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">Receitas</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">Custos+Despesas</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">Resultado</th>
                    <th className="px-5 py-3 text-center font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {fechamentos.map((f, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4 font-semibold text-white">{meses[f.mes]} {f.ano}</td>
                      <td className="px-5 py-4 text-right text-teal-400 font-medium">{formatCurrency(f.receitas)}</td>
                      <td className="px-5 py-4 text-right text-destructive font-medium">{formatCurrency(f.custos + f.despesas)}</td>
                      <td className="px-5 py-4 text-right font-bold text-success">{formatCurrency(f.resultado)}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-1 text-xs bg-success/20 text-success px-2 py-1 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Fechado
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors ml-auto">
                          <FileText className="w-3 h-3" /> Ver PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="glass-panel rounded-2xl p-6 border border-warning/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
            <div>
              <h3 className="font-bold text-white mb-1">Fechamento em Aberto — {meses[mesSelecionado]} {anoSelecionado}</h3>
              <p className="text-sm text-muted-foreground mb-4">Existem {lancamentosAbertos.length} lançamentos pendentes de aprovação antes do fechamento.</p>
              <div className="space-y-2 mb-4">
                {lancamentosAbertos.map(l => (
                  <div key={l.id} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${l.tipo === 'cr' ? 'bg-teal-400' : 'bg-destructive'}`} />
                      <span className="text-sm text-white">{l.descricao}</span>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${l.valor > 0 ? 'text-teal-400' : 'text-destructive'}`}>{formatCurrency(Math.abs(l.valor))}</p>
                      <p className="text-xs text-muted-foreground">{l.vencimento}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="flex items-center gap-2 px-6 py-2.5 bg-warning hover:bg-warning/90 text-black rounded-xl text-sm font-bold transition-all">
                <CheckCircle className="w-4 h-4" /> Aprovar e Fechar Mês
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
