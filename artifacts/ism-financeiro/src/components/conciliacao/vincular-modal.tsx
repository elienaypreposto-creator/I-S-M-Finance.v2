import {useEffect, useMemo, useRef, useState} from "react";
import {useForm, useFieldArray, Controller, useWatch} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {formatCurrency, formatDate, cn} from "@/lib/utils";
import {Checkbox} from "@/components/ui/checkbox";
import {ScrollArea} from "@/components/ui/scroll-area";
import {
    buildVincularFormSchema,
    calcDeltaVincularCents,
    type VincularFormValues,
} from "@/validations/conciliacao-vincular.schema";
import {formatValorBrInput, brMoneyDisplayToApiString} from "@/validations/lancamentos.schema";
import {Loader2, X, Link2, AlertCircle, CheckCircle2, Pencil} from "lucide-react";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {EditarLancamentoConciliacaoModal} from "@/components/conciliacao/editar-lancamento-modal";

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
    lancamentos: Array<{ lancamento_id: number; desconto: string; juros_multa: string }>;
    gerar_parcial: boolean;
    residuo_lancamento_id?: number;
};

function centsToBrDisplay(cents: number): string {
    const abs = Math.abs(cents);
    const whole = Math.floor(abs / 100);
    const frac = abs % 100;
    return `${whole},${String(frac).padStart(2, "0")}`;
}

function toMoney(cents: number): number {
    return cents / 100;
}

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
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const {hasPermission} = useAuth();
    const canVincular = hasPermission(PERM.CONCILIACAO_VINCULAR);
    const canEditarLancamento = hasPermission(PERM.LANCAMENTOS_EDITAR);
    const [editarId, setEditarId] = useState<number | null>(null);
    /** Evita sobrescrever Juros/Multa se o usuário editou manualmente o valor. */
    const jurosManualRef = useRef<Set<number>>(new Set());

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
                juros_multa: "",
            })),
        [lancamentos],
    );

    const form = useForm<VincularFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            gerar_parcial: false,
            residuo_lancamento_id: null,
            itens: defaultItens,
        },
        mode: "onChange",
    });

    const {fields} = useFieldArray({control: form.control, name: "itens"});

    const {
        handleSubmit,
        control,
        setValue,
        formState: {errors},
    } = form;

    const watchedItens = useWatch({control, name: "itens"}) ?? [];
    const gerarParcial = useWatch({control, name: "gerar_parcial"}) ?? false;

    const selectedItens = useMemo(
        () => watchedItens.filter((i) => i.selecionado),
        [watchedItens],
    );

    const {deltaCents, somaBasesCents, somaJurosCents} = useMemo(
        () => calcDeltaVincularCents(valorExtratoAbs, selectedItens, lancamentosValorById),
        [valorExtratoAbs, selectedItens, lancamentosValorById],
    );

    const extratoCents =
        deltaCents != null ? somaBasesCents + deltaCents : Math.round(Math.abs(Number(valorExtratoAbs) || 0) * 100);

    const totalEfetivoCents = somaBasesCents + somaJurosCents;
    const coberturaCents = extratoCents - totalEfetivoCents;

    const showResidual = deltaCents != null && deltaCents < 0 && selectedItens.length > 0;
    const showExcedente = deltaCents != null && deltaCents > 0 && selectedItens.length > 0;
    const valoresBatendo =
        selectedItens.length > 0 &&
        deltaCents != null &&
        (deltaCents === 0 || (deltaCents > 0 && coberturaCents === 0));

    // Auto-preenche Juros/Multa quando há sobra e exatamente 1 lançamento selecionado
    useEffect(() => {
        if (deltaCents == null || selectedItens.length === 0) return;

        // Limpa juros auto de itens desmarcados
        watchedItens.forEach((item, idx) => {
            if (!item.selecionado && item.juros_multa) {
                const api = brMoneyDisplayToApiString(item.juros_multa) || "0.00";
                if (api !== "0.00" && !jurosManualRef.current.has(item.lancamento_id)) {
                    setValue(`itens.${idx}.juros_multa`, "", {shouldDirty: true, shouldValidate: true});
                }
                jurosManualRef.current.delete(item.lancamento_id);
            }
        });

        if (deltaCents > 0 && selectedItens.length === 1) {
            const only = selectedItens[0]!;
            if (jurosManualRef.current.has(only.lancamento_id)) return;

            const idx = watchedItens.findIndex((i) => i.lancamento_id === only.lancamento_id);
            if (idx < 0) return;

            const expected = centsToBrDisplay(deltaCents);
            const currentApi = brMoneyDisplayToApiString(watchedItens[idx]?.juros_multa ?? "") || "0.00";
            const expectedApi = brMoneyDisplayToApiString(expected) || "0.00";
            if (currentApi !== expectedApi) {
                setValue(`itens.${idx}.juros_multa`, expected, {
                    shouldDirty: true,
                    shouldValidate: true,
                });
            }
        }

        // Sem excedente: zera juros auto se não foram editados à mão
        if (deltaCents <= 0 && selectedItens.length === 1) {
            const only = selectedItens[0]!;
            if (jurosManualRef.current.has(only.lancamento_id)) return;
            const idx = watchedItens.findIndex((i) => i.lancamento_id === only.lancamento_id);
            if (idx < 0) return;
            const currentApi = brMoneyDisplayToApiString(watchedItens[idx]?.juros_multa ?? "") || "0.00";
            if (currentApi !== "0.00") {
                setValue(`itens.${idx}.juros_multa`, "", {shouldDirty: true, shouldValidate: true});
            }
        }
    }, [deltaCents, selectedItens, watchedItens, setValue]);

    // Desliga gerar_parcial quando não há mais falta
    useEffect(() => {
        if (!showResidual && gerarParcial) {
            setValue("gerar_parcial", false, {shouldValidate: true});
            setValue("residuo_lancamento_id", null, {shouldValidate: true});
        }
    }, [showResidual, gerarParcial, setValue]);

    const vincularMutation = useMutation({
        mutationFn: (payload: VincularPayload) =>
            fetchApiData(`/conciliacoes/linhas/${linhaId}/vincular`, {
                method: "POST",
                body: JSON.stringify(payload),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            void queryClient.invalidateQueries({queryKey: ["conciliacoes"]});
            toast({
                title: "Vínculo registrado",
                description: "A linha foi conciliada com os lançamentos selecionados.",
            });
            onClose();
            onSuccess();
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível vincular.";
            toast({variant: "destructive", title: "Erro ao vincular", description: msg});
        },
    });

    const onSubmit = (values: VincularFormValues) => {
        const lancamentosPayload = values.itens
            .filter((i) => i.selecionado)
            .map((i) => ({
                lancamento_id: i.lancamento_id,
                desconto: brMoneyDisplayToApiString(i.desconto) || "0.00",
                juros_multa: brMoneyDisplayToApiString(i.juros_multa) || "0.00",
            }));
        const payload: VincularPayload = {
            lancamentos: lancamentosPayload,
            gerar_parcial: Boolean(values.gerar_parcial && showResidual),
        };
        if (payload.gerar_parcial && values.residuo_lancamento_id) {
            payload.residuo_lancamento_id = values.residuo_lancamento_id;
        }
        vincularMutation.mutate(payload);
    };

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary/50";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-wider";

    const itensRootError =
        typeof errors.itens === "object" && errors.itens !== null && "message" in errors.itens
            ? String((errors.itens as { message?: string }).message)
            : undefined;

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="flex-1 min-h-[200px] max-h-[45vh] px-5">
                <div className="space-y-2 py-4">
                    {fields.map((field, index) => {
                        const l = lancamentos.find((x) => x.id === field.lancamento_id);
                        if (!l) return null;
                        const selected = watchedItens[index]?.selecionado ?? false;
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
                                        render={({field: cb}) => (
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
                                    l.tipo === "CR"
                                        ? "bg-emerald-500/20 text-emerald-300"
                                        : "bg-red-500/20 text-red-300",
                                )}>
                              {l.tipo}
                            </span>
                                                        <span className="text-[10px] text-muted-foreground">
                              {formatDate(l.vencimento)}
                            </span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">
                              {l.status}
                            </span>
                                                    </div>
                                                    <p
                                                        className="text-sm text-white font-medium mt-1 truncate"
                                                        title={l.descricao ?? ""}>
                                                        {l.descricao ?? "—"}
                                                    </p>
                                                    <p className="text-sm font-bold text-primary mt-0.5">
                                                        {formatCurrency(Number(l.valor))}
                                                    </p>
                                                    {canEditarLancamento && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditarId(l.id)}
                                                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                                                        >
                                                            <Pencil className="w-3 h-3"/>
                                                            Corrigir lançamento
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    />
                                    <div
                                        className={cn(
                                            "flex gap-3 sm:w-52 shrink-0 transition-opacity",
                                            selected ? "opacity-100" : "opacity-40 pointer-events-none",
                                        )}>
                                        <div className="flex-1">
                                            <span className={labelCls}>Desconto</span>
                                            <Controller
                                                name={`itens.${index}.desconto`}
                                                control={control}
                                                render={({field: inputField}) => (
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        className={inputCls}
                                                        placeholder="0,00"
                                                        value={inputField.value}
                                                        onChange={(e) =>
                                                            inputField.onChange(formatValorBrInput(e.target.value))
                                                        }
                                                    />
                                                )}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <span className={labelCls}>Juros/Multa</span>
                                            <Controller
                                                name={`itens.${index}.juros_multa`}
                                                control={control}
                                                render={({field: inputField}) => (
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        className={cn(
                                                            inputCls,
                                                            showExcedente &&
                                                            selected &&
                                                            selectedItens.length === 1 &&
                                                            "border-amber-500/40 bg-amber-500/5",
                                                        )}
                                                        placeholder="0,00"
                                                        value={inputField.value}
                                                        onChange={(e) => {
                                                            jurosManualRef.current.add(l.id);
                                                            inputField.onChange(formatValorBrInput(e.target.value));
                                                        }}
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
                <p className="text-[10px] text-destructive px-5 pb-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3"/>
                    {itensRootError}
                </p>
            )}

            {/* Barra de resumo em tempo real */}
            <div className="shrink-0 border-t border-white/10 bg-black/40 px-5 py-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-white/5 px-2 py-2">
                        <p className={labelCls}>Extrato</p>
                        <p className="text-sm font-bold text-white tabular-nums">
                            {formatCurrency(toMoney(extratoCents))}
                        </p>
                    </div>
                    <div className="rounded-lg bg-white/5 px-2 py-2">
                        <p className={labelCls}>Selecionados</p>
                        <p className="text-sm font-bold text-white tabular-nums">{selectedItens.length}</p>
                    </div>
                    <div className="rounded-lg bg-white/5 px-2 py-2">
                        <p className={labelCls}>Total lanç.</p>
                        <p className="text-sm font-bold text-white tabular-nums">
                            {formatCurrency(toMoney(somaBasesCents))}
                        </p>
                    </div>
                    <div className="rounded-lg bg-white/5 px-2 py-2">
                        <p className={labelCls}>Juros/Multa</p>
                        <p className="text-sm font-bold text-amber-200/90 tabular-nums">
                            {formatCurrency(toMoney(somaJurosCents))}
                        </p>
                    </div>
                </div>

                {selectedItens.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center">
                        Selecione ao menos um lançamento para ver o cálculo.
                    </p>
                ) : valoresBatendo ? (
                    <div
                        className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0"/>
                        <p className="text-sm font-semibold text-emerald-200">
                            {deltaCents === 0
                                ? "✓ Valores iguais"
                                : "✓ Excedente alocado em Juros/Multa — valores batem"}
                        </p>
                    </div>
                ) : showResidual ? (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 space-y-2">
                        <p className="text-sm font-semibold text-red-200 text-center">
                            Falta {formatCurrency(toMoney(Math.abs(deltaCents ?? 0)))} para atingir o valor do
                            extrato
                        </p>
                        <Controller
                            name="gerar_parcial"
                            control={control}
                            render={({field}) => (
                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={(c) => field.onChange(c === true)}
                                        className="mt-0.5"
                                    />
                                    <div>
                    <span className="text-sm font-medium text-white group-hover:text-primary/90 transition-colors">
                      Gerar movimentação residual
                    </span>
                                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                            Cria lançamento pendente
                                            de {formatCurrency(toMoney(Math.abs(deltaCents ?? 0)))}{" "}
                                            (pagamento parcial), com vencimento da origem.
                                        </p>
                                    </div>
                                </label>
                            )}
                        />
                        {gerarParcial && selectedItens.length >= 2 && (
                            <div>
                                <span className={labelCls}>Origem do residual</span>
                                <Controller
                                    name="residuo_lancamento_id"
                                    control={control}
                                    render={({field}) => (
                                        <select
                                            className={cn(inputCls, "mt-1")}
                                            value={field.value ?? ""}
                                            onChange={(e) =>
                                                field.onChange(e.target.value ? Number(e.target.value) : null)
                                            }>
                                            <option value="">Selecione o lançamento de origem…</option>
                                            {selectedItens.map((i) => {
                                                const l = lancamentos.find((x) => x.id === i.lancamento_id);
                                                return (
                                                    <option key={i.lancamento_id} value={i.lancamento_id}>
                                                        #{i.lancamento_id} · {l?.descricao ?? "—"} ·{" "}
                                                        {formatCurrency(Number(l?.valor ?? 0))}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    )}
                                />
                                {errors.residuo_lancamento_id?.message && (
                                    <p className="text-[10px] text-destructive mt-1">
                                        {errors.residuo_lancamento_id.message}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ) : showExcedente ? (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                        <p className="text-sm font-semibold text-amber-200 text-center">
                            Sobra / Excedente de {formatCurrency(toMoney(deltaCents ?? 0))}
                            {selectedItens.length === 1
                                ? " — preenchido em Juros/Multa"
                                : " — aloque em Juros/Multa"}
                        </p>
                    </div>
                ) : null}
            </div>

            <div className="flex gap-3 p-5 border-t border-white/5 shrink-0">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5">
                    Cancelar
                </button>
                {canVincular && (
                    <button
                        type="submit"
                        disabled={
                            vincularMutation.isPending ||
                            lancamentos.length === 0 ||
                            selectedItens.length === 0
                        }
                        className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                        {vincularMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin"/>
                        ) : (
                            <Link2 className="w-4 h-4"/>
                        )}
                        Confirmar vínculo
                    </button>
                )}
            </div>

            <EditarLancamentoConciliacaoModal
                open={editarId != null}
                lancamentoId={editarId}
                onClose={() => setEditarId(null)}
                onSaved={() => {
                    void queryClient.invalidateQueries({
                        queryKey: ["conciliacao-buscar-lancamentos", linhaId],
                    });
                }}
            />
        </form>
    );
}

export function VincularModal({
                                  open,
                                  onClose,
                                  extratoId,
                                  linhaId,
                                  valorExtratoAbs,
                                  onSuccess,
                              }: VincularModalProps) {
    const {data: lancamentos = [], isLoading} = useQuery<LancamentoCompativel[]>({
        queryKey: ["conciliacao-buscar-lancamentos", linhaId],
        queryFn: () =>
            fetchApiData<LancamentoCompativel[]>(
                `/conciliacoes/buscar-lancamentos?linha_id=${linhaId}&dias_janela=14`,
            ),
        enabled: open && linhaId > 0,
    });

    if (!open) return null;

    const formMountKey = `${linhaId}-${lancamentos.map((x) => x.id).join(",")}`;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div
                className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                            <Link2 className="w-5 h-5 text-primary"/>
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
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                {isLoading ? (
                    <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin text-primary"/>
                        <span className="text-xs">Buscando lançamentos compatíveis…</span>
                    </div>
                ) : lancamentos.length === 0 ? (
                    <div className="py-12 px-5 text-center text-xs text-muted-foreground">
                        Nenhum lançamento compatível encontrado na janela de datas. Ajuste os cadastros ou
                        importe lançamentos.
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