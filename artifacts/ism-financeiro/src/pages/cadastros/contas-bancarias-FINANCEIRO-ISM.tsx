import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { 
  Plus, 
  Landmark, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Pencil, 
  Lock, 
  Unlock,
  Loader2,
  Trash2
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type ContaBancaria = {
  id: number;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: string;
  status: string;
  cor: string;
  saldo_inicial: number;
  saldo_atual: number;
};

interface ModalProps { 
  onClose: () => void;
  initialData?: ContaBancaria | null;
}

function NovaContaModal({ onClose, initialData }: ModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ 
    nome: initialData?.nome || "",
    banco: initialData?.banco || "", 
    agencia: initialData?.agencia || "", 
    conta: initialData?.conta || "", 
    tipo: initialData?.tipo || "Conta Corrente",
    saldo_inicial: initialData?.saldo_inicial || 0,
    cor: initialData?.cor || "#3BA8DC"
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const isEdit = !!initialData;
      const res = await fetch(`${API_URL}/contas-bancarias${isEdit ? `/${initialData.id}` : ""}`, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, data_inicio: new Date().toISOString().split("T")[0] }),
      });
      if (!res.ok) throw new Error("Erro ao salvar conta");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contas-bancarias"] });
      toast({ title: initialData ? "Conta atualizada" : "Conta cadastrada", description: "As informações foram salvas com sucesso." });
      onClose();
    },
    onError: (e) => {
      toast({ title: "Erro", description: String(e), variant: "destructive" });
    }
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white">{initialData ? "Editar Conta" : "Nova Conta Bancária"}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Passo {step} de 2</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 px-6 pt-4">
          {[1, 2].map(s => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= step ? 'bg-primary' : 'bg-white/10'}`} />
          ))}
        </div>

        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome Exibição (Apelido)</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: Itaú PJ Principal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Banco</label>
                  <input value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Itaú" />
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
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Saldo Inicial (Sistema começará com este valor)</label>
                <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">R$</span>
                   <input 
                    type="number"
                    step="0.01"
                    value={form.saldo_inicial} 
                    onChange={e => setForm({ ...form, saldo_inicial: parseFloat(e.target.value) })} 
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors font-bold" 
                    placeholder="0,00" 
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Cor de Identificação</label>
                <div className="flex gap-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                  {["#3BA8DC", "#E67E22", "#8B5CF6", "#27AE60", "#E74C3C"].map(c => (
                    <button 
                      key={c} 
                      onClick={() => setForm({ ...form, cor: c })}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${form.cor === c ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-0">
          {step > 1 && <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-all">Voltar</button>}
          {step < 2
            ? <button onClick={() => setStep(s => s + 1)} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-all">Próximo</button>
            : <button 
                onClick={() => mutation.mutate(form)} 
                disabled={mutation.isPending}
                className="flex-1 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (initialData ? "Salvar Alterações" : "Confirmar Cadastro")}
              </button>
          }
        </div>
      </div>
    </div>
  );
}

export default function ContasBancarias() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showSaldos, setShowSaldos] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConta, setEditingConta] = useState<ContaBancaria | null>(null);

  const { data: contas = [], isLoading } = useQuery<ContaBancaria[]>({
    queryKey: ["contas-bancarias"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/contas-bancarias`);
      if (!res.ok) throw new Error("Erro ao buscar contas");
      return res.json();
    }
  });

  const blockMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`${API_URL}/contas-bancarias/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erro ao alterar status");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contas-bancarias"] });
      toast({ 
        title: variables.status === "ativo" ? "Conta desbloqueada" : "Conta bloqueada", 
        description: `O status da conta foi alterado para ${variables.status}.` 
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_URL}/contas-bancarias/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao deletar conta");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contas-bancarias"] });
      toast({ title: "Conta removida", description: "A conta foi deletada com sucesso." });
    }
  });

  const totalSaldo = contas.filter(c => c.status === "ativo").reduce((acc, c) => acc + c.saldo_atual, 0);

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {(showModal || editingConta) && (
        <NovaContaModal 
          initialData={editingConta}
          onClose={() => { setShowModal(false); setEditingConta(null); }} 
        />
      )}

      <PageHeader
        title="Contas Bancárias"
        description="Gerencie as contas bancárias reais da empresa. O saldo é atualizado automaticamente via conciliação."
        actions={
          <div className="flex gap-3">
            <button onClick={() => setShowSaldos(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              {showSaldos ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showSaldos ? "Ocultar" : "Mostrar"} Saldos
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4" /> Nova Conta Bancária
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {contas.map(conta => (
          <div key={conta.id} className={`glass-panel rounded-2xl p-6 border transition-all ${conta.status === 'bloqueado' ? 'opacity-60 border-destructive/20 grayscale-[0.5]' : 'border-white/5 hover:border-white/20'}`}>
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: conta.cor + '20' }}>
                  <Landmark className="w-6 h-6" style={{ color: conta.cor }} />
                </div>
                <div>
                  <h3 className="font-bold text-white leading-tight">{conta.nome}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{conta.banco} · {conta.tipo}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => setEditingConta(conta)}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => blockMutation.mutate({ id: conta.id, status: conta.status === 'ativo' ? 'bloqueado' : 'ativo' })}
                  className={`p-2 rounded-lg transition-colors ${conta.status === 'ativo' ? 'bg-white/5 hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400' : 'bg-success/20 text-success hover:bg-success/30'}`}
                >
                  {conta.status === 'ativo' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => confirm("Deseja realmente deletar?") && deleteMutation.mutate(conta.id)}
                  className="p-2 bg-white/5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white/5 rounded-xl p-3">
                 <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">Agência</p>
                 <p className="text-sm text-white font-mono font-bold">{conta.agencia || "—"}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                 <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">Conta</p>
                 <p className="text-sm text-white font-mono font-bold">{conta.conta || "—"}</p>
              </div>
            </div>

            <div className="flex items-end justify-between pt-4 border-t border-white/5">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">Saldo Atual</p>
                <p className="text-2xl font-bold" style={{ color: conta.cor }}>
                  {showSaldos ? formatCurrency(conta.saldo_atual) : "R$ ••••••"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">Status</p>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-1 rounded-lg ${conta.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                  {conta.status === 'ativo' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {conta.status}
                </span>
              </div>
            </div>
          </div>
        ))}

        {contas.length === 0 && !isLoading && (
          <div className="col-span-full py-16 text-center glass-panel rounded-2xl border-dashed border-2 border-white/10">
             <Landmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
             <p className="text-muted-foreground text-sm font-medium">Nenhuma conta cadastrada ainda.</p>
             <button onClick={() => setShowModal(true)} className="text-primary text-sm font-bold hover:underline mt-2">Clique aqui para criar sua primeira conta</button>
          </div>
        )}
      </div>
    </div>
  );
}
