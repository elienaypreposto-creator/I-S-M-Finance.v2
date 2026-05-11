import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format as formatBtn, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { fetchApiData } from "@/lib/api-config";
import {
  formatValorBrInput,
  getLancamentoModalDefaultValues,
  lancamentoModalFormSchema,
  mapModalFormToApiBody,
  type LancamentoApiBody,
  type LancamentoEditItem,
  type LancamentoModalFormValues,
} from "@/validations/lancamentos.schema";
import {
  Plus,
  Loader2,
  X,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Target,
} from "lucide-react";

type PlanoConta = { id: number; tipo: string; categoria: string; subcategoria: string | null };
type Parceiro = { id: number; nome: string; tipo_pessoa: string };

const BASE_RISK_LEVELS: Record<number, { label: string; color: string; tags: string[] }> = {
  1: { label: "Nível 1 - Alerta", color: "text-yellow-400", tags: ["Multas e Juros", "Perda de Desconto", "Restrição de Crédito"] },
  2: { label: "Nível 2 - Risco Operacional", color: "text-orange-500", tags: ["Corte de Serviço", "Suspensão de Fornecimento", "Negativação", "Perda de Benefício Fiscal"] },
  3: { label: "Nível 3 - Risco Jurídico", color: "text-red-500", tags: ["Protesto", "Ação Judicial", "Dívida Ativa", "Quebra de Contrato"] },
  4: { label: "Nível 4 - Risco Crítico", color: "text-purple-400", tags: ["Bloqueio de Contas (Sisbajud)", "Penhora de Bens", "Pedido de Falência", "Impedimento de Certidão"] },
};

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
          <button type="button" onClick={() => setCurrentYear((y) => y - 1)} className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-white tracking-widest">{currentYear}</span>
          <button type="button" onClick={() => setCurrentYear((y) => y + 1)} className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {months.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                const monthStr = (i + 1).toString().padStart(2, "0");
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
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-1.5 bg-success hover:bg-success/90 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-success/20">
            Confirmar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type LancamentoModalProps = {
  onClose: () => void;
  onSaved: () => void;
  editItem?: LancamentoEditItem | null;
};

export function LancamentoModal({ onClose, onSaved, editItem }: LancamentoModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [riskLevels, setRiskLevels] = useState(BASE_RISK_LEVELS);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTag, setNewTag] = useState({ name: "", level: 1 });
  const [nivelRisco, setNivelRisco] = useState(0);

  const form = useForm<LancamentoModalFormValues>({
    resolver: zodResolver(lancamentoModalFormSchema),
    defaultValues: getLancamentoModalDefaultValues(editItem),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = form;

  const vencimento = watch("vencimento");
  const tipo = watch("tipo");
  const status = watch("status");
  const riscos = watch("riscos");

  useEffect(() => {
    reset(getLancamentoModalDefaultValues(editItem));
    setNivelRisco(0);
    setRiskLevels(BASE_RISK_LEVELS);
    setShowAddTag(false);
  }, [editItem, reset]);

  useEffect(() => {
    if (tipo === "CR" && status === "pago") {
      setValue("status", "recebido", { shouldValidate: true });
    }
    if (tipo === "CP" && status === "recebido") {
      setValue("status", "pago", { shouldValidate: true });
    }
  }, [tipo, status, setValue]);

  useEffect(() => {
    if (vencimento && nivelRisco === 0) {
      const vcto = new Date(vencimento + "T00:00:00");
      const hoje = new Date();
      const diffDays = Math.floor((hoje.getTime() - vcto.getTime()) / (1000 * 60 * 60 * 24));

      let level = 0;
      if (diffDays >= 1 && diffDays <= 15) level = 1;
      else if (diffDays >= 16 && diffDays <= 30) level = 2;
      else if (diffDays >= 31 && diffDays <= 60) level = 3;
      else if (diffDays > 60) level = 4;

      setNivelRisco(level);
    }
  }, [vencimento, nivelRisco]);

  const { data: parceiros = [] } = useQuery<Parceiro[]>({
    queryKey: ["parceiros-modal"],
    queryFn: () => fetchApiData<Parceiro[]>("/parceiros?page=1&limit=500"),
  });

  const { data: planoContas = [] } = useQuery<PlanoConta[]>({
    queryKey: ["plano-contas-modal"],
    queryFn: () => fetchApiData<PlanoConta[]>("/plano-contas"),
  });

  const mutation = useMutation({
    mutationFn: (body: LancamentoApiBody) => {
      if (editItem) {
        return fetchApiData(`/lancamentos/${editItem.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }
      return fetchApiData(`/lancamentos`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({ title: "Sucesso", description: editItem ? "Lançamento atualizado." : "Lançamento criado." });
      onSaved();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar o lançamento.";
      toast({ variant: "destructive", title: "Erro", description: msg });
    },
  });

  const onSubmit = (values: LancamentoModalFormValues) => {
    mutation.mutate(mapModalFormToApiBody(values));
  };

  const handleToggleTag = (tag: string) => {
    const exists = riscos.includes(tag);
    setValue("riscos", exists ? riscos.filter((t) => t !== tag) : [...riscos, tag], { shouldDirty: true, shouldValidate: true });
  };

  const handleCreateTag = () => {
    if (!newTag.name) return;
    setRiskLevels((prev) => {
      const lv = prev[newTag.level];
      return { ...prev, [newTag.level]: { ...lv, tags: [...lv.tags, newTag.name] } };
    });
    setNewTag({ name: "", level: newTag.level });
    setShowAddTag(false);
    toast({ title: "Tag criada", description: `Tag adicionada ao Nível ${newTag.level}.` });
  };

  const inputCls =
    "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
  const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
  const selectCls =
    "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer";
  const errorCls = "text-[10px] text-destructive mt-1 font-medium";

  const selectedRisk = riskLevels[nivelRisco];
  const isCP = tipo === "CP";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-md p-4 pt-16 overflow-hidden">
      <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#121417] rounded-t-2xl">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tighter">
              {editItem ? "Editar Lançamento" : "Novo Lançamento"}
            </h2>
            <p className="text-xs text-muted-foreground">Preencha os dados financeiros detalhados</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-muted-foreground hover:text-white transition-all group">
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div>
                <label className={labelCls}>Tipo de Registro *</label>
                <div className="flex gap-3">
                  {[
                    { v: "CP" as const, label: "Contas a Pagar", color: "border-orange-500 bg-orange-500/10 text-orange-400" },
                    { v: "CR" as const, label: "Contas a Receber", color: "border-teal-500 bg-teal-500/10 text-teal-400" },
                  ].map(({ v, label, color }) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => setValue("tipo", v, { shouldValidate: true, shouldDirty: true })}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                        tipo === v ? `${color} shadow-lg` : "border-white/5 bg-white/5 text-muted-foreground hover:border-white/10"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {errors.tipo && <p className={errorCls}>{errors.tipo.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Data de Vencimento *</label>
                  <Controller
                    name="vencimento"
                    control={control}
                    render={({ field }) => (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              inputCls,
                              "flex items-center justify-between text-left font-normal",
                              !field.value && "text-muted-foreground/30",
                            )}>
                            {field.value ? formatBtn(parseISO(field.value), "dd/MM/yyyy") : "Selecione uma data..."}
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border border-white/10" align="start">
                          <CalendarPicker
                            mode="single"
                            selected={field.value ? parseISO(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? formatBtn(date, "yyyy-MM-dd") : "")}
                            locale={ptBR}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                  {errors.vencimento && <p className={errorCls}>{errors.vencimento.message}</p>}
                </div>
                <div className="relative">
                  <label className={labelCls}>Mês de Competência</label>
                  <Controller
                    name="competencia"
                    control={control}
                    render={({ field }) => <CompetenciaPicker value={field.value || ""} onChange={field.onChange} />}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Parceiro Comercial</label>
                <select {...register("parceiro_id")} className={selectCls}>
                  <option value="">Selecione quem paga/recebe...</option>
                  {parceiros.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                {errors.parceiro_id && <p className={errorCls}>{errors.parceiro_id.message}</p>}
              </div>

              <div>
                <label className={labelCls}>Título / Descrição</label>
                <input type="text" {...register("descricao")} className={inputCls} placeholder="Ex: Manutenção servidor AWS, Aluguel Setembro..." />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className={labelCls}>Classificação (Plano de Contas)</label>
                <select {...register("plano_conta_id")} className={selectCls}>
                  <option value="">Indique a categoria contábil...</option>
                  {planoContas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.categoria} {p.subcategoria ? `— ${p.subcategoria}` : ""}
                    </option>
                  ))}
                </select>
                {errors.plano_conta_id && <p className={errorCls}>{errors.plano_conta_id.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Valor Previsto (R$)</label>
                  <Controller
                    name="valorBr"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={field.value}
                        onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className={`${inputCls} font-bold text-lg text-primary`}
                        placeholder="0,00"
                      />
                    )}
                  />
                  {errors.valorBr && <p className={errorCls}>{errors.valorBr.message}</p>}
                </div>
                <div>
                  <label className={labelCls}>Status Atual</label>
                  <select {...register("status")} className={selectCls}>
                    <option value="pendente">Pendente</option>
                    {tipo === "CR" ? (
                      <option value="recebido">Recebido (Liquidado)</option>
                    ) : (
                      <option value="pago">Pago (Liquidado)</option>
                    )}
                    <option value="atrasado">Atrasado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                  {errors.status && <p className={errorCls}>{errors.status.message}</p>}
                </div>
              </div>

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
                      value={nivelRisco}
                      onChange={(e) => {
                        setNivelRisco(parseInt(e.target.value, 10));
                        setValue("riscos", [], { shouldDirty: true });
                      }}
                      className={`${selectCls} border-white/5 bg-black/40 font-black tracking-tight ${selectedRisk?.color || "text-white/40"} hover:border-white/20`}>
                      <option value={0}>Sem Risco Definido</option>
                      {Object.entries(riskLevels).map(([lv, data]) => (
                        <option key={lv} value={lv} className="bg-[#1a1c23] py-2">
                          {data.label}
                        </option>
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
                          className={`text-[9px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all border ${
                            showAddTag
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                          }`}>
                          <Plus className={`w-2.5 h-2.5 transition-transform ${showAddTag ? "rotate-45" : ""}`} />
                          {showAddTag ? "Cancelar" : "Nova Tag"}
                        </button>
                      </div>

                      {showAddTag && (
                        <div className="flex gap-2 p-1.5 bg-black/60 rounded-xl border border-primary/20 animate-in ring-1 ring-primary/10">
                          <input
                            type="text"
                            autoFocus
                            value={newTag.name}
                            onChange={(e) => setNewTag((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
                            placeholder="NOME DA NOVA TAG..."
                            className="bg-transparent border-none outline-none text-[10px] font-bold text-white flex-1 px-2"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleCreateTag();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleCreateTag}
                            className="text-[10px] font-black bg-primary/20 hover:bg-primary text-primary hover:text-white px-4 py-1.5 rounded-lg transition-all">
                            CRIAR
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                        {selectedRisk.tags.map((tag) => {
                          const selected = riscos.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleToggleTag(tag)}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all flex items-center gap-2 group/tag ${
                                selected
                                  ? `${selectedRisk.color.replace("text-", "bg-")}/20 ${selectedRisk.color} border-current shadow-lg shadow-current/5`
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
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-black shadow-xl shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : editItem ? "Salvar Alterações" : "Concluir Lançamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
