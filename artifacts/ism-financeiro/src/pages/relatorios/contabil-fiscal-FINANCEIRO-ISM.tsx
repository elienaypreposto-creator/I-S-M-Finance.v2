import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Download, FileText, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const lancamentos = [
  { data: "05/06/2024", dataPgto: "05/06/2024", documento: "NFS-001234", descricao: "Prestação de Serviços - Junho", parceiro: "Tech Solutions S.A.", contaBancaria: "Itaú CC 56789-0", valor: 15000, tipo: "cr", categoria: "1.01 Receita de Serviços" },
  { data: "10/06/2024", dataPgto: "10/06/2024", documento: "NFS-001235", descricao: "Projeto Implementação", parceiro: "Global Industries", contaBancaria: "Itaú CC 56789-0", valor: 35000, tipo: "cr", categoria: "1.01 Receita de Serviços" },
  { data: "25/06/2024", dataPgto: "25/06/2024", documento: "NF-004567", descricao: "AWS - Serviços de Cloud", parceiro: "Amazon Web Services", contaBancaria: "Bradesco CC 98765-4", valor: 4500, tipo: "cp", categoria: "2.02 Fornecedores CSP" },
  { data: "28/06/2024", dataPgto: "28/06/2024", documento: "RPA-00089", descricao: "Pagamento PJ - Dev Sr.", parceiro: "João Silva", contaBancaria: "Bradesco CC 98765-4", valor: 8000, tipo: "cp", categoria: "2.01 Folha PJ" },
  { data: "30/06/2024", dataPgto: "30/06/2024", documento: "NF-004601", descricao: "Aluguel Sala Comercial", parceiro: "Imobiliária Central", contaBancaria: "Nubank PJ 11223344-5", valor: 3200, tipo: "cp", categoria: "3.03 Ocupação" },
  { data: "30/06/2024", dataPgto: "30/06/2024", documento: "TRANSF-001", descricao: "ISS Retido Junho", parceiro: "Prefeitura SP", contaBancaria: "Bradesco CC 98765-4", valor: 1800, tipo: "cp", categoria: "3.01 Administrativas" },
  { data: "30/06/2024", dataPgto: "30/06/2024", documento: "NFS-001236", descricao: "Serviços Consultoria", parceiro: "Alpha Consultoria", contaBancaria: "Itaú CC 56789-0", valor: 22000, tipo: "cr", categoria: "1.01 Receita de Serviços" },
  { data: "15/06/2024", dataPgto: "15/06/2024", documento: "NF-004580", descricao: "Material de Escritório", parceiro: "Office Supplies Ltda", contaBancaria: "Nubank PJ 11223344-5", valor: 850, tipo: "cp", categoria: "3.01 Administrativas" },
];

const impostos = [
  { nome: "ISS", base: 72000, aliquota: 2.5, valor: 1800, vencimento: "10/07/2024", status: "pendente" },
  { nome: "COFINS", base: 72000, aliquota: 3, valor: 2160, vencimento: "15/07/2024", status: "pendente" },
  { nome: "PIS", base: 72000, aliquota: 0.65, valor: 468, vencimento: "15/07/2024", status: "pendente" },
  { nome: "CSLL", base: 20400, aliquota: 9, valor: 1836, vencimento: "30/07/2024", status: "pendente" },
  { nome: "IRPJ", base: 20400, aliquota: 15, valor: 3060, vencimento: "30/07/2024", status: "pendente" },
];

const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format, startOfYear, endOfYear } from "date-fns";

export default function ContabilFiscal() {
  const [tab, setTab] = useState<"livro" | "impostos">("livro");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "cr" | "cp">("todos");
  const [dateStart, setDateStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const mesFiltro = new Date(dateStart).getMonth();
  const anoFiltro = new Date(dateStart).getFullYear();

  const filtrados = lancamentos.filter(l => tipoFiltro === "todos" || l.tipo === tipoFiltro);

  const totalEntradas = filtrados.filter(l => l.tipo === "cr").reduce((a, l) => a + l.valor, 0);
  const totalSaidas = filtrados.filter(l => l.tipo === "cp").reduce((a, l) => a + l.valor, 0);
  const totalImpostos = impostos.reduce((a, i) => a + i.valor, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório Contábil / Fiscal"
        description="Exportável para contabilidade · Conta Bancária · Data Pgto · Descrição · Cliente/Fornecedor · Valor · Categoria"
        actions={
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-sm font-medium transition-all">
              <FileText className="w-4 h-4" /> Exportar PDF
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button onClick={() => setTab("livro")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "livro" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}>Extrato Contábil</button>
        <button onClick={() => setTab("impostos")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "impostos" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}>Obrigações Fiscais</button>
      </div>

      {tab === "livro" && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Filtros:</span>
            </div>
            <DateRangePicker 
              startDate={dateStart} 
              endDate={dateEnd} 
              onChange={(start, end) => {
                setDateStart(start);
                setDateEnd(end);
              }}
            />
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
              {[["todos", "Todos"], ["cr", "A Receber"], ["cp", "A Pagar"]] .map(([v, l]) => (
                <button key={v} onClick={() => setTipoFiltro(v as any)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tipoFiltro === v ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}>{l}</button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm">{meses[Number(mesFiltro)]} {anoFiltro} — {filtrados.length} lançamentos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Colunas conforme solicitado pela contabilidade</p>
              </div>
              <div className="flex gap-6 text-right text-xs">
                <div><p className="text-muted-foreground">Entradas</p><p className="font-bold text-teal-400">{formatCurrency(totalEntradas)}</p></div>
                <div><p className="text-muted-foreground">Saídas</p><p className="font-bold text-destructive">{formatCurrency(totalSaidas)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className={`font-bold ${totalEntradas - totalSaidas >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totalEntradas - totalSaidas)}</p></div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Conta Bancária</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Data Pgto</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Nome Cliente / Fornecedor</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtrados.map((l, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{l.contaBancaria}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{l.dataPgto}</td>
                      <td className="px-4 py-3 text-white text-sm max-w-[200px] truncate">{l.descricao}</td>
                      <td className="px-4 py-3 text-white text-sm font-medium whitespace-nowrap">{l.parceiro}</td>
                      <td className={`px-4 py-3 text-right font-bold text-sm ${l.tipo === "cr" ? "text-teal-400" : "text-destructive"}`}>
                        {l.tipo === "cr" ? "+" : "-"}{formatCurrency(l.valor)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{l.categoria}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-white/5 border-t border-white/10">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-bold text-white text-sm">TOTAIS</td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-teal-400 font-bold text-xs">+{formatCurrency(totalEntradas)}</div>
                      <div className="text-destructive font-bold text-xs">-{formatCurrency(totalSaidas)}</div>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "impostos" && (
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Obrigações Fiscais — {meses[Number(mesFiltro)]} {anoFiltro}</h3>
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
      )}
    </div>
  );
}
