import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useForm, useFieldArray, Controller, useWatch} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {formatCurrency, formatDate, cn} from "@/lib/utils";
import {Checkbox} from "@/components/ui/checkbox";
import {
    buildVincularFormSchema,
    calcDeltaVincularCents,
    type VincularFormValues,
} from "@/validations/conciliacao-vincular.schema";
import {formatValorBrInput, brMoneyDisplayToApiString} from "@/validations/lancamentos.schema";
import {Loader2, X, Link2, AlertCircle, CheckCircle2, Pencil, Search} from "lucide-react";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {EditarLancamentoConciliacaoModal} from "@/components/conciliacao/editar-lancamento-modal";
import {StatusBadge} from "@/components/shared/status-badge";
import {invalidateRelated} from "@/App";
// RN-D3: "Novo" - cria um lançamento a partir da linha de origem e já
// vincula automaticamente. Função movida do botão [+] da tela de
// conciliação para dentro deste modal.
import {LancamentoModal, type LancamentoPrefill} from "@/components/lancamentos/lancamento-modal";

export type LancamentoCompativel = {
    id: number;
    tipo: string;
    vencimento: string;
    descricao: string | null;
    valor: string | number;
    /** Quitado antes deste vínculo - necessário para a fórmula de Modo B (1
     *  lançamento) quando ele já tem quitação parcial/total anterior. Sem
     *  isso o front calcula um "excedente" errado para lançamentos que já
     *  têm status "pago"/"pago_parcial" (ver bug do card DEF-10). */
    valor_quitado?: string | number | null;
    status: string;
    parceiro_id: number | null;
    /** Nome do parceiro - usado na busca livre (RN-D4) e exibido no card. */
    parceiro_nome?: string | null;
    plano_conta_id: number | null;
};

type VincularModalProps = {
    open: boolean;
    onClose: () => void;
    extratoId: string;
    linhaId: number;
    valorExtratoAbs: string | number;
    /** Regra de Ouro (Fase 8): chamado quando o usuário confirma o vínculo -
     *  em vez de persistir na hora, o modal só CALCULA (preview, mesma regra
     *  de negócio do backend) e devolve o resultado pro extrato.tsx guardar
     *  como rascunho em memória até o Salvar/Conciliar. */
    onDraftVincular: (draft: DraftVincular) => void;
    /** Soma (em centavos) de OUTRAS rodadas de vincular já rascunhadas nesta
     *  MESMA linha, nesta sessão (ainda não salvas) - necessário pro preview
     *  calcular o saldo incremental corretamente numa 2ª rodada. */
    jaVinculadoLocalCents?: number;
    /** lancamento_id -> centavos já "reservados" por rascunhos de OUTRAS
     *  linhas do mesmo extrato nesta sessão (ainda não salvos) - soma-se ao
     *  valor_quitado real pra "Restante"/Modo B não ficarem desatualizados
     *  enquanto o usuário ainda não clicou em Salvar. */
    quitadoLocalPorLancamento?: Record<number, number>;
    /** true quando um "Desfazer" desta MESMA linha já está rascunhado
     *  localmente (ainda não salvo) - os vínculos reais no banco serão
     *  descartados no Salvar, então o preview também deve ignorá-los agora. */
    ignorarVinculosReais?: boolean;
    /** Dados da linha de origem, usados para pré-preencher o formulário do
     *  botão "Novo" (criar lançamento a partir desta linha - RN-D3, função
     *  que antes vivia no botão [+] da tela de conciliação). */
    tipoMovimento: string;
    dataMovimento: string | null;
    descricaoLinha: string | null;
};

export type VincularPayload = {
    lancamentos: Array<{ lancamento_id: number; desconto: string; juros_multa: string }>;
    gerar_parcial: boolean;
    residuo_lancamento_id?: number;
};

export type DraftVincularItem = {
    lancamento_id: number;
    valor_vinculado: number;
    desconto: number;
    juros_multa: number;
    descricao: string | null;
    tipo: string;
    status: string;
    vencimento: string | null;
};

/** Resultado do preview (Regra de Ouro) - guardado em memória no extrato.tsx
 *  até o Salvar/Conciliar de fato persistir via POST .../salvar. */
export type DraftVincular = {
    tipo: "vincular";
    linhaId: number;
    payload: VincularPayload;
    ramo: string;
    delta: number;
    totalConciliado: number;
    valorSaldo: number;
    itens: DraftVincularItem[];
    residual: { lancamentoOrigemId: number; valor: number } | null;
};

const DIAS_JANELA_INICIAL = 14;
const DIAS_JANELA_INCREMENTO = 14;
const DIAS_JANELA_MAXIMA = 90;

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
                              onDraftVincular,
                              jaVinculadoLocalCents,
                              quitadoLocalPorLancamento,
                              ignorarVinculosReais,
                              onBuscarMais,
                              buscandoMais,
                              podeBuscarMais,
                          }: {
    extratoId: string;
    linhaId: number;
    valorExtratoAbs: string | number;
    lancamentos: LancamentoCompativel[];
    onClose: () => void;
    onDraftVincular: (draft: DraftVincular) => void;
    jaVinculadoLocalCents: number;
    quitadoLocalPorLancamento: Record<number, number>;
    ignorarVinculosReais: boolean;
    onBuscarMais: () => void;
    buscandoMais: boolean;
    podeBuscarMais: boolean;
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

    // Bug (ver print anexo): um lançamento já "Pago"/"pago_parcial" tem
    // valor_quitado > 0. Sem considerar isso, o front calcula "quanto falta"
    // usando o valor de face do lançamento (ex.: R$ 9,00) quando na verdade
    // o saldo devedor real já é outro - o backend usa a fórmula de Modo B
    // (quitado_anterior + extrato − base) sempre que 1 único lançamento é
    // selecionado, e o front precisa espelhar isso ou os dois divergem.
    // Regra de Ouro: soma também o que já foi RASCUNHADO (não salvo ainda)
    // nesta mesma sessão para o mesmo lançamento em OUTRAS linhas do
    // extrato - sem isso, "Restante"/Modo B ficam desatualizados até salvar.
    const lancamentosQuitadoById = useMemo(() => {
        const m = new Map<number, string | number>();
        for (const l of lancamentos) {
            const baseReais = Number(l.valor_quitado ?? 0);
            const extraCents = quitadoLocalPorLancamento[l.id] ?? 0;
            m.set(l.id, baseReais + extraCents / 100);
        }
        return m;
    }, [lancamentos, quitadoLocalPorLancamento]);

    const schema = useMemo(
        () => buildVincularFormSchema(valorExtratoAbs, lancamentosValorById, lancamentosQuitadoById),
        [valorExtratoAbs, lancamentosValorById, lancamentosQuitadoById],
    );

    const defaultItens = useMemo(
        () =>
            lancamentos.map((l) => ({
                lancamento_id: l.id,
                selecionado: false,
                desconto: "",
                juros_multa: "",
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
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

    const {fields, append} = useFieldArray({control: form.control, name: "itens"});

    const {
        handleSubmit,
        control,
        setValue,
        formState: {errors},
    } = form;

    // RN-D4: quando "buscar mais lançamentos" traz itens novos, adiciona sem
    // resetar o formulário (preserva seleções e valores já digitados).
    useEffect(() => {
        const idsNoForm = new Set(fields.map((f) => f.lancamento_id));
        const novos = lancamentos.filter((l) => !idsNoForm.has(l.id));
        if (novos.length > 0) {
            append(
                novos.map((l) => ({
                    lancamento_id: l.id,
                    selecionado: false,
                    desconto: "",
                    juros_multa: "",
                })),
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lancamentos]);

    const watchedItens = useWatch({control, name: "itens"}) ?? [];
    const gerarParcial = useWatch({control, name: "gerar_parcial"}) ?? false;
    // Usado para liberar "Concluir" quando a origem do residual já foi
    // escolhida (necessário só quando há 2+ lançamentos selecionados).
    const residuoIdSelecionado = useWatch({control, name: "residuo_lancamento_id"});

    const selectedItens = useMemo(
        () => watchedItens.filter((i) => i.selecionado),
        [watchedItens],
    );

    // RN-E1: mesma fórmula usada na validação (buildVincularFormSchema) -
    // Modo A (2+) ou Modo B (1, considerando valor_quitado anterior).
    const {deltaCents, somaBasesCents, somaJurosCents} = useMemo(
        () => calcDeltaVincularCents(valorExtratoAbs, selectedItens, lancamentosValorById, lancamentosQuitadoById),
        [valorExtratoAbs, selectedItens, lancamentosValorById, lancamentosQuitadoById],
    );

    const extratoCents = Math.round(Math.abs(Number(valorExtratoAbs) || 0) * 100);

    // RN-E1/E2/E6: restante = Δ − Juros/Multa (Δ = extrato − bases).
    // >0 gap no extrato (cobertura parcial OU alocar juros)
    // <0 títulos > extrato (residual Modo A / pagamento parcial Modo B)
    // =0 bate
    const restanteCents = deltaCents != null ? deltaCents - somaJurosCents : null;

    const quitadoAnteriorCentsSelecionado =
        selectedItens.length === 1
            ? Math.round(Math.abs(Number(lancamentosQuitadoById.get(selectedItens[0]!.lancamento_id) ?? 0)) * 100)
            : 0;
    const emQuitacaoMultiLinha = selectedItens.length === 1 && quitadoAnteriorCentsSelecionado > 0;

    const showGapExtrato =
        restanteCents != null && restanteCents > 0 && selectedItens.length > 0;
    /** Só informativo (sem checkbox) quando já é uma quitação multi-linha em andamento. */
    const showModoBParcial =
        restanteCents != null && restanteCents < 0 && selectedItens.length === 1 && emQuitacaoMultiLinha;
    /** Oferece o checkbox de residual com 2+ lançamentos OU com 1 lançamento "fresco" (1º vínculo). */
    const showResidual =
        restanteCents != null &&
        restanteCents < 0 &&
        (selectedItens.length >= 2 || (selectedItens.length === 1 && !emQuitacaoMultiLinha));
    const showExcedente = showGapExtrato;
    const valoresBatendo = selectedItens.length > 0 && restanteCents === 0;

    const podeDeixarParcialSemResidual = showResidual && selectedItens.length === 1;

    const podeConcluir =
        selectedItens.length > 0 &&
        (valoresBatendo ||
            showModoBParcial ||
            podeDeixarParcialSemResidual ||
            (showGapExtrato && somaJurosCents === 0) ||
            (showResidual &&
                gerarParcial &&
                (selectedItens.length < 2 || Boolean(residuoIdSelecionado))));

    // Auto-preenche Juros/Multa somente quando o usuário marca alocarSobraJuros
    // e há exatamente 1 lançamento (RN-G2 / 1:1 com taxas). Sem a flag, deixa
    // cobertura parcial (Modo A incremental).
    const [alocarSobraJuros, setAlocarSobraJuros] = useState(false);

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

        if (deltaCents > 0 && selectedItens.length === 1 && alocarSobraJuros) {
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
            return;
        }

        // Sem alocar sobra: zera juros auto se não foram editados à mão
        if (selectedItens.length === 1) {
            const only = selectedItens[0]!;
            if (jurosManualRef.current.has(only.lancamento_id)) return;
            const idx = watchedItens.findIndex((i) => i.lancamento_id === only.lancamento_id);
            if (idx < 0) return;
            const currentApi = brMoneyDisplayToApiString(watchedItens[idx]?.juros_multa ?? "") || "0.00";
            if ((!alocarSobraJuros || deltaCents <= 0) && currentApi !== "0.00") {
                setValue(`itens.${idx}.juros_multa`, "", {shouldDirty: true, shouldValidate: true});
            }
        }
    }, [deltaCents, selectedItens, watchedItens, setValue, alocarSobraJuros]);

    // Desliga gerar_parcial quando não há mais falta
    useEffect(() => {
        if (!showResidual && gerarParcial) {
            setValue("gerar_parcial", false, {shouldValidate: true});
            setValue("residuo_lancamento_id", null, {shouldValidate: true});
        }
    }, [showResidual, gerarParcial, setValue]);

    useEffect(() => {
        if (showResidual && gerarParcial && selectedItens.length === 1) {
            const unico = selectedItens[0]!.lancamento_id;
            if (residuoIdSelecionado !== unico) {
                setValue("residuo_lancamento_id", unico, {shouldValidate: true});
            }
        }
    }, [showResidual, gerarParcial, selectedItens, residuoIdSelecionado, setValue]);

    // Regra de Ouro (Fase 8): NÃO persiste nada aqui - só pede ao backend
    // pra CALCULAR o resultado (mesma regra de negócio, sem duplicar lógica
    // de dinheiro no front) e devolve pro extrato.tsx guardar como rascunho
    // em memória até o usuário clicar em Salvar/Conciliar.
    const previewVincularMutation = useMutation({
        mutationFn: (payload: VincularPayload) =>
            fetchApiData<{
                ramo: string;
                delta: number;
                total_conciliado: number;
                valor_saldo: number;
                itens: Array<{ lancamento_id: number; valor_vinculado: number; desconto: number; juros_multa: number }>;
                residual: { lancamento_origem_id: number; valor: number } | null;
            }>(`/conciliacoes/linhas/${linhaId}/vincular`, {
                method: "POST",
                body: JSON.stringify({
                    ...payload,
                    preview: true,
                    contexto_rascunho: {
                        ja_vinculado_local_cents: jaVinculadoLocalCents,
                        quitado_local_por_lancamento: Object.fromEntries(
                            Object.entries(quitadoLocalPorLancamento).map(([k, v]) => [k, v]),
                        ),
                        ignorar_vinculos_reais: ignorarVinculosReais,
                    },
                }),
            }),
        onSuccess: (resultado, payload) => {
            const lancamentoById = new Map(lancamentos.map((l) => [l.id, l]));
            const itens: DraftVincularItem[] = resultado.itens.map((i) => {
                const l = lancamentoById.get(i.lancamento_id);
                return {
                    lancamento_id: i.lancamento_id,
                    valor_vinculado: Number(i.valor_vinculado),
                    desconto: Number(i.desconto),
                    juros_multa: Number(i.juros_multa),
                    descricao: l?.descricao ?? null,
                    tipo: l?.tipo ?? "",
                    status: l?.status ?? "",
                    vencimento: l?.vencimento ?? null,
                };
            });
            onDraftVincular({
                tipo: "vincular",
                linhaId,
                payload,
                ramo: resultado.ramo,
                delta: Number(resultado.delta),
                totalConciliado: Number(resultado.total_conciliado),
                valorSaldo: Number(resultado.valor_saldo),
                itens,
                residual: resultado.residual
                    ? {lancamentoOrigemId: resultado.residual.lancamento_origem_id, valor: Number(resultado.residual.valor)}
                    : null,
            });
            toast({
                title: "Vínculo adicionado",
                description: "Ainda não foi salvo - clique em Salvar/Conciliar no extrato para confirmar.",
            });
            onClose();
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
        previewVincularMutation.mutate(payload);
    };

    const onInvalid = (formErrors: typeof errors) => {
        console.error("Erros de Validação Zod:", formErrors);
        const first =
            (typeof formErrors.itens === "object" &&
                formErrors.itens &&
                "message" in formErrors.itens &&
                String(formErrors.itens.message)) ||
            formErrors.residuo_lancamento_id?.message ||
            formErrors.gerar_parcial?.message ||
            "Revise os campos do vínculo — a validação impediu o envio.";
        toast({
            variant: "destructive",
            title: "Não foi possível confirmar",
            description: first,
        });
    };

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary/50";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-wider";

    const itensRootError =
        typeof errors.itens === "object" && errors.itens !== null && "message" in errors.itens
            ? String((errors.itens as { message?: string }).message)
            : undefined;

    return (
        <form
            onSubmit={handleSubmit(onSubmit, (errs) => onInvalid(errs))}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
            {/* Lista: único filho que cresce e rola — precisa de min-h-0 no flex. */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5">
                <div className="space-y-2 py-4">
                    {fields.map((field, index) => {
                        const l = lancamentos.find((x) => x.id === field.lancamento_id);
                        if (!l) return null;
                        const selected = watchedItens[index]?.selecionado ?? false;
                        // Inclui rascunho local (Regra de Ouro) - ver lancamentosQuitadoById.
                        const quitadoAnteriorCents = Math.round(
                            Math.abs(Number(lancamentosQuitadoById.get(l.id) ?? 0)) * 100,
                        );
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
                                                        <StatusBadge status={l.status} className="text-[10px] py-0"/>
                                                    </div>
                                                    <p
                                                        className="text-sm text-white font-medium mt-1 truncate"
                                                        title={l.descricao ?? ""}>
                                                        {l.descricao ?? "—"}
                                                    </p>
                                                    {l.parceiro_nome && (
                                                        <p className="text-[11px] text-muted-foreground truncate">
                                                            {l.parceiro_nome}
                                                        </p>
                                                    )}
                                                    {/* Card 77: valor original + "Restante" (valor − valor_quitado) lado
                                                        a lado - dá visibilidade de quanto do título já está
                                                        comprometido com outras conciliações antes de selecionar. */}
                                                    <p className="text-sm font-bold text-primary mt-0.5">
                                                        {formatCurrency(Number(l.valor))}
                                                        {quitadoAnteriorCents > 0 && (
                                                            <span className="text-[11px] font-semibold text-amber-300/90">
                                                                {" "}| Restante: {formatCurrency(
                                                                    toMoney(Math.max(0, Math.round(Math.abs(Number(l.valor)) * 100) - quitadoAnteriorCents)),
                                                                )}
                                                            </span>
                                                        )}
                                                    </p>
                                                    {/* DEF-08/RN-E1: lançamento já com quitação anterior (ex.: status
                                                        "Pago" buscado só para receber uma linha extra de juros) - mostra
                                                        isso explicitamente, senão o usuário não entende por que o
                                                        "Juros/Multa" pedido é maior que o valor de face do lançamento. */}
                                                    {quitadoAnteriorCents > 0 && (
                                                        <p className="text-[10px] text-amber-300/90 mt-0.5">
                                                            Já quitado: {formatCurrency(toMoney(quitadoAnteriorCents))}
                                                        </p>
                                                    )}
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
            </div>

            {itensRootError && (
                <p className="shrink-0 text-[10px] text-destructive px-5 py-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3"/>
                    {itensRootError}
                </p>
            )}

            {/* Barra de resumo em tempo real - recalcula a cada seleção/edição,
                sem precisar de submit (RN-E1). Todo o cálculo roda em centavos
                inteiros (extratoCents / somaBasesCents / restanteCents), e usa
                a MESMA fórmula do backend (Modo A ou Modo B conforme o número
                de lançamentos selecionados - ver calcDeltaVincularCents). */}
            <div className="shrink-0 border-t border-white/10 bg-black/40 px-5 py-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="rounded-lg bg-white/5 px-2 py-2">
                        <p className={labelCls}>Referência</p>
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
                    {/* RN-E1/E2/E6: valor restante, sempre visível e atualizado a
                        cada clique - positivo = falta, negativo = excedente,
                        zero = bate certinho. */}
                    <div
                        className={cn(
                            "rounded-lg px-2 py-2",
                            selectedItens.length === 0 || restanteCents === null
                                ? "bg-white/5"
                                : restanteCents === 0
                                    ? "bg-emerald-500/15"
                                    : restanteCents > 0
                                        ? "bg-red-500/10"
                                        : "bg-amber-500/10",
                        )}>
                        <p className={labelCls}>Restante</p>
                        <p
                            className={cn(
                                "text-sm font-bold tabular-nums",
                                selectedItens.length === 0 || restanteCents === null
                                    ? "text-white"
                                    : restanteCents === 0
                                        ? "text-emerald-300"
                                        : restanteCents > 0
                                            ? "text-red-300"
                                            : "text-amber-300",
                            )}>
                            {selectedItens.length === 0 || restanteCents === null
                                ? "—"
                                : formatCurrency(toMoney(Math.abs(restanteCents)))}
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
                            ✓ Restante zerado — valores batem
                        </p>
                    </div>
                ) : showModoBParcial ? (
                    <div className="rounded-lg bg-sky-500/10 border border-sky-500/30 px-3 py-2 space-y-1">
                        <p className="text-sm font-semibold text-sky-200 text-center">
                            Pagamento parcial do título — ainda faltam{" "}
                            {formatCurrency(toMoney(Math.abs(restanteCents ?? 0)))}
                        </p>
                        <p className="text-[11px] text-muted-foreground text-center leading-snug">
                            Confirme este vínculo e continue nas outras linhas do extrato (Modo B).
                        </p>
                    </div>
                ) : showResidual ? (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 space-y-2">
                        <p className="text-sm font-semibold text-red-200 text-center">
                            Falta {formatCurrency(toMoney(Math.abs(restanteCents ?? 0)))} para
                            fechar com o extrato
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
                                            Cria lançamento pendente de{" "}
                                            {formatCurrency(toMoney(Math.abs(restanteCents ?? 0)))}{" "}
                                            (pagamento parcial), com vencimento da origem — não
                                            editável.
                                        </p>
                                    </div>
                                </label>
                            )}
                        />
                        {errors.itens?.message && (
                            <p className="text-[10px] text-destructive text-center flex items-center justify-center gap-1">
                                <AlertCircle className="w-3 h-3"/>
                                {String(errors.itens.message)}
                            </p>
                        )}
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
                                                field.onChange(
                                                    e.target.value ? Number(e.target.value) : null,
                                                )
                                            }>
                                            <option value="">
                                                Selecione o lançamento de origem…
                                            </option>
                                            {selectedItens.map((i) => {
                                                const l = lancamentos.find(
                                                    (x) => x.id === i.lancamento_id,
                                                );
                                                return (
                                                    <option
                                                        key={i.lancamento_id}
                                                        value={i.lancamento_id}>
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
                                {gerarParcial && !residuoIdSelecionado && (
                                    <p className="text-[10px] text-amber-300 mt-1">
                                        Escolha a origem do residual para liberar o botão.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ) : showExcedente ? (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 space-y-2">
                        <p className="text-sm font-semibold text-amber-200 text-center">
                            {somaJurosCents > 0 && restanteCents === 0
                                ? "Excedente alocado em Juros/Multa — valores batem"
                                : `Falta ${formatCurrency(toMoney(restanteCents ?? 0))} para cobrir o extrato — você pode vincular agora e completar depois`}
                        </p>
                        {selectedItens.length === 1 && restanteCents !== 0 && (
                            <label className="flex items-start gap-3 cursor-pointer group">
                                <Checkbox
                                    checked={alocarSobraJuros}
                                    onCheckedChange={(c) => setAlocarSobraJuros(c === true)}
                                    className="mt-0.5"
                                />
                                <div>
                                    <span className="text-sm font-medium text-white group-hover:text-primary/90 transition-colors">
                                        Alocar sobra em Juros/Multa
                                    </span>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                        Fecha a linha agora tratando a diferença como juros (1:1 com
                                        taxas). Desmarcado = cobertura parcial (Modo A incremental).
                                    </p>
                                </div>
                            </label>
                        )}
                        {selectedItens.length > 1 && restanteCents !== 0 && (
                            <p className="text-[11px] text-muted-foreground text-center">
                                Pode confirmar agora (cobertura parcial) ou ajustar Juros/Multa até
                                o restante zerar.
                            </p>
                        )}
                    </div>
                ) : null}

                {/* RN-D4: busca mais lançamentos enquanto o valor não bate; some assim que bater */}
                {!valoresBatendo && podeBuscarMais && (
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={onBuscarMais}
                            disabled={buscandoMais}
                            className="text-[11px] font-semibold text-primary hover:text-primary/80 underline underline-offset-2 disabled:opacity-40 disabled:no-underline flex items-center gap-1.5">
                            {buscandoMais ? (
                                <Loader2 className="w-3 h-3 animate-spin"/>
                            ) : (
                                <Search className="w-3 h-3"/>
                            )}
                            Buscar mais lançamentos compatíveis
                        </button>
                    </div>
                )}
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
                            previewVincularMutation.isPending ||
                            lancamentos.length === 0 ||
                            selectedItens.length === 0 ||
                            !podeConcluir
                        }
                        title={!podeConcluir && selectedItens.length > 0 ? "O restante precisa zerar (ou gerar a movimentação residual) para concluir" : undefined}
                        className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                        {previewVincularMutation.isPending ? (
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
                                  onDraftVincular,
                                  jaVinculadoLocalCents = 0,
                                  quitadoLocalPorLancamento = {},
                                  ignorarVinculosReais = false,
                                  tipoMovimento,
                                  dataMovimento,
                                  descricaoLinha,
                              }: VincularModalProps) {
    const queryClient = useQueryClient();
    const {toast} = useToast();

    const [diasJanela, setDiasJanela] = useState(DIAS_JANELA_INICIAL);
    // RN-D4: campos de busca manual - descrição/parceiro (texto livre), valor
    // e vencimento, além da janela de datas. "buscaAtiva"/"valorAtivo"/
    // "vencimentoAtivo" só mudam ao clicar em Buscar, para não disparar uma
    // requisição a cada tecla digitada.
    const [buscaTexto, setBuscaTexto] = useState("");
    const [buscaAtiva, setBuscaAtiva] = useState("");
    const [valorTexto, setValorTexto] = useState("");
    const [valorAtivo, setValorAtivo] = useState("");
    const [vencimentoTexto, setVencimentoTexto] = useState("");
    const [vencimentoAtivo, setVencimentoAtivo] = useState("");

    // RN-D3: "Novo" - abre o mesmo formulário completo de "Novo Lançamento"
    // usado na tela de Lançamentos, pré-preenchido com tipo/vencimento/valor/
    // descrição vindos da linha do extrato. Ao salvar, o lançamento é criado
    // e automaticamente vinculado a esta linha (vincularAutoMutation) - sem
    // passo extra manual. Essa função morava no botão [+] da tela de
    // conciliação e foi movida para dentro deste modal.
    const [novoLancamentoOpen, setNovoLancamentoOpen] = useState(false);

    // Reseta a janela/busca sempre que uma linha diferente é aberta.
    useEffect(() => {
        setDiasJanela(DIAS_JANELA_INICIAL);
        setBuscaTexto("");
        setBuscaAtiva("");
        setValorTexto("");
        setValorAtivo("");
        setVencimentoTexto("");
        setVencimentoAtivo("");
        setNovoLancamentoOpen(false);
    }, [linhaId]);

    const {data: lancamentos = [], isLoading, isFetching} = useQuery<LancamentoCompativel[]>({
        queryKey: ["conciliacao-buscar-lancamentos", linhaId, diasJanela, buscaAtiva, valorAtivo, vencimentoAtivo],
        queryFn: () => {
            const params = new URLSearchParams({
                linha_id: String(linhaId),
                dias_janela: String(diasJanela),
            });
            if (buscaAtiva) params.set("busca", buscaAtiva);
            if (valorAtivo) params.set("valor", valorAtivo);
            if (vencimentoAtivo) params.set("vencimento", vencimentoAtivo);
            return fetchApiData<LancamentoCompativel[]>(`/conciliacoes/buscar-lancamentos?${params.toString()}`);
        },
        enabled: open && linhaId > 0,
    });

    // RN-D3: reaproveita o mesmo endpoint do fluxo de vincular manual (POST
    // /conciliacoes/linhas/:id/vincular), sem desconto/juros e sem residuo -
    // igual ao comportamento antigo do botão [+]. Regra de Ouro: o próprio
    // lançamento nasce de fato (ele não tem "estado financeiro" até ser
    // vinculado a algo), mas o VÍNCULO em si só é um preview - vira rascunho
    // em memória (onDraftVincular) igual ao fluxo manual, só é persistido no
    // Salvar/Conciliar do extrato.
    const vincularAutoMutation = useMutation({
        mutationFn: async ({lancamentoId, descricao}: { lancamentoId: number; descricao: string | null }) => {
            const payload: VincularPayload = {
                lancamentos: [{lancamento_id: lancamentoId, desconto: "0.00", juros_multa: "0.00"}],
                gerar_parcial: false,
            };
            const resultado = await fetchApiData<{
                ramo: string;
                delta: number;
                total_conciliado: number;
                valor_saldo: number;
                itens: Array<{ lancamento_id: number; valor_vinculado: number; desconto: number; juros_multa: number }>;
                residual: { lancamento_origem_id: number; valor: number } | null;
            }>(`/conciliacoes/linhas/${linhaId}/vincular`, {
                method: "POST",
                body: JSON.stringify({
                    ...payload,
                    preview: true,
                    contexto_rascunho: {
                        ja_vinculado_local_cents: jaVinculadoLocalCents,
                        quitado_local_por_lancamento: Object.fromEntries(
                            Object.entries(quitadoLocalPorLancamento).map(([k, v]) => [k, v]),
                        ),
                        ignorar_vinculos_reais: ignorarVinculosReais,
                    },
                }),
            });
            return {resultado, payload, descricao};
        },
        onSuccess: ({resultado, payload, descricao}) => {
            const item = resultado.itens[0];
            onDraftVincular({
                tipo: "vincular",
                linhaId,
                payload,
                ramo: resultado.ramo,
                delta: Number(resultado.delta),
                totalConciliado: Number(resultado.total_conciliado),
                valorSaldo: Number(resultado.valor_saldo),
                itens: item
                    ? [
                        {
                            lancamento_id: item.lancamento_id,
                            valor_vinculado: Number(item.valor_vinculado),
                            desconto: Number(item.desconto),
                            juros_multa: Number(item.juros_multa),
                            descricao,
                            tipo: tipoMovimento === "credito" ? "CR" : "CP",
                            status: "pendente",
                            vencimento: dataMovimento,
                        },
                    ]
                    : [],
                residual: resultado.residual
                    ? {lancamentoOrigemId: resultado.residual.lancamento_origem_id, valor: Number(resultado.residual.valor)}
                    : null,
            });
            invalidateRelated(queryClient, "lancamentos");
            toast({
                title: "Lançamento criado e vínculo adicionado",
                description: "Ainda não foi salvo - clique em Salvar/Conciliar no extrato para confirmar.",
            });
            setNovoLancamentoOpen(false);
            onClose();
        },
        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Lançamento criado, mas não foi possível vincular",
                description: e instanceof Error
                    ? `${e.message} — vincule manualmente pela lista abaixo.`
                    : "Vincule manualmente pela lista abaixo.",
            }),
    });

    if (!open) return null;

    const podeBuscarMais = diasJanela < DIAS_JANELA_MAXIMA;
    const handleBuscarMais = () => {
        setDiasJanela((d) => Math.min(DIAS_JANELA_MAXIMA, d + DIAS_JANELA_INCREMENTO));
    };

    const handleAplicarBusca = () => {
        setBuscaAtiva(buscaTexto.trim());
        const valorNormalizado = brMoneyDisplayToApiString(valorTexto) || "";
        setValorAtivo(valorNormalizado && valorNormalizado !== "0.00" ? valorNormalizado : "");
        setVencimentoAtivo(vencimentoTexto);
    };

    return createPortal(
        <div className="fixed inset-0 z-[60]">
            {/* DialogOverlay: cobre a tela inteira, sempre fixed ao viewport. */}
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md"/>
            {/* DialogContent: fixed + left-50%/-translate-x-50% (centraliza
                horizontalmente) e top-[5%]/md:top-[10%] com translate-y-0
                (NÃO usar top-1/2 -translate-y-1/2, que centralizaria
                verticalmente) - abre quase no topo da tela. */}
            <div
                className="fixed left-[50%] top-[5%] md:top-[10%] -translate-x-[50%] translate-y-0 bg-[#121417] border border-white/10 rounded-2xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] min-h-0 shadow-2xl flex flex-col overflow-hidden">
                {/* Cabeçalho com flex-wrap: em telas estreitas o bloco de ações
                    (Novo + fechar) quebra para a linha de baixo em vez de
                    espremer o título. */}
                <div className="flex items-center justify-between gap-3 p-5 border-b border-white/5 shrink-0 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                            <Link2 className="w-5 h-5 text-primary"/>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-white">Vincular lançamentos</h2>
                            <p className="text-xs text-muted-foreground truncate">
                                Linha #{linhaId} · Valor extrato {formatCurrency(Number(valorExtratoAbs))}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            title="Criar lançamento a partir desta linha"
                            onClick={() => setNovoLancamentoOpen(true)}
                            className="inline-flex items-center px-4 py-1.5 rounded-full bg-success hover:bg-success/90 text-white text-xs font-bold shadow-md shadow-success/20">
                            Novo
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
                            <X className="w-5 h-5"/>
                        </button>
                    </div>
                </div>

                {novoLancamentoOpen && (
                    <LancamentoModal
                        prefill={{
                            tipo: tipoMovimento === "credito" ? "CR" : "CP",
                            vencimento: dataMovimento ?? "",
                            valor: Math.abs(Number(valorExtratoAbs)),
                            descricao: descricaoLinha,
                        } satisfies LancamentoPrefill}
                        onClose={() => setNovoLancamentoOpen(false)}
                        onSaved={(created) => {
                            invalidateRelated(queryClient, "lancamentos");
                            if (created?.id) {
                                vincularAutoMutation.mutate({lancamentoId: created.id, descricao: descricaoLinha});
                            } else {
                                setNovoLancamentoOpen(false);
                            }
                        }}
                    />
                )}

                {/* RN-D4: janela de busca configurável + busca por descrição/parceiro/
                    valor/vencimento, em vez de depender só da proximidade de data. */}
                <div className="px-5 pt-4 pb-2 border-b border-white/5 shrink-0 space-y-2">
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                Janela de busca
                            </span>
                            <select
                                value={diasJanela}
                                onChange={(e) => setDiasJanela(Number(e.target.value))}
                                className="bg-[#1a1c23] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary/50">
                                <option value={14}>± 14 dias</option>
                                <option value={30}>± 30 dias</option>
                                <option value={60}>± 60 dias</option>
                                <option value={90}>± 90 dias</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                Descrição ou parceiro
                            </span>
                            <input
                                type="text"
                                value={buscaTexto}
                                onChange={(e) => setBuscaTexto(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAplicarBusca()}
                                placeholder="Ex.: aluguel, fornecedor…"
                                className="bg-[#1a1c23] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary/50"
                            />
                        </div>
                        <div className="flex flex-col gap-1 w-32">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                Valor
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={valorTexto}
                                onChange={(e) => setValorTexto(formatValorBrInput(e.target.value))}
                                onKeyDown={(e) => e.key === "Enter" && handleAplicarBusca()}
                                placeholder="0,00"
                                className="bg-[#1a1c23] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary/50"
                            />
                        </div>
                        <div className="flex flex-col gap-1 w-36">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                Vencimento
                            </span>
                            <input
                                type="date"
                                value={vencimentoTexto}
                                onChange={(e) => setVencimentoTexto(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAplicarBusca()}
                                className="bg-[#1a1c23] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary/50"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleAplicarBusca}
                            disabled={isFetching}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                                <Search className="w-3.5 h-3.5"/>}
                            Buscar
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin text-primary"/>
                        <span className="text-xs">Buscando lançamentos compatíveis…</span>
                    </div>
                ) : lancamentos.length === 0 ? (
                    <div className="py-12 px-5 text-center text-xs text-muted-foreground">
                        Nenhum lançamento compatível encontrado. Amplie a janela de datas ou busque por
                        descrição, parceiro, valor ou vencimento.
                        <div className="mt-4 flex items-center justify-center gap-3">
                            {podeBuscarMais && (
                                <button
                                    type="button"
                                    onClick={handleBuscarMais}
                                    disabled={isFetching}
                                    className="px-4 py-2 rounded-xl border border-white/10 text-sm text-primary hover:bg-white/5 flex items-center gap-2 disabled:opacity-50">
                                    {isFetching ? (
                                        <Loader2 className="w-4 h-4 animate-spin"/>
                                    ) : (
                                        <Search className="w-4 h-4"/>
                                    )}
                                    Ampliar janela de busca
                                </button>
                            )}
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
                        key={String(linhaId)}
                        extratoId={extratoId}
                        linhaId={linhaId}
                        valorExtratoAbs={valorExtratoAbs}
                        lancamentos={lancamentos}
                        onClose={onClose}
                        onDraftVincular={onDraftVincular}
                        jaVinculadoLocalCents={jaVinculadoLocalCents}
                        quitadoLocalPorLancamento={quitadoLocalPorLancamento}
                        ignorarVinculosReais={ignorarVinculosReais}
                        onBuscarMais={handleBuscarMais}
                        buscandoMais={isFetching}
                        podeBuscarMais={podeBuscarMais}
                    />
                )}
            </div>
        </div>,
        document.body,
    );
}