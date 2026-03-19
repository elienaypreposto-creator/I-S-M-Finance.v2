import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download, FileText, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const lancamentos = [
  { data: "05/06/2024", documento: "NFS-001234", descricao: "Prestação de Serviços - Tech Solutions", conta: "1.01 Receita de Serviços", debito: null, credito: 15000, historico: "Mensalidade Junho/2024" },
  { data: "10/06/2024", documento: "NFS-001235", descricao: "Projeto Implementação - Global Ind.", conta: "1.01 Receita de Serviços", debito: null, credito: 35000, historico: "Projeto Setup" },
  { data: "25/06/2024", documento: "NF-004567", descricao: "AWS - Serviços de Cloud", conta: "2.02 Fornecedores CSP", debito: 4500, credito: null, historico: "Hospedagem Junho" },
  { data: "28/06/2024", documento: "RPA-00089", descricao: "Pagamento PJ - Dev Sr.", conta: "2.01 Folha PJ", debito: 8000, credito: null, historico: "Competência Junho" },
  { data: "30/06/2024", documento: "NF-004601", descricao: "Aluguel Sala Comercial", conta: "3.03 Ocupação", debito: 3200, credito: null, historico: "Junho/2024" },
  { data: "30/06/2024", documento: "TRANSF-001", descricao: "Transferência ISS Retido", conta: "3.01 Administrativas", debito: 1800, credito: null, historico: "ISS Junho" },
  { data: "30/06/2024", documento: "NFS-001236", descricao: "Serviços Consultoria - Alpha", conta: "1.01 Receita de Serviços", debito: null, credito: 22000, historico: "Junho/2024" },
  { data: "15/06/2024", documento: "NF-004580", descricao: "Material de Escritório", conta: "3.01 Administrativas", debito: 850, credito: null, historico: "Compras Junho" },
];

const impostos = [
  { nome: "ISS", base: 72000, aliquota: 2.5, valor: 1800, vencimento: "10/07/2024", status: "pendente" },
  { nome: "COFINS", base: 72000, aliquota: 3, valor: 2160, vencimento: "15/07/2024", status: "pendente" },
  { nome: "PIS", base: 72000, aliquota: 0.65, valor: 468, vencimento: "15/07/2024", status: "pendente" },
  { nome: "CSLL", base: 20400, aliquota: 9, valor: 1836, vencimento: "30/07/2024", status: "pendente" },
  { nome: "IRPJ", base: 20400, aliquota: 15, valor: 3060, vencimento: "30/07/2024", status: "pendente" },
];

export default function ContabilFiscal() {
  const [tab, setTab] = useState<"livro" | "impostos">("livro");
  const totalDebito = lancamentos.reduce((a, l) => a + (l.debito || 0), 0);
  const totalCredito = lancamentos.reduce((a, l) => a + (l.credito || 0), 0);
  const totalImpostos = impostos.reduce((a, i) => a + i.valor, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório Contábil / Fiscal"
        description="Livro razão, lançamentos contábeis e obrigações fiscais"
        actions={
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Filter className="w-4 h-4" /> Filtros
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button onClick={() => setTab("livro")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "livro" ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>
          Livro Razão
        </button>
        <button onClick={() => setTab("impostos")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "impostos" ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>
          Obrigações Fiscais
        </button>
      </div>

      {tab === "livro" && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white">Livro Razão — Junho 2024</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{lancamentos.length} lançamentos no período</p>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-xs text-muted-foreground">Total Débitos</p>
                <p className="font-bold text-destructive">{formatCurrency(totalDebito)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Créditos</p>
                <p className="font-bold text-success">{formatCurrency(totalCredito)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className={`font-bold ${totalCredito - totalDebito >= 0 ? 'text-teal-400' : 'text-destructive'}`}>{formatCurrency(totalCredito - totalDebito)}</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Documento</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Conta</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Histórico</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Débito</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Crédito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lancamentos.map((l, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{l.data}</td>
                    <td className="px-4 py-3 text-primary font-mono text-xs">{l.documento}</td>
                    <td className="px-4 py-3 text-white max-w-[200px]">{l.descricao}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.conta}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.historico}</td>
                    <td className="px-4 py-3 text-right font-medium text-destructive">{l.debito ? formatCurrency(l.debito) : "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-success">{l.credito ? formatCurrency(l.credito) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-white/5 border-t border-white/10">
                <tr>
                  <td colSpan={5} className="px-4 py-3 font-bold text-white">TOTAIS</td>
                  <td className="px-4 py-3 text-right font-bold text-destructive">{formatCurrency(totalDebito)}</td>
                  <td className="px-4 py-3 text-right font-bold text-success">{formatCurrency(totalCredito)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {tab === "impostos" && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Obrigações Fiscais — Junho 2024</h3>
              <span className="text-sm font-bold text-destructive">{formatCurrency(totalImpostos)} a recolher</span>
            </div>
            <div className="space-y-3">
              {impostos.map((imp, i) => (
                <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg text-sm">{imp.nome}</span>
                    <div>
                      <p className="text-sm text-white">Base: <span className="font-medium">{formatCurrency(imp.base)}</span></p>
                      <p className="text-xs text-muted-foreground">Alíquota: {imp.aliquota}%</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-warning">{formatCurrency(imp.valor)}</p>
                    <p className="text-xs text-muted-foreground">Venc: {imp.vencimento}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
