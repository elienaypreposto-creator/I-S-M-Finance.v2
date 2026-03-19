import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Landmark, Eye, EyeOff, CheckCircle, AlertCircle, Clock, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const contas = [
  { id: 1, banco: "Itaú", agencia: "1234", conta: "56789-0", tipo: "Conta Corrente", saldo: 215430.50, status: "ativo", cor: "#3BA8DC" },
  { id: 2, banco: "Bradesco", agencia: "4321", conta: "98765-4", tipo: "Conta Corrente", saldo: 87200.00, status: "ativo", cor: "#E67E22" },
  { id: 3, banco: "Nubank", agencia: "0001", conta: "11223344-5", tipo: "Conta PJ", saldo: 42000.00, status: "ativo", cor: "#8B5CF6" },
  { id: 4, banco: "Caixa Econômica", agencia: "9999", conta: "00123456-7", tipo: "Poupança", saldo: 15000.00, status: "inativo", cor: "#27AE60" },
];

interface ModalProps { onClose: () => void }

function NovaContaModal({ onClose }: ModalProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ banco: "", agencia: "", conta: "", tipo: "Conta Corrente", descricao: "" });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white">Nova Conta Bancária</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Passo {step} de 3</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 px-6 pt-4">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= step ? 'bg-primary' : 'bg-white/10'}`} />
          ))}
        </div>

        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Banco</label>
                <input value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: Itaú, Bradesco, Nubank..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Tipo de Conta</label>
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors">
                  <option value="Conta Corrente">Conta Corrente</option>
                  <option value="Conta PJ">Conta PJ</option>
                  <option value="Poupança">Poupança</option>
                  <option value="Investimento">Investimento</option>
                </select>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Agência</label>
                  <input value={form.agencia} onChange={e => setForm({ ...form, agencia: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="0000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Conta</label>
                  <input value={form.conta} onChange={e => setForm({ ...form, conta: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="00000-0" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Descrição / Apelido</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: Conta Principal" />
              </div>
            </>
          )}
          {step === 3 && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Conta Pronta!</h3>
                <p className="text-muted-foreground text-sm mt-1">Revise os dados e confirme o cadastro.</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Banco</span><span className="text-white font-medium">{form.banco || "—"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tipo</span><span className="text-white font-medium">{form.tipo}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Ag / CC</span><span className="text-white font-medium">{form.agencia || "—"} / {form.conta || "—"}</span></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-0">
          {step > 1 && <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-all">Voltar</button>}
          {step < 3
            ? <button onClick={() => setStep(s => s + 1)} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-all">Próximo</button>
            : <button onClick={onClose} className="flex-1 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-medium transition-all">Confirmar Cadastro</button>
          }
        </div>
      </div>
    </div>
  );
}

export default function ContasBancarias() {
  const [showSaldos, setShowSaldos] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const totalSaldo = contas.filter(c => c.status === "ativo").reduce((acc, c) => acc + c.saldo, 0);

  return (
    <div className="space-y-6">
      {showModal && <NovaContaModal onClose={() => setShowModal(false)} />}

      <PageHeader
        title="Contas Bancárias"
        description="Gerencie as contas bancárias da empresa"
        actions={
          <div className="flex gap-3">
            <button onClick={() => setShowSaldos(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              {showSaldos ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showSaldos ? "Ocultar" : "Mostrar"} Saldos
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4" /> Nova Conta
            </button>
          </div>
        }
      />

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Saldo Consolidado (contas ativas)</p>
            <p className="text-3xl font-bold text-white mt-1">
              {showSaldos ? formatCurrency(totalSaldo) : "R$ ••••••"}
            </p>
          </div>
          <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center">
            <Landmark className="w-7 h-7 text-primary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contas.map(conta => (
          <div key={conta.id} className="glass-panel rounded-2xl p-5 hover:border-white/20 border border-white/5 transition-all cursor-pointer group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: conta.cor + '30' }}>
                  <Landmark className="w-5 h-5" style={{ color: conta.cor }} />
                </div>
                <div>
                  <p className="font-bold text-white">{conta.banco}</p>
                  <p className="text-xs text-muted-foreground">{conta.tipo}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${conta.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-white/10 text-muted-foreground'}`}>
                {conta.status === 'ativo' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {conta.status === 'ativo' ? 'Ativa' : 'Inativa'}
              </span>
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Agência</span>
                <span className="text-white font-mono">{conta.agencia}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Conta</span>
                <span className="text-white font-mono">{conta.conta}</span>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5">
              <p className="text-xs text-muted-foreground mb-1">Saldo Atual</p>
              <p className="text-xl font-bold" style={{ color: conta.cor }}>
                {showSaldos ? formatCurrency(conta.saldo) : "R$ ••••••"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
