import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Search, Trash2, ArrowRight, X, Link2, Ban, ChevronsRight, CheckCircle, AlertCircle } from "lucide-react";

const contasBancarias = [
  { id: 1, banco: "Itaú", agencia: "1234", conta: "56789-0" },
  { id: 2, banco: "Bradesco", agencia: "4321", conta: "98765-4" },
  { id: 3, banco: "Nubank PJ", agencia: "0001", conta: "11223344-5" },
];

const conciliacoes = [
  { id: 1, banco: "Itaú", agencia: "1234", conta: "56789-0", periodo: "01/10 a 31/10/2023", conciliados: 45, ignorados: 2, pendentes: 0, total: 47, status: "conciliado" },
  { id: 2, banco: "Bradesco", agencia: "4321", conta: "98765-4", periodo: "01/10 a 15/10/2023", conciliados: 12, ignorados: 0, pendentes: 5, total: 17, status: "pendente" },
  { id: 3, banco: "Nubank PJ", agencia: "0001", conta: "11223344-5", periodo: "01/11 a 05/11/2023", conciliados: 0, ignorados: 0, pendentes: 8, total: 8, status: "pendente" },
];

const lancamentosDisponiveis = [
  { id: 1, descricao: "Mensalidade Outubro", parceiro: "Tech Solutions S.A.", valor: 15000, vencimento: "15/10/2023", tipo: "cr" },
  { id: 2, descricao: "Projeto Setup", parceiro: "Global Industries", valor: 35000, vencimento: "05/10/2023", tipo: "cr" },
  { id: 3, descricao: "Consultoria Alpha", parceiro: "Alpha Consultoria", valor: 22000, vencimento: "30/10/2023", tipo: "cr" },
  { id: 4, descricao: "AWS Cloud", parceiro: "Amazon Web Services", valor: 4500, vencimento: "10/10/2023", tipo: "cp" },
  { id: 5, descricao: "Materiais Escritório", parceiro: "Office Supplies Ltda", valor: 850, vencimento: "20/10/2023", tipo: "cp" },
  { id: 6, descricao: "Dev Sr. João", parceiro: "João Silva", valor: 8000, vencimento: "25/10/2023", tipo: "cp" },
];

type ExtratoItem = {
  id: number; data: string; descricao: string; valor: number;
  status: "pendente" | "vinculado" | "ignorado";
  vinculados?: number[];
};

const extratoMock: ExtratoItem[] = [
  { id: 1, data: "03/10/2023", descricao: "TED RECEBIDA TECH SOLUTIONS", valor: 15000, status: "pendente" },
  { id: 2, data: "05/10/2023", descricao: "PIX ENVIADO AMAZON", valor: -4500, status: "pendente" },
  { id: 3, data: "10/10/2023", descricao: "DEPOSITO GLOBAL IND", valor: 35000, status: "pendente" },
  { id: 4, data: "15/10/2023", descricao: "BOLETO OFFICE SUP", valor: -850, status: "pendente" },
  { id: 5, data: "20/10/2023", descricao: "TED RECEBIDA ALPHA", valor: 22000, status: "pendente" },
];

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(v));
}

function VincularModal({ item, onClose, onVincular }: { item: ExtratoItem; onClose: () => void; onVincular: (ids: number[]) => void }) {
  const [search, setSearch] = useState("");
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const tipoFiltro = item.valor > 0 ? "cr" : "cp";
  const disponiveis = lancamentosDisponiveis.filter(l =>
    l.tipo === tipoFiltro &&
    (l.descricao.toLowerCase().includes(search.toLowerCase()) || l.parceiro.toLowerCase().includes(search.toLowerCase()))
  );
  const totalSelecionado = selecionados.reduce((acc, id) => {
    const l = lancamentosDisponiveis.find(x => x.id === id);
    return acc + (l?.valor ?? 0);
  }, 0);
  const diferenca = Math.abs(item.valor) - totalSelecionado;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-xl shadow-2xl max-h-[95vh] sm:max-h-[85vh] flex flex-col animate-in">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h3 className="font-bold text-white">Vincular Lançamento</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Extrato: <span className={item.valor > 0 ? "text-teal-400 font-semibold" : "text-destructive font-semibold"}>{item.valor > 0 ? "+" : "-"}{formatCurrency(item.valor)}</span> · {item.descricao}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-primary/50 transition-colors">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar lançamento ou parceiro..."
              className="bg-transparent outline-none text-sm text-white placeholder:text-muted-foreground w-full" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Selecione um ou mais lançamentos para combinar com o valor do extrato.</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {disponiveis.map(l => {
            const sel = selecionados.includes(l.id);
            return (
              <label key={l.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${sel ? "bg-primary/10" : "hover:bg-white/5"}`}>
                <input type="checkbox" checked={sel} onChange={() => setSelecionados(s => s.includes(l.id) ? s.filter(x => x !== l.id) : [...s, l.id])} className="accent-primary w-4 h-4" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{l.descricao}</p>
                  <p className="text-xs text-muted-foreground">{l.parceiro} · Venc: {l.vencimento}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${l.tipo === "cr" ? "text-teal-400" : "text-destructive"}`}>{formatCurrency(l.valor)}</span>
              </label>
            );
          })}
          {disponiveis.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lançamento encontrado.</div>
          )}
        </div>

        {selecionados.length > 0 && (
          <div className="p-4 border-t border-white/5 bg-primary/5">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Total selecionado:</span>
              <span className="font-bold text-white">{formatCurrency(totalSelecionado)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Diferença:</span>
              <span className={`font-bold ${diferenca === 0 ? "text-success" : diferenca > 0 ? "text-warning" : "text-destructive"}`}>
                {diferenca === 0 ? "✓ Valores iguais" : diferenca > 0 ? `+${formatCurrency(diferenca)} (sobra)` : `-${formatCurrency(Math.abs(diferenca))} (desconto/juros)`}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 p-5 border-t border-white/5">
          <button onClick={onClose} className="w-full sm:w-auto px-10 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium order-2 sm:order-1">Cancelar</button>
          <button onClick={() => { onVincular(selecionados); onClose(); }}
            disabled={selecionados.length === 0}
            className="w-full sm:w-auto px-10 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 order-1 sm:order-2">
            <Link2 className="w-4 h-4" /> Confirmar Vínculo
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportarModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"conta" | "extrato">("conta");
  const [contaSelecionada, setContaSelecionada] = useState<number | null>(null);
  const [extrato, setExtrato] = useState<ExtratoItem[]>(extratoMock.map(e => ({ ...e, status: "pendente" as const })));
  const [vinculandoId, setVinculandoId] = useState<number | null>(null);

  const handleIgnorar = (id: number) => setExtrato(e => e.map(item => item.id === id ? { ...item, status: "ignorado" as const } : item));
  const handleVincular = (id: number) => setVinculandoId(id);
  const handleConfirmVincular = (itemId: number, _lancIds: number[]) => setExtrato(e => e.map(item => item.id === itemId ? { ...item, status: "vinculado" as const, vinculados: _lancIds } : item));
  const handleDesvincular = (id: number) => setExtrato(e => e.map(item => item.id === id ? { ...item, status: "pendente" as const, vinculados: undefined } : item));

  const pendentes = extrato.filter(e => e.status === "pendente").length;
  const vinculados = extrato.filter(e => e.status === "vinculado").length;
  const ignorados = extrato.filter(e => e.status === "ignorado").length;

  const handleSalvar = () => onClose();

  if (step === "conta") {
    return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl animate-in">
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <h2 className="text-lg font-bold text-white">Importar Extrato</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Selecione a Conta Bancária *</label>
              <div className="space-y-2">
                {contasBancarias.map(c => (
                  <label key={c.id} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${contaSelecionada === c.id ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/20 bg-white/5"}`}>
                    <input type="radio" name="conta" value={c.id} checked={contaSelecionada === c.id} onChange={() => setContaSelecionada(c.id)} className="accent-primary" />
                    <div>
                      <p className="font-semibold text-white text-sm">{c.banco}</p>
                      <p className="text-xs text-muted-foreground">Ag: {c.agencia} · CC: {c.conta}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Arquivo OFX / CSV</label>
              <div className="border-2 border-dashed border-white/10 hover:border-primary/40 rounded-xl p-6 text-center cursor-pointer transition-colors">
                <p className="text-sm text-muted-foreground">Arraste o arquivo aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Formatos aceitos: .OFX, .CSV</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 p-6 pt-0">
            <button onClick={onClose} className="w-full sm:w-auto px-10 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium order-2 sm:order-1">Cancelar</button>
            <button onClick={() => contaSelecionada && setStep("extrato")}
              disabled={!contaSelecionada}
              className="w-full sm:w-auto px-10 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2 order-1 sm:order-2">
              <ChevronsRight className="w-4 h-4" /> Carregar Extrato
            </button>
          </div>
        </div>
      </div>
    );
  }

  const conta = contasBancarias.find(c => c.id === contaSelecionada)!;

  return (
    <>
      {vinculandoId !== null && (
        <VincularModal
          item={extrato.find(e => e.id === vinculandoId)!}
          onClose={() => setVinculandoId(null)}
          onVincular={(ids) => handleConfirmVincular(vinculandoId, ids)}
        />
      )}
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-3xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-in">
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-white truncate">Conciliando — {conta.banco}</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Ag: {conta.agencia} · CC: {conta.conta}</p>
            </div>
            <div className="hidden md:flex items-center gap-4 text-xs mx-4 shrink-0">
              <span className="text-success font-semibold">{vinculados} vinc.</span>
              <span className="text-muted-foreground">{ignorados} ign.</span>
              <span className="text-warning font-semibold">{pendentes} pend.</span>
              <span className="text-white">{extrato.length} total</span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg shrink-0"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex md:hidden items-center justify-between px-5 py-2 border-b border-white/5 bg-white/5 text-[10px]">
              <span className="text-success font-semibold">{vinculados} Vinc.</span>
              <span className="text-muted-foreground">{ignorados} Ign.</span>
              <span className="text-warning font-semibold">{pendentes} Pend.</span>
              <span className="text-white">{extrato.length} Total</span>
          </div>

          <div className="flex-1 overflow-y-auto responsive-table-container">
            <table className="w-full text-sm table-to-cards">
              <thead className="bg-white/5 sticky top-0">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Data</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Valor</th>
                  <th className="px-5 py-3 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {extrato.map(item => (
                  <tr key={item.id} className={`transition-colors ${item.status === "vinculado" ? "bg-success/5" : item.status === "ignorado" ? "opacity-40" : "hover:bg-white/5"}`}>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs" data-label="Data">{item.data}</td>
                    <td className="px-5 py-3 text-white text-sm" data-label="Descrição">{item.descricao}</td>
                    <td className={`px-5 py-3 text-right font-bold text-sm ${item.valor > 0 ? "text-teal-400" : "text-destructive"}`} data-label="Valor">
                      {item.valor > 0 ? "+" : "-"}{formatCurrency(item.valor)}
                    </td>
                    <td className="px-5 py-3 text-center" data-label="Status">
                      {item.status === "vinculado" && <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full font-medium flex items-center gap-1 justify-center"><CheckCircle className="w-3 h-3" /> Vinculado</span>}
                      {item.status === "ignorado" && <span className="text-xs bg-white/10 text-muted-foreground px-2 py-0.5 rounded-full font-medium">Ignorado</span>}
                      {item.status === "pendente" && <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium flex items-center gap-1 justify-center"><AlertCircle className="w-3 h-3" /> Pendente</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {item.status === "pendente" && (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleIgnorar(item.id)} className="flex items-center gap-1 px-3 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white rounded-lg text-xs font-medium transition-colors touch-target-exempt">
                            <Ban className="w-3.5 h-3.5" /> Ignorar
                          </button>
                          <button onClick={() => handleVincular(item.id)} className="flex items-center gap-1 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-medium transition-colors touch-target-exempt">
                            <Link2 className="w-3.5 h-3.5" /> Vincular
                          </button>
                        </div>
                      )}
                      {item.status === "vinculado" && (
                        <button onClick={() => handleDesvincular(item.id)} className="flex items-center gap-1 px-3 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg text-xs font-medium transition-colors touch-target-exempt">
                          <X className="w-3.5 h-3.5" /> Remover vínculo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 p-5 border-t border-white/5">
            <button onClick={onClose} className="w-full sm:w-auto px-10 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium order-2 sm:order-1">Fechar</button>
            <button onClick={handleSalvar} className="w-full sm:w-auto px-10 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 order-1 sm:order-2">
              <CheckCircle className="w-4 h-4" />
              Salvar Conciliação
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ConciliacaoList() {
  const [showImportar, setShowImportar] = useState(false);

  return (
    <div className="space-y-6">
      {showImportar && <ImportarModal onClose={() => setShowImportar(false)} />}

      <PageHeader
        title="Conciliação Bancária"
        description="Importe extratos e concilie com seus lançamentos financeiros"
        actions={
          <button onClick={() => setShowImportar(true)} className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-success/25">
            <Plus className="w-4 h-4" /> Importar Extrato
          </button>
        }
      />

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto responsive-table-container">
          <table className="w-full text-left text-sm whitespace-nowrap table-to-cards">
            <thead className="bg-black/20 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-medium text-center w-32">Status</th>
                <th className="px-6 py-4 font-medium">Banco / Conta</th>
                <th className="px-6 py-4 font-medium">Período</th>
                <th className="px-6 py-4 font-medium text-center text-success">Conciliados</th>
                <th className="px-6 py-4 font-medium text-center text-muted-foreground">Ignorados</th>
                <th className="px-6 py-4 font-medium text-center text-warning">Pendentes</th>
                <th className="px-6 py-4 font-medium text-center">Total</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {conciliacoes.map(c => (
                <tr key={c.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4 text-center" data-label="Status">
                    <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${c.status === "conciliado" ? "bg-success/20 text-success" : "bg-white/10 text-muted-foreground"}`}>
                      {c.status === "conciliado" ? "Conciliado" : "Pendente"}
                    </span>
                  </td>
                  <td className="px-6 py-4" data-label="Banco / Conta">
                    <div className="font-semibold text-white">{c.banco}</div>
                    <div className="text-xs text-muted-foreground">Ag: {c.agencia} | CC: {c.conta}</div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground" data-label="Período">{c.periodo}</td>
                  <td className="px-6 py-4 text-center font-semibold text-success" data-label="Conciliados">{c.conciliados}</td>
                  <td className="px-6 py-4 text-center text-muted-foreground" data-label="Ignorados">{c.ignorados}</td>
                  <td className="px-6 py-4 text-center font-semibold text-warning" data-label="Pendentes">{c.pendentes}</td>
                  <td className="px-6 py-4 text-center font-bold text-white" data-label="Total">{c.total}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setShowImportar(true)} className="flex items-center gap-1 px-4 py-2.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-medium transition-colors touch-target-exempt">
                        Continuar <ArrowRight className="w-4 h-4" />
                      </button>
                      <button className="p-2.5 rounded-xl hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors touch-target-exempt">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
