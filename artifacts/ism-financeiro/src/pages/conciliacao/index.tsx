import { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  Plus, Search, Trash2, ArrowRight, X, Link2, Ban, ChevronsRight, 
  CheckCircle, AlertCircle, Pencil, Calendar, Settings, RotateCcw,
  Users, ArrowLeftRight, FileText, Loader2, ChevronDown, RotateCw, 
  Building2, DollarSign, ExternalLink, ChevronLeft, ChevronRight,
  MoreHorizontal, Info
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type ContaBancaria = { id: number; nome: string; agencia: string; conta: string; tipo: string };
type Parceiro = { id: number; nome: string; tipo_pessoa: string; is_socio: boolean };

type ExtratoItem = {
  id: number; data: string; descricao: string; valor: number;
  status: "pendente" | "vinculado" | "ignorado";
  vinculados?: number[];
  desconto?: number;
  acrescimo?: number;
  gerarResidual?: boolean;
};

type LancamentoConciliacao = {
  id: number; descricao: string; parceiro_nome: string; valor: number;
  tipo: "CR" | "CP"; status: string; vencimento: string;
  vinculados_extrato?: number[];
};

const extratoMock: ExtratoItem[] = [
  { id: 1, data: "03/10/2023", descricao: "TED RECEBIDA TECH SOLUTIONS", valor: 15000, status: "pendente" },
  { id: 2, data: "05/10/2023", descricao: "PIX ENVIADO AMAZON", valor: -4500, status: "pendente" },
  { id: 3, data: "10/10/2023", descricao: "DEPOSITO GLOBAL IND", valor: 35000, status: "pendente" },
  { id: 4, data: "15/10/2023", descricao: "BOLETO OFFICE SUP", valor: -850, status: "pendente" },
  { id: 5, data: "20/10/2023", descricao: "TED RECEBIDA ALPHA", valor: 22000, status: "pendente" },
  { id: 6, data: "22/10/2023", descricao: "ESTORNO TARIFA", valor: -25, status: "pendente" },
  { id: 7, data: "25/10/2023", descricao: "TRANSFERENCIA PROPRIA", valor: -5000, status: "pendente" },
];

const lancamentosDisponiveis: LancamentoConciliacao[] = [
  { id: 1, descricao: "Mensalidade Outubro", parceiro_nome: "Tech Solutions S.A.", valor: 15000, tipo: "CR", status: "pendente", vencimento: "15/10/2023" },
  { id: 2, descricao: "Projeto Setup", parceiro_nome: "Global Industries", valor: 35000, tipo: "CR", status: "pendente", vencimento: "05/10/2023" },
  { id: 3, descricao: "Consultoria Alpha", parceiro_nome: "Alpha Consultoria", valor: 22000, tipo: "CR", status: "pendente", vencimento: "30/10/2023" },
  { id: 4, descricao: "AWS Cloud", parceiro_nome: "Amazon Web Services", valor: 4500, tipo: "CP", status: "pendente", vencimento: "10/10/2023" },
  { id: 5, descricao: "Materiais Escritório", parceiro_nome: "Office Supplies Ltda", valor: 850, tipo: "CP", status: "pendente", vencimento: "20/10/2023" },
  { id: 6, descricao: "Dev Sr. João", parceiro_nome: "João Silva", valor: 8000, tipo: "CP", status: "pendente", vencimento: "25/10/2023" },
  { id: 7, descricao: "Pagamento Parcial Salário", parceiro_nome: "Empresa X", valor: 15000, tipo: "CP", status: "pendente", vencimento: "01/10/2023" },
];

const sociosMock: Parceiro[] = [
  { id: 1, nome: "João Silva", tipo_pessoa: "PF", is_socio: true },
  { id: 2, nome: "Maria Santos", tipo_pessoa: "PF", is_socio: true },
  { id: 3, nome: "Empresa XYZ Ltda", tipo_pessoa: "PJ", is_socio: true },
];

const contasBancariasMock: ContaBancaria[] = [
  { id: 1, nome: "Itaú", agencia: "1234", conta: "56789-0", tipo: "corrente" },
  { id: 2, nome: "Bradesco", agencia: "4321", conta: "98765-4", tipo: "corrente" },
  { id: 3, nome: "Nubank PJ", agencia: "0001", conta: "11223344-5", tipo: "corrente" },
];

function formatCurrencyValue(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(v));
}

function ConfigModal({ open, onClose, config, onSave }: { 
  open: boolean; onClose: () => void; 
  config: any; onSave: (c: any) => void 
}) {
  const [localConfig, setLocalConfig] = useState(config);
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#121417] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl animate-in">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h3 className="font-bold text-white">Configurações de Filtro</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center justify-between">
            <span className="text-sm text-white">Retornar Conciliados</span>
            <select 
              value={localConfig.retornarConciliados}
              onChange={e => setLocalConfig({...localConfig, retornarConciliados: e.target.value})}
              className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-white">Filtrar pela conta selecionada</span>
            <select 
              value={localConfig.filtrarConta}
              onChange={e => setLocalConfig({...localConfig, filtrarConta: e.target.value})}
              className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-white">Quantidade de dias</span>
            <input 
              type="number"
              value={localConfig.dias}
              onChange={e => setLocalConfig({...localConfig, dias: parseInt(e.target.value) || 0})}
              className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white w-20"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-white">Pesquisa aproximada de valor</span>
            <select 
              value={localConfig.pesquisaAproximada}
              onChange={e => setLocalConfig({...localConfig, pesquisaAproximada: e.target.value})}
              className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/5">
          <button onClick={onClose} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
          <button onClick={() => { onSave(localConfig); onClose(); }} className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function NovoLancamentoModal({ 
  open, onClose, onSave, tipo, contaOrigem, socios 
}: { 
  open: boolean; onClose: () => void; onSave: (d: any) => void;
  tipo: "transferencia" | "socio" | "lancamento"; contaOrigem?: string; socios: Parceiro[];
}) {
  const [form, setForm] = useState({
    tipo: tipo === "socio" ? "anticipacao" : "despesa",
    descricao: "",
    parceiro_id: "",
    valor: "",
    conta_destino: "",
    data: "",
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#121417] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl animate-in max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h3 className="font-bold text-white">
            {tipo === "transferencia" ? "Nova Transferência" : tipo === "socio" ? "Novo Lançamento Sócio" : "Novo Lançamento (CP/CR)"}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
           {/* Form content simplified for mock purposes */}
           <div>
              <label className="text-xs font-bold text-muted-foreground uppercase mb-1.5 block">Descrição *</label>
              <input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white" required />
           </div>
           <div>
              <label className="text-xs font-bold text-muted-foreground uppercase mb-1.5 block">Valor *</label>
              <input value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white" required />
           </div>
        </form>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/5">
          <button onClick={onClose} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
          <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Criar</button>
        </div>
      </div>
    </div>
  );
}

function VincularModal({ 
  item, onClose, onVincular, onCriarNovo, lancamentos 
}: { 
  item: ExtratoItem; onClose: () => void; onVincular: (data: any) => void;
  onCriarNovo: (tipo: "transferencia" | "socio" | "lancamento") => void; lancamentos: LancamentoConciliacao[]
}) {
  const [search, setSearch] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [selecionados, setSelecionados] = useState<number[]>(item.vinculados || []);
  const [desconto, setDesconto] = useState(item.desconto || 0);
  const [acrescimo, setAcrescimo] = useState(item.acrescimo || 0);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [config, setConfig] = useState({
    retornarConciliados: "nao",
    filtrarConta: "nao",
    dias: 4,
    pesquisaAproximada: ""
  });
  const [tempConfig, setTempConfig] = useState(config);
  
  const tipoFiltro = item.valor > 0 ? "CR" : "CP";
  
  const disponiveis = lancamentos.filter(l => {
    if (l.tipo !== tipoFiltro) return false;
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(l.status.toLowerCase())) return false;
    if (search && !l.descricao.toLowerCase().includes(search.toLowerCase()) && 
        !l.parceiro_nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalSelecionado = selecionados.reduce((acc, id) => {
    const l = lancamentos.find(x => x.id === id);
    return acc + (l?.valor ?? 0);
  }, 0);

  const valorAjustado = Math.abs(item.valor) + acrescimo - desconto;
  const diferenca = valorAjustado - totalSelecionado;

  const handleConfirmar = () => {
    onVincular({
      lancamentos: selecionados,
      desconto,
      acrescimo,
      gerarPagamentoParcial: false,
      valorRestante: diferenca > 0 ? diferenca : 0
    });
  };

  const statusOptions = [
    { id: "pendente", label: "Pendente" },
    { id: "pago", label: "Pago" },
    { id: "recebido", label: "Recebido" },
    { id: "atrasado", label: "Atrasado" },
    { id: "cancelado", label: "Cancelado" },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-xl w-full max-w-6xl shadow-2xl max-h-[95vh] flex flex-col overflow-hidden animate-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/5">
           <h3 className="font-bold text-white text-lg">Pesquisa de lançamentos</h3>
           <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-muted-foreground transition-all">
             <X className="w-6 h-6" />
           </button>
        </div>

        {/* Toolbar / Filters */}
        <div className="p-4 border-b border-white/5 flex flex-wrap items-center gap-4 bg-black/20">
           {/* Status Popover */}
           <Popover>
              <PopoverTrigger asChild>
                <div className="relative cursor-pointer">
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-white hover:bg-white/10 transition-all">
                      Status <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      {selectedStatuses.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-destructive text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-black">
                          {selectedStatuses.length}
                        </span>
                      )}
                    </button>
                </div>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 bg-[#1a1c23] border border-white/10 p-2 shadow-2xl">
                 <div className="space-y-1">
                    {statusOptions.map(opt => (
                      <label key={opt.id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedStatuses.includes(opt.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedStatuses([...selectedStatuses, opt.id]);
                            else setSelectedStatuses(selectedStatuses.filter(s => s !== opt.id));
                          }}
                          className="accent-primary w-3.5 h-3.5 rounded"
                        />
                        <span className="text-xs text-white">{opt.label}</span>
                      </label>
                    ))}
                 </div>
              </PopoverContent>
           </Popover>

           {/* Date Range */}
           <DateRangePicker 
              startDate={dateStart} 
              endDate={dateEnd} 
              onChange={(s, e) => { setDateStart(s); setDateEnd(e); }}
              className="bg-white/5"
           />

           {/* Search Input */}
           <div className="flex-1 max-w-md relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar"
                className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-primary/50 transition-all"
              />
           </div>

           {/* Action Buttons */}
           <div className="flex items-center gap-2">
              <button className="px-4 py-2 bg-primary/10 text-primary text-[10px] font-black rounded-full hover:bg-primary/20 transition-all uppercase tracking-widest">
                Aplicar
              </button>
              <button onClick={() => { setSearch(""); setDateStart(""); setDateEnd(""); setSelectedStatuses([]); }} className="p-2 bg-white/5 text-muted-foreground rounded-full hover:bg-white/10 hover:text-white transition-all">
                <RotateCw className="w-4 h-4" />
              </button>
              <button onClick={() => { setSearch(""); setDateStart(""); setDateEnd(""); setSelectedStatuses([]); }} className="p-2 bg-destructive/10 text-destructive rounded-full hover:bg-destructive/20 transition-all">
                <X className="w-4 h-4" />
              </button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-2 bg-white/5 text-muted-foreground rounded-full hover:bg-white/10 hover:text-white transition-all">
                    <Settings className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[450px] bg-card border border-white/10 p-0 shadow-2xl rounded-xl overflow-hidden">
                   <div className="p-4 border-b border-white/5 bg-white/5">
                      <h4 className="font-bold text-white text-sm">Padrão Filtro</h4>
                   </div>
                   <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <span className="text-xs text-white">Retornar lançamentos Conciliados?</span>
                           <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                         </div>
                         <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/5">
                            {["sim", "nao"].map(v => (
                              <button key={v} onClick={() => setTempConfig({...tempConfig, retornarConciliados: v})}
                                className={`px-4 py-1 rounded-md text-[10px] font-bold transition-all ${tempConfig.retornarConciliados === v ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white"}`}>
                                {v === "sim" ? "Sim" : "Não"}
                              </button>
                            ))}
                         </div>
                      </div>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <span className="text-xs text-white">Filtrar pela conta selecionada?</span>
                           <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                         </div>
                         <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/5">
                            {["sim", "nao"].map(v => (
                              <button key={v} onClick={() => setTempConfig({...tempConfig, filtrarConta: v})}
                                className={`px-4 py-1 rounded-md text-[10px] font-bold transition-all ${tempConfig.filtrarConta === v ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-white"}`}>
                                {v === "sim" ? "Sim" : "Não"}
                              </button>
                            ))}
                         </div>
                      </div>
                      <div className="space-y-2">
                         <div className="flex items-center gap-2">
                           <span className="text-xs text-white">Quantidade de dias antes e depois do vencimento:</span>
                           <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                         </div>
                         <input type="number" value={tempConfig.dias} onChange={(e) => setTempConfig({...tempConfig, dias: parseInt(e.target.value) || 0})}
                           className="w-full bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none" />
                      </div>
                      <div className="space-y-2">
                         <div className="flex items-center gap-2">
                           <span className="text-xs text-white">Pesquisa aproximada do valor:</span>
                           <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                         </div>
                         <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                            <input type="text" value={tempConfig.pesquisaAproximada} onChange={(e) => setTempConfig({...tempConfig, pesquisaAproximada: e.target.value})}
                              className="w-full bg-black/20 border border-white/5 rounded-lg px-8 py-2 text-xs text-white outline-none" placeholder="0" />
                         </div>
                      </div>
                   </div>
                   <div className="p-4 bg-white/5 border-t border-white/5 flex justify-end gap-2">
                      <button onClick={() => setTempConfig(config)} className="px-4 py-2 text-[10px] font-bold text-white hover:bg-white/5 rounded-lg">Cancelar</button>
                      <button onClick={() => setConfig(tempConfig)} className="px-6 py-2 bg-success text-white text-[10px] font-bold rounded-lg hover:bg-success/90 transition-all">Salvar</button>
                   </div>
                </PopoverContent>
              </Popover>
           </div>

           {/* Criar Button */}
           <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-lg text-sm font-bold hover:bg-success/90 transition-all">
                Criar <ChevronDown className="w-4 h-4 opacity-70" />
              </button>
              <div className="absolute top-full right-0 mt-2 bg-card border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[200px] overflow-hidden">
                <button onClick={() => onCriarNovo("transferencia")} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs flex items-center gap-2 border-b border-white/5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-primary" /> Transferência
                </button>
                <button onClick={() => onCriarNovo("socio")} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs flex items-center gap-2 border-b border-white/5">
                  <Users className="w-3.5 h-3.5 text-teal-400" /> Antecipação Sócio
                </button>
                <button onClick={() => onCriarNovo("lancamento")} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white text-xs flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-orange-400" /> Lançamento (CP ou CR)
                </button>
              </div>
           </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-white/5 sticky top-0 z-10">
              <tr className="border-b border-white/5">
                <th className="px-6 py-4 w-10 text-center"><input type="checkbox" className="accent-primary rounded" /></th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Parcela</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-widest text-[10px] text-center">Tipo</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Vencimento</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Conta</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-widest text-[10px]">Cliente/Fornecedor</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-widest text-[10px] text-right">Valor (R$)</th>
                <th className="px-6 py-4 w-12 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {disponiveis.map(l => (
                <tr key={l.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-5 text-center">
                    <input type="checkbox" checked={selecionados.includes(l.id)} 
                      onChange={() => setSelecionados(s => s.includes(l.id) ? s.filter(x => x !== l.id) : [...s, l.id])} 
                      className="accent-primary rounded" />
                  </td>
                  <td className="px-6 py-5"><span className="bg-white/10 text-muted-foreground text-[9px] font-black px-3 py-1.5 rounded-full border border-white/5">4/12</span></td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-center gap-2">
                       <RotateCcw className="w-3.5 h-3.5 text-destructive animate-pulse" />
                       <span className="bg-destructive/20 p-2 rounded-lg border border-destructive/20">
                          <Building2 className="w-3.5 h-3.5 text-destructive" />
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-bold text-white">{l.vencimento}</td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-white uppercase tracking-tight">CAIXA MOVIMENTO</span>
                      <span className="text-[9px] text-muted-foreground/60 italic font-medium">Número da conta não cadastrado</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-white uppercase tracking-tight">{l.parceiro_nome}</span>
                      <span className="text-[9px] text-muted-foreground/60 italic font-medium truncate max-w-[200px]">Pagamento DO(A) {l.parceiro_nome}...</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-white text-base">{formatCurrencyValue(l.valor).replace("R$", "").trim()}</td>
                  <td className="px-6 py-5 text-right">
                    <button className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-muted-foreground hover:text-white">
                       <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {disponiveis.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-20 text-center text-muted-foreground italic">Nenhum lançamento disponível para conciliação.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Section */}
        <div className="px-6 py-4 bg-black/20 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="text-muted-foreground text-[11px] font-medium">Exibindo <span className="text-white">1 a {disponiveis.length}</span> de <span className="text-white">40</span> registros</div>
           <div className="flex items-center gap-6">
              <div className="flex border border-white/10 rounded-lg overflow-hidden bg-black/20">
                <button className="px-4 py-2 text-muted-foreground/30 text-[10px] font-black border-r border-white/5 bg-white/5 cursor-not-allowed">PRIMEIRO</button>
                <button className="px-4 py-2 text-muted-foreground/30 text-[10px] font-black bg-white/5 cursor-not-allowed">ANTERIOR</button>
              </div>
              <div className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5">Página <span className="bg-white/10 text-white w-6 h-6 flex items-center justify-center rounded-md font-black text-[10px]">1</span> de <span className="text-white">8</span></div>
              <div className="flex border border-white/10 rounded-lg overflow-hidden bg-black/20">
                <button className="px-4 py-2 text-white text-[10px] font-black border-r border-white/5 hover:bg-white/10">PRÓXIMA</button>
                <button className="px-4 py-2 text-white text-[10px] font-black hover:bg-white/10">ÚLTIMO</button>
              </div>
           </div>
        </div>

        {/* Footer info/actions */}
        <div className="px-6 py-5 bg-white/5 border-t border-white/10 flex flex-col xl:flex-row items-center justify-between gap-8">
           <button onClick={onClose} className="w-full xl:w-auto px-10 py-2.5 border border-white/10 bg-white/5 text-white rounded-xl text-xs font-bold hover:bg-white/10 transition-all">Cancelar</button>
           <div className="flex flex-wrap items-center justify-center gap-12 xl:gap-16">
              <div className="flex flex-col items-center">
                 <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-50">{item.descricao}</div>
                 <div className="text-xs text-white font-medium">24/04/2026 - <span className={cn("font-bold", item.valor > 0 ? "text-teal-400" : "text-destructive")}>{formatCurrencyValue(item.valor)}</span></div>
              </div>
              <div className="flex flex-col items-center">
                 <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-50">TOTAL SELECIONADO(S)</div>
                 <div className="text-xs text-white font-medium">{selecionados.length} - <span className="font-bold text-success">{formatCurrencyValue(totalSelecionado)}</span></div>
              </div>
              <div className="flex flex-col items-center">
                 <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-50">VALOR RESTANTE</div>
                 <div className={cn("text-sm font-black", Math.abs(diferenca) < 0.01 ? "text-success" : "text-warning")}>{formatCurrencyValue(Math.abs(diferenca))}</div>
              </div>
           </div>
           <button onClick={handleConfirmar} disabled={selecionados.length === 0} className="w-full xl:w-auto px-12 py-3 bg-success text-white rounded-xl text-sm font-black hover:bg-success/90 transition-all shadow-xl shadow-success/20 disabled:opacity-40 flex items-center justify-center gap-2">
             <Link2 className="w-4 h-4" /> Vincular Lançamentos
           </button>
        </div>
      </div>
    </div>
  );
}

function ImportarModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [step, setStep] = useState<"conta" | "carregando" | "extrato">("conta");
  const [contaSelecionada, setContaSelecionada] = useState<ContaBancaria | null>(null);
  const [extrato, setExtrato] = useState<ExtratoItem[]>(extratoMock.map(e => ({ ...e, status: "pendente" as const })));
  const [vinculandoId, setVinculandoId] = useState<number | null>(null);
  const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");

const contasMock: ContaBancaria[] = [
  { id: 1, nome: "Itaú", agencia: "1234", conta: "56789-0", tipo: "corrente" },
  { id: 2, nome: "Bradesco", agencia: "4321", conta: "98765-4", tipo: "corrente" },
];

const { data: contasAPI = [] } = useQuery<ContaBancaria[]>({
    queryKey: ["contas-bancarias"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_URL}/contas-bancarias`);
        if (!res.ok) return contasMock;
        const data = await res.json();
        return data.length > 0 ? data : contasMock;
      } catch (e) {
        return contasMock;
      }
    }
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !contaSelecionada) return;
    setArquivoNome(file.name);
    setStep("carregando");
    setTimeout(() => setStep("extrato"), 1500);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && contaSelecionada) {
      setArquivoNome(file.name);
      setStep("carregando");
      setTimeout(() => setStep("extrato"), 1500);
    }
  };

  const handleIgnorar = (id: number) => setExtrato(e => e.map(item => item.id === id ? { ...item, status: "ignorado" as const } : item));
  const handleVincular = (id: number) => setVinculandoId(id);

  const handleConfirmVincular = (itemId: number, data: any) => {
    setExtrato(e => e.map(item => item.id === itemId ? { 
      ...item, 
      status: "vinculado" as const, 
      vinculados: data.lancamentos, 
      desconto: data.desconto, 
      acrescimo: data.acrescimo,
      gerarResidual: true // Default to true when there is a difference
    } : item));
    setVinculandoId(null);
  };

  const toggleResidual = (itemId: number) => {
    setExtrato(e => e.map(item => item.id === itemId ? { ...item, gerarResidual: !item.gerarResidual } : item));
  };

  const handleDesvincular = (id: number) => setExtrato(e => e.map(item => item.id === id ? { ...item, status: "pendente" as const, vinculados: undefined, desconto: 0, acrescimo: 0 } : item));

  const pendentes = extrato.filter(e => e.status === "pendente").length;
  const vinculados = extrato.filter(e => e.status === "vinculado").length;
  const ignorados = extrato.filter(e => e.status === "ignorado").length;
  const totalItens = extrato.length;
  const isConciliado = pendentes === 0;

  const handleSalvar = () => {
    onSave({ conta: contaSelecionada, extrato, status: isConciliado ? "conciliado" : "pendente" });
    onClose();
  };

  const handleCriarNovo = (tipo: "transferencia" | "socio" | "lancamento") => {
    console.log("Criar novo lançamento:", tipo);
  };

  if (step === "conta") {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl animate-in">
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <h2 className="text-lg font-bold text-white">Importar Conciliação</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Selecione a Conta Bancária *</label>
              <select value={contaSelecionada?.id || ""} onChange={e => setContaSelecionada(contasAPI.find(c => c.id === parseInt(e.target.value)) || null)}
                className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none cursor-pointer">
                <option value="">Selecione uma conta...</option>
                {contasAPI.map(c => <option key={c.id} value={c.id}>{c.nome} - Ag: {c.agencia} / CC: {c.conta}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Importação Manual</label>
              <div className="border-2 border-dashed border-white/10 hover:border-primary/40 rounded-xl p-6 text-center cursor-pointer transition-colors"
                onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => fileInputRef?.click()}>
                <input ref={setFileInputRef} type="file" accept=".ofx,.csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                {arquivoNome ? (
                  <div className="flex items-center justify-center gap-2"><FileText className="w-6 h-6 text-success" /><p className="text-sm text-white font-medium">{arquivoNome}</p></div>
                ) : (
                  <><p className="text-sm text-muted-foreground">Arraste o arquivo aqui ou clique para selecionar</p><p className="text-xs text-muted-foreground/60 mt-1">Formatos aceitos: .OFX, .CSV, .XLSX</p></>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 p-6 pt-0">
            <button onClick={onClose} className="w-full sm:w-auto px-10 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
            <button onClick={() => arquivoNome && contaSelecionada && setStep("extrato")} disabled={!contaSelecionada || !arquivoNome}
              className="w-full sm:w-auto px-10 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2">
              <ChevronsRight className="w-4 h-4" /> Carregar Extrato
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "carregando") {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-8 text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">Processando arquivo...</h3>
          <p className="text-sm text-muted-foreground">{arquivoNome}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {vinculandoId !== null && (
        <VincularModal
          item={extrato.find(e => e.id === vinculandoId)!}
          onClose={() => setVinculandoId(null)}
          onVincular={(data) => handleConfirmVincular(vinculandoId, data)}
          onCriarNovo={handleCriarNovo}
          lancamentos={lancamentosDisponiveis}
        />
      )}

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-card border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-6xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-in">
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold text-white truncate">Conciliação — {contaSelecionada?.nome}</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Ag: {contaSelecionada?.agencia} · CC: {contaSelecionada?.conta}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg shrink-0 ml-2"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-6 py-3 bg-white/5 border-b border-white/5 flex items-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
               <div className="flex-1 text-center">Extrato</div>
               <div className="w-20"></div>
               <div className="flex-1 text-center">Movimentações não conciliadas</div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-black/40">
               {extrato.map(item => {
                 const linkedLancamentos = (item.vinculados || []).map(id => lancamentosDisponiveis.find(l => l.id === id)).filter(Boolean) as LancamentoConciliacao[];
                 const totalLinked = linkedLancamentos.reduce((acc, l) => acc + l.valor, 0);
                 const hasDifference = Math.abs(totalLinked) > Math.abs(item.valor);

                 return (
                   <div key={item.id} className={cn(
                     "flex items-stretch gap-4 transition-all duration-300",
                     item.status === "ignorado" ? "opacity-30 grayscale" : ""
                   )}>
                     {/* Left: Extrato */}
                     <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-center relative">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-white font-bold text-xs">{item.descricao}</span>
                           <div className="flex items-center gap-2">
                              {item.status === "pendente" && (
                                <button onClick={() => handleIgnorar(item.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors" title="Ignorar">
                                  <Ban className="w-3.5 h-3.5" /> <span className="text-[10px] ml-1">Ignorar</span>
                                </button>
                              )}
                              <span className={cn(
                                "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter",
                                item.status === "vinculado" ? "bg-success/20 text-success" : 
                                item.status === "ignorado" ? "bg-white/10 text-muted-foreground" : "bg-warning/20 text-warning"
                              )}>
                                {item.status === "vinculado" ? "Vinculado" : item.status === "ignorado" ? "Ignorado" : "Pendente"}
                              </span>
                           </div>
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-[10px] text-muted-foreground font-medium">{item.data} | {formatCurrencyValue(item.valor)}</span>
                           <div className="bg-success rounded p-1">
                              <Plus className="w-3 h-3 text-white" />
                           </div>
                        </div>
                     </div>

                     {/* Middle: Connection */}
                     <div className="w-20 flex flex-col items-center justify-center relative">
                        <div className="absolute inset-y-0 w-px border-l border-dashed border-white/20" />
                        <div className="z-10 bg-[#121417] p-2 rounded-full border border-white/10 shadow-xl group cursor-pointer" onClick={() => item.status === "pendente" && handleVincular(item.id)}>
                           {item.status === "vinculado" ? (
                             <Link2 className="w-4 h-4 text-success" />
                           ) : (
                             <Search className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
                           )}
                        </div>
                     </div>

                     {/* Right: Lancamentos */}
                     <div className="flex-1 flex flex-col justify-center">
                        {item.status === "vinculado" && linkedLancamentos.length > 0 ? (
                          <div className="space-y-3">
                            {linkedLancamentos.map(l => (
                              <div key={l.id} className="bg-white/5 border border-white/10 rounded-xl p-4 relative group animate-in slide-in-from-right-4">
                                 <div className="flex items-center justify-between mb-1">
                                    <span className="text-white font-bold text-xs">{l.descricao}</span>
                                    <button onClick={() => handleDesvincular(item.id)} className="p-1.5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                                       <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                 </div>
                                 <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                       <span className="text-[10px] text-muted-foreground font-medium">{l.vencimento} | {formatCurrencyValue(l.valor)}</span>
                                    </div>
                                    {hasDifference && (
                                      <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
                                         <label className="flex items-center gap-2 cursor-pointer group/label">
                                            <input 
                                              type="checkbox" 
                                              checked={item.gerarResidual} 
                                              onChange={() => toggleResidual(item.id)}
                                              className="accent-primary w-3 h-3 rounded"
                                            />
                                            <span className="text-[10px] text-primary font-bold group-hover/label:underline underline-offset-2">Gerar movimentação residual</span>
                                         </label>
                                         <div className="flex items-center gap-4 text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">
                                            <span>Desconto: 0.00</span>
                                            <span>|</span>
                                            <span>Acréscimo: 0.00</span>
                                         </div>
                                      </div>
                                    )}
                                 </div>
                              </div>
                            ))}
                          </div>
                        ) : item.status === "pendente" ? (
                          <div className="h-full flex items-center">
                            <button 
                              onClick={() => handleVincular(item.id)}
                              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-white/10 hover:text-white transition-all"
                            >
                              <Search className="w-3.5 h-3.5" /> Vincular
                            </button>
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground italic text-center">Item ignorado</div>
                        )}
                     </div>
                   </div>
                 );
               })}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-white/5">
            <div className="flex items-center gap-2"><span className={cn("text-xs px-3 py-1.5 rounded-full font-medium", isConciliado ? "bg-success/20 text-success" : "bg-white/10 text-muted-foreground")}>{isConciliado ? "CONCILIADO" : "PENDENTE"}</span><span className="text-xs text-muted-foreground">{vinculados + ignorados} de {totalItens} itens processados</span></div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Fechar</button>
              <button onClick={handleSalvar} className={cn("px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2", isConciliado ? "bg-success hover:bg-success/90 text-white" : "bg-primary hover:bg-primary/90 text-white")}>
                <CheckCircle className="w-4 h-4" /> Salvar Conciliação
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ConciliacaoList() {
  const [showImportar, setShowImportar] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroConta, setFiltroConta] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [conciliacoes, setConciliacoes] = useState([
    { id: 1, banco: "Itaú", agencia: "1234", conta: "56789-0", periodo: "01/10 a 31/10/2023", conciliados: 45, ignorados: 2, pendentes: 0, total: 47, status: "conciliado" as const },
    { id: 2, banco: "Bradesco", agencia: "4321", conta: "98765-4", periodo: "01/10 a 15/10/2023", conciliados: 12, ignorados: 0, pendentes: 5, total: 17, status: "pendente" as const },
  ]);

  const filteredConciliacoes = conciliacoes.filter(c => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (filtroConta && c.banco.toLowerCase() !== filtroConta.toLowerCase()) return false;
    return true;
  });

  const handleSalvarConciliacao = (data: any) => {
    setConciliacoes([...conciliacoes, {
      id: Date.now(), banco: data.conta.nome, agencia: data.conta.agencia, conta: data.conta.conta, periodo: "Novo período",
      conciliados: data.extrato.filter((e: any) => e.status === "vinculado").length,
      ignorados: data.extrato.filter((e: any) => e.status === "ignorado").length,
      pendentes: data.extrato.filter((e: any) => e.status === "pendente").length,
      total: data.extrato.length, status: data.status as "conciliado" | "pendente"
    }]);
  };

  return (
    <div className="space-y-6">
      {showImportar && <ImportarModal onClose={() => setShowImportar(false)} onSave={handleSalvarConciliacao} />}
      <PageHeader title="Conciliação Bancária" description="Importe extratos e concilie com seus lançamentos financeiros"
        actions={<button onClick={() => setShowImportar(true)} className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-success/25"><Plus className="w-4 h-4" /> Importar Extrato</button>} />
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center gap-3 bg-black/10">
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none"><option value="">Status</option><option value="conciliado">Conciliado</option><option value="pendente">Pendente</option></select>
          <select value={filtroConta} onChange={e => setFiltroConta(e.target.value)} className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none"><option value="">Todas as Contas</option>{contasBancariasMock.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}</select>
          <DateRangePicker startDate={filtroDataInicio} endDate={filtroDataFim} className="w-auto" onChange={(s, e) => { setFiltroDataInicio(s); setFiltroDataFim(e); }} />
          {(filtroStatus || filtroConta || filtroDataInicio || filtroDataFim) && <button onClick={() => { setFiltroStatus(""); setFiltroConta(""); setFiltroDataInicio(""); setFiltroDataFim(""); }} className="text-xs text-muted-foreground hover:text-white flex items-center gap-1"><X className="w-3 h-3" /> Limpar</button>}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-black/20 text-muted-foreground"><tr><th className="px-6 py-4 font-medium text-center w-32">Status</th><th className="px-6 py-4 font-medium">Banco / Conta</th><th className="px-6 py-4 font-medium">Período</th><th className="px-6 py-4 font-medium text-center text-success">Conciliados</th><th className="px-6 py-4 font-medium text-center text-muted-foreground">Ignorados</th><th className="px-6 py-4 font-medium text-center text-warning">Pendentes</th><th className="px-6 py-4 font-medium text-center">Total</th><th className="px-6 py-4 font-medium text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-white/5">{filteredConciliacoes.map(c => (<tr key={c.id} className="hover:bg-white/5 transition-colors group cursor-pointer" onDoubleClick={() => setShowImportar(true)}><td className="px-6 py-4 text-center"><span className={cn("text-xs px-3 py-1.5 rounded-full font-medium", c.status === "conciliado" ? "bg-success/20 text-success" : "bg-white/10 text-muted-foreground")}>{c.status === "conciliado" ? "Conciliado" : "Pendente"}</span></td><td className="px-6 py-4"><div className="font-semibold text-white">{c.banco}</div><div className="text-xs text-muted-foreground">Ag: {c.agencia} | CC: {c.conta}</div></td><td className="px-6 py-4 text-muted-foreground">{c.periodo}</td><td className="px-6 py-4 text-center font-semibold text-success">{c.conciliados}</td><td className="px-6 py-4 text-center text-muted-foreground">{c.ignorados}</td><td className="px-6 py-4 text-center font-semibold text-warning">{c.pendentes}</td><td className="px-6 py-4 text-center font-bold text-white">{c.total}</td><td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2"><button onClick={() => setShowImportar(true)} className="p-2.5 rounded-xl hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"><Pencil className="w-5 h-5" /></button><button className="p-2.5 rounded-xl hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-5 h-5" /></button></div></td></tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}