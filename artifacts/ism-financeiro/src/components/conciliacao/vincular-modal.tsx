import { useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildVincularFormSchema, type VincularFormValues } from "@/validations/conciliacao-vincular.schema";
import { formatValorBrInput, brMoneyDisplayToApiString } from "@/validations/lancamentos.schema";
import { Loader2, X, Link2, AlertCircle } from "lucide-react";

export type LancamentoCompativel = {
  id: number;
  tipo: string;
  vencimento: string;
  descricao: string | null;
  valor: string | number;
  status: string;
  parceiro_id: number | null;
  plano_conta_id: number | null;
};

type VincularModalProps = {
  open: boolean;
  onClose: () => void;
  extratoId: string;
  linhaId: number;
  valorExtratoAbs: string | number;
  onSuccess: () => void;
};

type VincularPayload = {
  lancamentos: Array<{ lancamento_id: number; desconto: string; acrescimo: string }>;
  gerar_parcial: boolean;
};

function VincularFormBody({
  extratoId,
  linhaId,
  valorExtratoAbs,
  lancamentos,
  onClose,
  onSuccess,
}: {
  extratoId: string;
  linhaId: number;
  valorExtratoAbs: string | number;
  lancamentos: LancamentoCompativel[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const lancamentosValorById = useMemo(() => {
    const m = new Map<number, string | number>();
    for (const l of lancamentos) {
      m.set(l.id, l.valor);
    }
    return m;
  }, [lancamentos]);

  const schema = useMemo(
    () => buildVincularFormSchema(valorExtratoAbs, lancamentosValorById),
    [valorExtratoAbs, lancamentosValorById],
  );

  const defaultItens = useMemo(
    () =>
      lancamentos.map((l) => ({
        lancamento_id: l.id,
        selecionado: false,
        desconto: "",
        acrescimo: "",
      })),
    [lancamentos],
  );

  const form = useForm<VincularFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      gerar_parcial: false,
      itens: defaultItens,
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: "itens" });

  const vincularMutation = useMutation({
    mutationFn: (payload: VincularPayload) =>
      fetchApiData(`/conciliacoes/linhas/${linhaId}/vincular`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conciliacao-extrato", extratoId] });
      void queryClient.invalidateQueries({ queryKey: ["conciliacoes"] });
      toast({ title: "Vínculo registrado", description: "A linha foi conciliada com os lançamentos selecionados." });
      onClose();
      onSuccess();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Não foi possível vincular.";
      toast({ variant: "destructive", title: "Erro ao vincular", description: msg });
    },
  });

  const onSubmit = (values: VincularFormValues) => {
    const lancamentosPayload = values.itens
      .filter((i) => i.selecionado)
      .map((i) => ({
        lancamento_id: i.lancamento_id,
        desconto: brMoneyDisplayToApiString(i.desconto) || "0.00",
        acrescimo: brMoneyDisplayToApiString(i.acrescimo) || "0.00",
      }));
    vincularMutation.mutate({ lancamentos: lancamentosPayload, gerar_parcial: values.gerar_parcial });
  };

  const {
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = form;

  const inputCls =
    "w-full bg-[#1a1c23] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary/50";
  const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-wider";

  const itensRootError =
    typeof errors.itens === "object" && errors.itens !== null && "message" in errors.itens
      ? String((errors.itens as { message?: string }).message)
      : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
      <div className="px-5 pt-4 pb-2 border-b border-white/5 shrink-0">
        <Controller
          name="gerar_parcial"
          control={control}
          render={({ field }) => (
            <label className="flex items-start gap-3 cursor-pointer group">
              <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />
              <div>
                <span className="text-sm font-medium text-white group-hover:text-primary/90 transition-colors">
                  Gerar resíduo parcial
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Quando a soma dos lançamentos for menor que o valor da linha do extrato, cria automaticamente um lançamento
                  pendente com o saldo restante.
                </p>
              </div>
            </label>
          )}
        />
        {errors.gerar_parcial?.message && (
          <p className="text-[10px] text-destructive mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {errors.gerar_parcial.message}
          </p>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-[200px] max-h-[50vh] px-5">
        <div className="space-y-2 py-4">
          {fields.map((field, index) => {
            const l = lancamentos.find((x) => x.id === field.lancamento_id);
            if (!l) return null;
            const selected = watch(`itens.${index}.selecionado`);
            return (
              <div
                key={field.id}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  selected ? "border-primary/40 bg-primary/5" : "border-white/10 bg-black/20",
                )}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <Controller
                    name={`itens.${index}.selecionado`}
                    control={control}
                    render={({ field: cb }) => (
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Checkbox
                          checked={cb.value}
                          onCheckedChange={(c) => cb.onChange(c === true)}
                          className="mt-1 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-[10px] font-black px-1.5 py-0.5 rounded",
                                l.tipo === "CR" ? "bg-teal-500/20 text-teal-300" : "bg-orange-500/20 text-orange-300",
                              )}>
                              {l.tipo}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(l.vencimento)}</span>
                            <span className="text-[10px] text-muted-foreground uppercase">{l.status}</span>
                          </div>
                          <p className="text-sm text-white font-medium mt-1 truncate" title={l.descricao ?? ""}>
                            {l.descricao ?? "—"}
                          </p>
                          <p className="text-sm font-bold text-primary mt-0.5">{formatCurrency(Number(l.valor))}</p>
                        </div>
                      </div>
                    )}
                  />
                  <div className="flex gap-3 sm:w-52 shrink-0">
                    <div className="flex-1">
                      <span className={labelCls}>Desconto</span>
                      <Controller
                        name={`itens.${index}.desconto`}
                        control={control}
                        render={({ field: inputField }) => (
                          <input
                            type="text"
                            inputMode="numeric"
                            className={inputCls}
                            placeholder="0,00"
                            value={inputField.value}
                            onChange={(e) => inputField.onChange(formatValorBrInput(e.target.value))}
                          />
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <span className={labelCls}>Acréscimo</span>
                      <Controller
                        name={`itens.${index}.acrescimo`}
                        control={control}
                        render={({ field: inputField }) => (
                          <input
                            type="text"
                            inputMode="numeric"
                            className={inputCls}
                            placeholder="0,00"
                            value={inputField.value}
                            onChange={(e) => inputField.onChange(formatValorBrInput(e.target.value))}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {itensRootError && (
        <p className="text-[10px] text-destructive px-5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {itensRootError}
        </p>
      )}

      <div className="flex gap-3 p-5 border-t border-white/5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={vincularMutation.isPending || lancamentos.length === 0}
          className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {vincularMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Confirmar vínculo
        </button>
      </div>
    </form>
  );
}

export function VincularModal({ open, onClose, extratoId, linhaId, valorExtratoAbs, onSuccess }: VincularModalProps) {
  const { data: lancamentos = [], isLoading } = useQuery<LancamentoCompativel[]>({
    queryKey: ["conciliacao-buscar-lancamentos", linhaId],
    queryFn: () =>
      fetchApiData<LancamentoCompativel[]>(`/conciliacoes/buscar-lancamentos?linha_id=${linhaId}&dias_janela=14`),
    enabled: open && linhaId > 0,
  });

  if (!open) return null;

  const formMountKey = `${linhaId}-${lancamentos.map((x) => x.id).join(",")}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Vincular lançamentos</h2>
              <p className="text-xs text-muted-foreground">
                Linha #{linhaId} · Valor extrato {formatCurrency(Number(valorExtratoAbs))}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs">Buscando lançamentos compatíveis…</span>
          </div>
        ) : lancamentos.length === 0 ? (
          <div className="py-12 px-5 text-center text-xs text-muted-foreground">
            Nenhum lançamento compatível encontrado na janela de datas. Ajuste os cadastros ou importe lançamentos.
            <div className="mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-white/10 text-sm text-white hover:bg-white/5">
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <VincularFormBody
            key={formMountKey}
            extratoId={extratoId}
            linhaId={linhaId}
            valorExtratoAbs={valorExtratoAbs}
            lancamentos={lancamentos}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}
