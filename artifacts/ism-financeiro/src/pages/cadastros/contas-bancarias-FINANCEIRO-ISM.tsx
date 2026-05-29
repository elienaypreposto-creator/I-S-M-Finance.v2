import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  Trash2,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { contaBancariaFormSchema, type ContaBancariaFormValues } from "@/validations/cadastros.schema";
import { apiValorToValorBr, brMoneyDisplayToApiString, formatValorBrInput } from "@/validations/lancamentos.schema";

type ContaBancaria = {
  id: number;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: string;
  status: string;
  cor: string;
  saldo_inicial: number | string;
  saldo_atual: number | string;
  data_inicio?: string | null;
};

function toCents(v: string | number): number {
  if (typeof v === "number") return Math.round(v * 100);
  const str = String(v).replace(",", ".");
  return Math.round(Number(str) * 100);
}

// ─── Máscaras ──────────────────────────────────────────────────────────────────
// Agência: até 4 dígitos + dígito verificador opcional → 0000 ou 0000-0
function maskAgencia(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 5);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

// Conta: até 7 dígitos + dígito verificador obrigatório → 00000-0
function maskConta(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 1) return digits;
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  onClose: () => void;
  initialData?: ContaBancaria | null;
}

function NovaContaModal({ onClose, initialData }: ModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const defaultValues = useMemo<ContaBancariaFormValues>(
    () => ({
      nome: initialData?.nome ?? "",
      banco: initialData?.banco ?? "",
      agencia: initialData?.agencia ?? "",
      conta: initialData?.conta ?? "",
      tipo: initialData?.tipo ?? "Conta Corrente",
      saldo_inicial_br: initialData ? apiValorToValorBr(initialData.saldo_inicial) : "",
      cor: initialData?.cor?.match(/^#[0-9A-Fa-f]{6}$/i) ? initialData.cor : "#3BA8DC",
    }),
    [initialData],
  );

  const form = useForm<ContaBancariaFormValues>({
    resolver: zodResolver(contaBancariaFormSchema),
    defaultValues,
  });

  const {
    register,
    control,
    handleSubmit,
    trigger,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = form;

  useEffect(() => {
    reset(defaultValues);
    setStep(1);
  }, [defaultValues, reset]);

  const mutation = useMutation({
    mutationFn: (values: ContaBancariaFormValues) => {
      const isEdit = !!initialData;
      const saldoApi = brMoneyDisplayToApiString(values.saldo_inicial_br) || "0.00";
      const body = {
        nome: values.nome.trim(),
        banco: values.banco?.trim() || null,
        agencia: values.agencia?.trim() || null,
        conta: values.conta?.trim() || null,
        tipo: values.tipo,
        saldo_inicial: saldoApi,
        data_inicio: initialData?.data_inicio ?? new Date().toISOString().split("T")[0],
        cor: values.cor,
        ...(isEdit && initialData ? { status: initialData.status } : {}),
      };
      const path = isEdit ? `/contas-bancarias/${initialData.id}` : "/contas-bancarias";
      return fetchApiData<ContaBancaria>(path, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contas-bancarias"] });
      toast({
        title: initialData ? "Conta atualizada" : "Conta cadastrada",
        description: "As informações foram salvas com sucesso.",
      });
      onClose();
    },
    onError: (e: unknown) => {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    },
  });

  const goNext = async () => {
    const ok = await trigger(["nome", "tipo"]);
    if (ok) setStep(2);
  };

  const onSubmitFinal = handleSubmit((values) => {
    mutation.mutate(values);
  });

  const cor = watch("cor");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white">
              {initialData ? "Editar Contas Bancárias" : "Nova Conta Bancária"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Passo {step} de 2</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-4">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-all ${s <= step ? "bg-primary" : "bg-white/10"}`}
            />
          ))}
        </div>

        <form noValidate className="flex flex-col">
          <div className="p-6 space-y-4">
            {/* ── Passo 1: Nome e Tipo ── */}
            {step === 1 && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Nome Exibição (Apelido)
                  </label>
                  <input
                    {...register("nome")}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                    placeholder="Ex: Itaú PJ Principal"
                  />
                  {errors.nome && (
                    <p className="text-[11px] text-destructive mt-1">{errors.nome.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Banco
                    </label>
                    <input
                      {...register("banco")}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                      placeholder="Itaú"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Tipo de Conta
                    </label>
                    <select
                      {...register("tipo")}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-primary/50 transition-colors"
                    >
                      <option value="Conta Corrente">Conta Corrente</option>
                      <option value="Conta PJ">Conta PJ</option>
                      <option value="Poupança">Poupança</option>
                      <option value="Investimento">Investimento</option>
                    </select>
                    {errors.tipo && (
                      <p className="text-[11px] text-destructive mt-1">{errors.tipo.message}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── Passo 2: Agência, Conta, Saldo, Cor ── */}
            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {/* Agência com máscara */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Agência
                    </label>
                    <Controller
                      name="agencia"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(maskAgencia(e.target.value))
                          }
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors font-mono"
                          placeholder="0000-0"
                          maxLength={6}
                        />
                      )}
                    />
                    {errors.agencia && (
                      <p className="text-[11px] text-destructive mt-1">{errors.agencia.message}</p>
                    )}
                  </div>

                  {/* Conta com máscara */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Conta
                    </label>
                    <Controller
                      name="conta"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(maskConta(e.target.value))
                          }
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors font-mono"
                          placeholder="00000-0"
                          maxLength={9}
                        />
                      )}
                    />
                    {errors.conta && (
                      <p className="text-[11px] text-destructive mt-1">{errors.conta.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Saldo Inicial (Sistema começará com este valor)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">
                      R$
                    </span>
                    <Controller
                      name="saldo_inicial_br"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={field.value}
                          onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors font-bold"
                          placeholder="0,00"
                        />
                      )}
                    />
                  </div>
                  {errors.saldo_inicial_br && (
                    <p className="text-[11px] text-destructive mt-1">
                      {errors.saldo_inicial_br.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Cor de Identificação
                  </label>
                  <div className="flex gap-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                    {["#3BA8DC", "#E67E22", "#8B5CF6", "#27AE60", "#E74C3C"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setValue("cor", c, { shouldValidate: true })}
                        className={cn(
                          "w-8 h-8 rounded-lg border-2 transition-all",
                          cor === c
                            ? "border-white scale-110"
                            : "border-transparent opacity-50 hover:opacity-100",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  {errors.cor && (
                    <p className="text-[11px] text-destructive mt-1">{errors.cor.message}</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-6 pt-0 border-t border-white/5">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-all"
              >
                Voltar
              </button>
            )}

            {step < 2 ? (
              <button
                type="button"
                onClick={() => void goNext()}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-all"
              >
                Próximo
              </button>
            ) : (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => void onSubmitFinal()}
                className="flex-1 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : initialData ? (
                  "Salvar Alterações"
                ) : (
                  "Confirmar Cadastro"
                )}
              </button>
            )}
          </div>
        </form>
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
    queryFn: () => fetchApiData<ContaBancaria[]>("/contas-bancarias"),
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetchApiData<ContaBancaria>(`/contas-bancarias/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["contas-bancarias"] });
      toast({
        title: variables.status === "ativo" ? "Conta desbloqueada" : "Conta bloqueada",
        description: `O status da conta foi alterado para ${variables.status}.`,
      });
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApiData<{ deleted?: boolean }>(`/contas-bancarias/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contas-bancarias"] });
      toast({ title: "Conta removida", description: "A conta foi deletada com sucesso." });
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const totalSaldoCents = contas
    .filter((c) => c.status === "ativo")
    .reduce((acc, c) => acc + toCents(c.saldo_atual), 0);

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-6">
      {(showModal || editingConta) && (
        <NovaContaModal
          key={editingConta?.id ?? "new"}
          initialData={editingConta}
          onClose={() => {
            setShowModal(false);
            setEditingConta(null);
          }}
        />
      )}

      <PageHeader
        title="Contas Bancárias"
        description="Gerencie as contas bancárias reais da empresa. O saldo é atualizado automaticamente via conciliação."
        actions={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowSaldos((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
            >
              {showSaldos ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showSaldos ? "Ocultar" : "Mostrar"} Saldos
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
            >
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
              {showSaldos ? formatCurrency(totalSaldoCents / 100) : "R$ ••••••"}
            </p>
          </div>
          <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center">
            <Landmark className="w-7 h-7 text-primary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {contas.map((conta) => (
          <div
            key={conta.id}
            className={`glass-panel rounded-2xl p-6 border transition-all ${
              conta.status === "bloqueado"
                ? "opacity-60 border-destructive/20 grayscale-[0.5]"
                : "border-white/5 hover:border-white/20"
            }`}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${conta.cor}20` }}
                >
                  <Landmark className="w-6 h-6" style={{ color: conta.cor }} />
                </div>
                <div>
                  <h3 className="font-bold text-white leading-tight">{conta.nome}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {conta.banco} · {conta.tipo}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingConta(conta)}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    blockMutation.mutate({
                      id: conta.id,
                      status: conta.status === "ativo" ? "bloqueado" : "ativo",
                    })
                  }
                  className={`p-2 rounded-lg transition-colors ${
                    conta.status === "ativo"
                      ? "bg-white/5 hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400"
                      : "bg-success/20 text-success hover:bg-success/30"
                  }`}
                >
                  {conta.status === "ativo" ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    confirm("Deseja realmente deletar?") && deleteMutation.mutate(conta.id)
                  }
                  className="p-2 bg-white/5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">
                  Agência
                </p>
                <p className="text-sm text-white font-mono font-bold">{conta.agencia || "—"}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">
                  Conta
                </p>
                <p className="text-sm text-white font-mono font-bold">{conta.conta || "—"}</p>
              </div>
            </div>

            <div className="flex items-end justify-between pt-4 border-t border-white/5">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">
                  Saldo Atual
                </p>
                <p className="text-2xl font-bold" style={{ color: conta.cor }}>
                  {showSaldos ? formatCurrency(toCents(conta.saldo_atual) / 100) : "R$ ••••••"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1">
                  Status
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                    conta.status === "ativo"
                      ? "bg-success/20 text-success"
                      : "bg-destructive/20 text-destructive"
                  }`}
                >
                  {conta.status === "ativo" ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  {conta.status}
                </span>
              </div>
            </div>
          </div>
        ))}

        {contas.length === 0 && !isLoading && (
          <div className="col-span-full py-16 text-center glass-panel rounded-2xl border-dashed border-2 border-white/10">
            <Landmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm font-medium">
              Nenhuma conta cadastrada ainda.
            </p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="text-primary text-sm font-bold hover:underline mt-2"
            >
              Clique aqui para criar sua primeira conta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}