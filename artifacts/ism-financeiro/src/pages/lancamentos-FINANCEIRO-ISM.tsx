import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format as formatBtn, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, Filter, Download,
  Loader2, AlertCircle, AlertTriangle, X, Calendar, Pencil, Trash2,
  ChevronLeft, ChevronRight, CalendarDays,
  Target
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type Lancamento = {
  id: number;
  tipo: string;
  vencimento: string;
  competencia: string | null;
  conta_id: number | null;
  conta_nome: string | null;
  parceiro_id: number | null;
  parceiro_nome: string | null;
  descricao: string | null;
  valor: number;
  status: string;
  plano_conta_id: number | null;
  plano_conta_nome: string | null;
  riscos?: string[];
};

type ApiResponse = { data: Lancamento[]; total: number; page: number; limit: number; };
type PlanoConta = { id: number; tipo: string; categoria: string; subcategoria: string | null; };
type Parceiro = { id: number; nome: string; tipo_pessoa: string; };

const BANK_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
  "itaú": { abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)" },
  "itau": { abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)" },
  "bradesco": { abbr: "BRA", color: "#CC0000", bg: "rgba(204,0,0,0.15)" },
  "santander": { abbr: "SAN", color: "#E50001", bg: "rgba(229,0,1,0.15)" },
  "banco do brasil": { abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)" },
  "bb rende": { abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)" },
  "caixa economica": { abbr: "CEF", color: "#1E78C8", bg: "rgba(30,120,200,0.18)" },
  "nubank": { abbr: "NU", color: "#820AD1", bg: "rgba(130,10,209,0.18)" },
  "inter": { abbr: "INT", color: "#FF6600", bg: "rgba(255,102,0,0.15)" },
  "sicoob": { abbr: "SCB", color: "#00703C", bg: "rgba(0,112,60,0.15)" },
  "sicredi": { abbr: "SIC", color: "#009D4F", bg: "rgba(0,157,79,0.15)" },
  "banpará": { abbr: "BNP", color: "#0055A6", bg: "rgba(0,85,166,0.15)" },
  "brb": { abbr: "BRB", color: "#1A6B3A", bg: "rgba(26,107,58,0.18)" },
  "c6": { abbr: "C6", color: "#272D3B", bg: "rgba(120,125,135,0.3)" },
  "mercado pago": { abbr: "MP", color: "#00BCFF", bg: "rgba(0,188,255,0.15)" },
  "pagseguro": { abbr: "PAG", color: "#009B3A", bg: "rgba(0,155,58,0.15)" },
  "stone": { abbr: "STN", color: "#00A868", bg: "rgba(0,168,104,0.15)" },
  "conta empréstimo": { abbr: "EMPR", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  "conta aplicação": { abbr: "APLI", color: "#6366F1", bg: "rgba(99,102,241,0.15)" },
  "a identificar": { abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  "--": { abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
};

function getBankBadge(contaNome: string | null) {
  if (!contaNome) return BANK_MAP["a identificar"];
  const lower = contaNome.toLowerCase();
  for (const [key, val] of Object.entries(BANK_MAP)) {
    if (lower.includes(key)) return val;
  }
  const firstWord = contaNome.trim().split(" ")[0].toUpperCase().slice(0, 3);
  return { abbr: firstWord, color: "#94A3B8", bg: "rgba(148,163,184,0.15)" };
}

// Modal de picker de competência (Mês/Ano)
function CompetenciaPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [currentYear, setCurrentYear] = useState(value && value.includes("/") ? parseInt(value.split("/")[1]) : new Date().getFullYear());
  const selectedMonthIdx = value && value.includes("/") ? parseInt(value.split("/")[0]) - 1 : -1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button 
          type="button" 
          className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white flex items-center justify-between hover:border-white/20 transition-all">
          {value || "Selecione..."}
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl p-4 w-72">
        <div className="flex items-center justify-between mb-4 px-1">
          <button type="button" onClick={() => setCurrentYear(y => y - 1)} className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-white tracking-widest">{currentYear}</span>
          <button type="button" onClick={() => setCurrentYear(y => y + 1)} className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {months.map((m, i) => (
            <button 
              key={m} type="button" 
              onClick={() => {
                const monthStr = (i + 1).toString().padStart(2, '0');
                onChange(`${monthStr}/${currentYear}`);
                setOpen(false);
              }}
              className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                selectedMonthIdx === i && value.includes(currentYear.toString())
                ? "bg-primary text-white shadow-lg shadow-primary/30"
                : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4 pt-3 border-t border-white/5">
          <button type="button" onClick={() => setOpen(false)} className="px-4 py-1.5 bg-success hover:bg-success/90 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-success/20">
            Confirmar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Configuração base de riscos (Pode ser estendida pelo usuário nesta sessão)
const BASE_RISK_LEVELS: Record<number, { label: string; color: string; tags: string[] }> = {
  1: { label: "Nível 1 - Alerta", color: "text-yellow-400", tags: ["Multas e Juros", "Perda de Desconto", "Restrição de Crédito"] },
  2: { label: "Nível 2 - Risco Operacional", color: "text-orange-500", tags: ["Corte de Serviço", "Suspensão de Fornecimento", "Negativação", "Perda de Benefício Fiscal"] },
  3: { label: "Nível 3 - Risco Jurídico", color: "text-red-500", tags: ["Protesto", "Ação Judicial", "Dívida Ativa", "Quebra de Contrato"] },
  4: { label: "Nível 4 - Risco Crítico", color: "text-purple-400", tags: ["Bloqueio de Contas (Sisbajud)", "Penhora de Bens", "Pedido de Falência", "Impedimento de Certidão"] },
};

function LancamentoModal({ onClose, onSaved, editItem }: { onClose: () => void; onSaved: () => void; editItem?: Lancamento | null }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    tipo: editItem?.tipo || "CP",
    vencimento: editItem?.vencimento || "",
    competencia: editItem?.competencia || "",
    parceiro_id: editItem?.parceiro_id?.toString() || "",
    descricao: editItem?.descricao || "",
    valor: editItem?.valor?.toString() || "",
    status: editItem?.status || "pendente",
    plano_conta_id: editItem?.plano_conta_id?.toString() || "",
    riscos: (editItem as any)?.riscos || [] as string[],
    nivelRisco: 0, // 0 = automatico ou manual
  });

  
  // Lógica de tags extendidas para a sessão
  const [riskLevels, setRiskLevels] = useState(BASE_RISK_LEVELS);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTag, setNewTag] = useState({ name: "", level: 1 });

  // Calcula risco sugerido pelo sistema
  useEffect(() => {
    if (form.vencimento && form.nivelRisco === 0) {
      const vcto = new Date(form.vencimento + "T00:00:00");
      const hoje = new Date();
      const diffDays = Math.floor((hoje.getTime() - vcto.getTime()) / (1000 * 60 * 60 * 24));
      
      let level = 0;
      if (diffDays >= 1 && diffDays <= 15) level = 1;
      else if (diffDays >= 16 && diffDays <= 30) level = 2;
      else if (diffDays >= 31 && diffDays <= 60) level = 3;
      else if (diffDays > 60) level = 4;
      
      setForm(f => ({ ...f, nivelRisco: level }));
    }
  }, [form.vencimento, form.nivelRisco]);

  const { data: parceiros = [] } = useQuery<Parceiro[]>({
    queryKey: ["parceiros-modal"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/parceiros?all=true`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    }
  });

  const { data: planoContas = [] } = useQuery<PlanoConta[]>({
    queryKey: ["plano-contas-modal"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/plano-contas`);
      return res.json();
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const method = editItem ? "PUT" : "POST";
      const url = editItem ? `${API_URL}/lancamentos/${editItem.id}` : `${API_URL}/lancamentos`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Erro ao salvar lançamento");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: editItem ? "Lançamento atualizado." : "Lançamento criado." });
      onSaved();
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro", description: e.message })
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      tipo: form.tipo,
      vencimento: form.vencimento,
      competencia: form.competencia, // No formato MM/YYYY
      parceiro_id: form.parceiro_id ? parseInt(form.parceiro_id) : null,
      descricao: form.descricao,
      valor: parseFloat(form.valor.replace(",", ".")),
      status: form.status,
      plano_conta_id: form.plano_conta_id ? parseInt(form.plano_conta_id) : null,
      riscos: form.riscos,
    });
  };

  const handleToggleTag = (tag: string) => {
    setForm(f => {
      const exists = f.riscos.includes(tag);
      if (exists) return { ...f, riscos: f.riscos.filter((t: string) => t !== tag) };
      return { ...f, riscos: [...f.riscos, tag] };
    });
  };

  const handleCreateTag = () => {
    if (!newTag.name) return;
    setRiskLevels(prev => {
      const lv = prev[newTag.level];
      return { ...prev, [newTag.level]: { ...lv, tags: [...lv.tags, newTag.name] } };
    });
    setNewTag({ name: "", level: newTag.level });
    setShowAddTag(false);
    toast({ title: "Tag criada", description: `Tag adicionada ao Nível ${newTag.level}.` });
  };

  const inputCls = "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
  const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
  const selectCls = "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer";

  const selectedRisk = riskLevels[form.nivelRisco];
  const isCP = form.tipo === "CP";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-md p-4 pt-16 overflow-hidden">
      <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header de Luxo */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#121417] rounded-t-2xl">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tighter">
              {editItem ? "Editar Lançamento" : "Novo Lançamento"}
            </h2>
            <p className="text-xs text-muted-foreground">Preencha os dados financeiros detalhados</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-muted-foreground hover:text-white transition-all group">
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {/* Grid Principal Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Lado Esquerdo: Dados Básicos */}
            <div className="space-y-5">
              <div>
                <label className={labelCls}>Tipo de Registro *</label>
                <div className="flex gap-3">
                  {[{ v: "CP", label: "Contas a Pagar", color: "border-orange-500 bg-orange-500/10 text-orange-400" },
                    { v: "CR", label: "Contas a Receber", color: "border-teal-500 bg-teal-500/10 text-teal-400" }
                  ].map(({ v, label, color }) => (
                    <button type="button" key={v}
                      onClick={() => setForm(f => ({ ...f, tipo: v }))}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${form.tipo === v ? `${color} shadow-lg` : "border-white/5 bg-white/5 text-muted-foreground hover:border-white/10"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Data de Vencimento *</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button 
                        type="button"
                        className={cn(inputCls, "flex items-center justify-between text-left font-normal", !form.vencimento && "text-muted-foreground/30")}
                      >
                        {form.vencimento ? formatBtn(parseISO(form.vencimento), "dd/MM/yyyy") : "Selecione uma data..."}
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border border-white/10" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={form.vencimento ? parseISO(form.vencimento) : undefined}
                        onSelect={(date) => setForm(f => ({ ...f, vencimento: date ? formatBtn(date, "yyyy-MM-dd") : "" }))}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="relative">
                  <label className={labelCls}>Mês de Competência</label>
                  <CompetenciaPicker 
                    value={form.competencia || ""} 
                    onChange={v => setForm(f => ({ ...f, competencia: v }))} 
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Parceiro Comercial</label>
                <select value={form.parceiro_id} onChange={e => setForm(f => ({ ...f, parceiro_id: e.target.value }))} className={selectCls}>
                  <option value="">Selecione quem paga/recebe...</option>
                  {parceiros.map((p: Parceiro) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Título / Descrição</label>
                <input type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className={inputCls} placeholder="Ex: Manutenção servidor AWS, Aluguel Setembro..." />
              </div>
            </div>

            {/* Lado Direito: Categoria e Valores */}
            <div className="space-y-5">
              <div>
                <label className={labelCls}>Classificação (Plano de Contas)</label>
                <select value={form.plano_conta_id} onChange={e => setForm(f => ({ ...f, plano_conta_id: e.target.value }))} className={selectCls}>
                  <option value="">Indique a categoria contábil...</option>
                  {planoContas.map((p: PlanoConta) => (
                    <option key={p.id} value={p.id}>{p.categoria} {p.subcategoria ? `— ${p.subcategoria}` : ""}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Valor Previsto (R$)</label>
                  <input required type="text" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} className={`${inputCls} font-bold text-lg text-primary`} placeholder="0,00" />
                </div>
                <div>
                  <label className={labelCls}>Status Atual</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={selectCls}>
                    <option value="pendente">Pendente</option>
                    {form.tipo === "CR" ? (
                      <option value="pago">Pago (Liquidado)</option>
                    ) : (
                      <option value="recebido">Recebido (Pago)</option>
                    )}
                    <option value="atrasado">Atrasado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              </div>

              {/* Risco Cascata */}
              {isCP && (
                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4 shadow-inner">
                  <div className="flex items-center justify-between">
                    <label className={labelCls}>Vulnerabilidade / Nível de Risco</label>
                    <div className="flex items-center gap-1 text-[9px] font-black text-primary uppercase">
                       <Target className="w-3 h-3" /> Sugestão Ativa
                    </div>
                  </div>
                  
                  <div className="relative group">
                    <select 
                      value={form.nivelRisco} 
                      onChange={e => setForm(f => ({ ...f, nivelRisco: parseInt(e.target.value), riscos: [] }))}
                      className={`${selectCls} border-white/5 bg-black/40 font-black tracking-tight ${selectedRisk?.color || "text-white/40"} hover:border-white/20`}>
                      <option value={0}>Sem Risco Definido</option>
                      {Object.entries(riskLevels).map(([lv, data]) => (
                        <option key={lv} value={lv} className="bg-[#1a1c23] py-2">{data.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground group-hover:text-white transition-colors">
                      <ChevronRight className="w-4 h-4 rotate-90" />
                    </div>
                  </div>

                  {selectedRisk && (
                    <div className="space-y-4 animate-in pt-2">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40">Tags de Monitoramento</p>
                          <button 
                            type="button" 
                            onClick={() => setShowAddTag(!showAddTag)}
                            className={`text-[9px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all border
                              ${showAddTag ? "bg-primary/20 border-primary text-primary" : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white"}`}>
                            <Plus className={`w-2.5 h-2.5 transition-transform ${showAddTag ? 'rotate-45' : ''}`} /> 
                            {showAddTag ? "Cancelar" : "Nova Tag"}
                          </button>
                        </div>
                        
                        {showAddTag && (
                          <div className="flex gap-2 p-1.5 bg-black/60 rounded-xl border border-primary/20 animate-in ring-1 ring-primary/10">
                            <input 
                              type="text" 
                              autoFocus
                              value={newTag.name} onChange={e => setNewTag(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                              placeholder="NOME DA NOVA TAG..."
                              className="bg-transparent border-none outline-none text-[10px] font-bold text-white flex-1 px-2" 
                              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateTag())}
                            />
                            <button 
                              onClick={handleCreateTag} 
                              type="button" 
                              className="text-[10px] font-black bg-primary/20 hover:bg-primary text-primary hover:text-white px-4 py-1.5 rounded-lg transition-all">
                              CRIAR
                            </button>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                          {selectedRisk.tags.map(tag => {
                            const selected = form.riscos.includes(tag);
                            return (
                              <button
                                key={tag} type="button"
                                onClick={() => handleToggleTag(tag)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all flex items-center gap-2 group/tag
                                  ${selected 
                                    ? `${selectedRisk.color.replace('text-', 'bg-')}/20 ${selectedRisk.color} border-current shadow-lg shadow-current/5` 
                                    : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-white"
                                  }`}>
                                {tag}
                                {selected && <X className="w-2.5 h-2.5 opacity-50 group-hover/tag:opacity-100" />}
                              </button>
                            );
                          })}
                        </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t border-white/5">
            <button type="button" onClick={onClose} className="px-8 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 text-sm font-bold transition-all">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-black shadow-xl shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : (editItem ? "Salvar Alterações" : "Concluir Lançamento")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


export default function Lancamentos() {
  const [activeTab, setActiveTab] = useState("todos");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Lancamento | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const limit = 25;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout((window as any)._searchTimeout);
    (window as any)._searchTimeout = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 400);
  };

  const tipo = activeTab === "cr" ? "CR" : activeTab === "cp" ? "CP" : undefined;

  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["lancamentos", tipo, debouncedSearch, page, dateStart, dateEnd],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (dateStart) params.set("data_inicio", dateStart);
      if (dateEnd) params.set("data_fim", dateEnd);
      params.set("page", String(page));
      params.set("limit", String(limit));
      const res = await fetch(`${API_URL}/lancamentos?${params}`);
      if (!res.ok) throw new Error("Falha ao buscar lançamentos");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_URL}/lancamentos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({ title: "Excluído", description: "Lançamento removido com sucesso." });
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro", description: e.message })
  });

  const lancamentos = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const TABS = [
    { key: "todos", label: "Todos" },
    { key: "cr", label: "C.R" },
    { key: "cp", label: "C.P" },
  ];

  return (
    <div className="flex flex-col gap-2 h-full">
      {(modalOpen || editItem) && (
        <LancamentoModal
          onClose={() => { setModalOpen(false); setEditItem(null); }}
          onSaved={() => { setModalOpen(false); setEditItem(null); queryClient.invalidateQueries({ queryKey: ["lancamentos"] }); }}
          editItem={editItem}
        />
      )}

      {/* Header compacto */}
      <div className="flex items-center justify-between px-1 py-1">
        <div>
          <h1 className="text-base font-bold text-white leading-tight">Lançamentos Financeiros</h1>
          <p className="text-xs text-muted-foreground">Gerencie suas contas a pagar e a receber</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium transition-all">
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-all shadow-md shadow-primary/30">
            <Plus className="w-3.5 h-3.5" />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* Painel principal */}
      <div className="glass-panel rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
          <div className="flex items-center gap-4">
            <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/5">
                {TABS.map(({ key, label }) => (
                <button key={key}
                    onClick={() => { setActiveTab(key); setPage(1); }}
                    className={`px-4 py-1 rounded-md text-xs font-bold transition-colors ${
                    activeTab === key
                        ? key === "cr" ? "bg-teal-500/20 text-teal-300 shadow-sm"
                        : key === "cp" ? "bg-orange-500/20 text-orange-300 shadow-sm"
                        : "bg-white/10 text-white shadow-sm"
                        : "text-muted-foreground hover:text-white"
                    }`}>
                    {label}
                </button>
                ))}
            </div>

            <div className="flex items-center gap-2">
              <DateRangePicker 
                startDate={dateStart} 
                endDate={dateEnd} 
                onChange={(start: string, end: string) => {
                  setDateStart(start);
                  setDateEnd(end);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/20 border border-white/5 focus-within:border-primary/50 transition-all">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por descrição..."
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                className="bg-transparent border-none outline-none text-xs w-52 placeholder:text-muted-foreground text-white"
              />
            </div>
            <button className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-muted-foreground hover:text-white">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-black/20 text-muted-foreground border-b border-white/5">
              <tr>
                <th className="px-3 py-3 font-semibold w-14 text-center">Tipo</th>
                <th className="px-3 py-3 font-semibold">Vencimento</th>
                <th className="px-3 py-3 font-semibold">Banco</th>
                <th className="px-3 py-3 font-semibold">Parceiro</th>
                <th className="px-3 py-3 font-semibold">Descrição</th>
                <th className="px-3 py-3 font-semibold">Categoria</th>
                <th className="px-3 py-3 font-semibold text-right">R$ Valor</th>
                <th className="px-3 py-3 font-semibold text-center">Status</th>
                <th className="px-3 py-3 font-semibold text-right w-16">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={9} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                    <span className="text-xs">Carregando...</span>
                  </div>
                </td></tr>
              ) : isError ? (
                <tr><td colSpan={9} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <AlertCircle className="w-7 h-7" />
                    <span className="text-xs">Erro ao carregar dados. Verifique se o servidor está ativo.</span>
                  </div>
                </td></tr>
              ) : lancamentos.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-muted-foreground text-xs">
                  Nenhum lançamento encontrado.
                </td></tr>
              ) : lancamentos.map((l) => {
                const bank = getBankBadge(l.conta_nome);
                const isCR = l.tipo === "CR";
                return (
                  <tr key={l.id} className="hover:bg-white/[0.04] transition-colors group">
                    {/* Tipo CP/CR badge */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded ${
                        isCR ? "bg-teal-500/15 text-teal-300 border border-teal-500/25"
                              : "bg-orange-500/15 text-orange-300 border border-orange-500/25"
                      }`}>
                        {l.tipo}
                      </span>
                    </td>

                    {/* Vencimento */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-white/80 font-medium">
                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                        {formatDate(l.vencimento)}
                      </div>
                    </td>

                    {/* Banco — ícone/badge */}
                    <td className="px-3 py-2.5">
                      <span
                        title={l.conta_nome || "A identificar"}
                        className="inline-flex items-center justify-center w-9 h-6 rounded text-[10px] font-black leading-none cursor-default"
                        style={{ color: bank.color, background: bank.bg, border: `1px solid ${bank.color}40` }}>
                        {bank.abbr}
                      </span>
                    </td>

                    {/* Parceiro */}
                    <td className="px-3 py-2.5 font-medium text-white max-w-[160px] truncate" title={l.parceiro_nome || ""}>
                      {l.parceiro_nome || <span className="text-white/30 italic">—</span>}
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-2.5 text-white/60 max-w-[200px] truncate" title={l.descricao || ""}>
                      {l.descricao || "—"}
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-2.5 max-w-[140px] truncate">
                      {l.plano_conta_nome
                        ? <span className="text-[10px] bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-white/70">{l.plano_conta_nome}</span>
                        : <span className="text-white/25 italic text-[10px]">Sem cat.</span>}
                    </td>

                    {/* Valor - sem $ na frente */}
                    <td className={`px-3 py-2.5 text-right font-bold ${isCR ? "text-teal-300" : "text-white/90"}`}>
                      {isCR ? "" : "- "}{formatCurrency(l.valor).replace("R$", "").trim()}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>

                    {/* Ações - sempre visível */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditItem(l)}
                          className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors"
                          title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Deseja excluir este lançamento?")) deleteMutation.mutate(l.id);
                          }}
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                          title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground bg-black/10">
          <span>
            {isLoading ? "..." : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total.toLocaleString("pt-BR")} registros`}
          </span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2.5 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
              ‹ Anterior
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, page - 2);
              const pageNum = start + i;
              if (pageNum > totalPages) return null;
              return (
                <button key={pageNum} onClick={() => setPage(pageNum)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${pageNum === page ? "bg-primary text-white" : "hover:bg-white/5"}`}>
                  {pageNum}
                </button>
              );
            })}
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-2.5 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
              Próxima ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
