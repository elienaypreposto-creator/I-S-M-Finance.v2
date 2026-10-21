import {tenantQueryKey} from "@/lib/tenant-query";
import {useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode} from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import {
    useForm,
    Controller,
    useFieldArray,
    useWatch,
    type Control,
    type UseFormSetValue,
    type FieldErrors,
} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Modal, ModalBody, ModalFooter, ModalForm, ModalHeader, ModalSpinner, modalBtnPrimaryCls, modalBtnSecondaryCls} from "@/components/ui/modal-responsivo";
import {Calendar as CalendarPicker} from "@/components/ui/calendar";
import {format as formatBtn, parseISO} from "date-fns";
import {ptBR} from "date-fns/locale";
import {cn} from "@/lib/utils";
import {TIPOS_DOCUMENTO_LANCAMENTO} from "@/lib/lancamento-documento";
import {SelectCampo} from "@/components/ui/select-campo";
import {fetchApiData} from "@/lib/api-config";
import {
    AlertDialog,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogDescription,
} from "@/components/ui/dialog";
import {
    maskChavePix,
    mascararCodigoBanco,
    mascararAgencia,
    mascararConta,
    pixKeyMaxLength,
    pixKeyPlaceholder
} from "@/lib/pix-ted-masks.ts";
import {
    formatValorBrInput,
    getLancamentoModalDefaultValues,
    lancamentoModalFormSchema,
    mapModalFormToApiBody,
    pagamentoItemDefault,
    apiValorToValorBr,
    brMoneyDisplayToApiString,
    type LancamentoApiBody,
    type LancamentoEditItem,
    type LancamentoModalFormValues,
    type PagamentoItemFormValues,
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
    Building2,
    CreditCard,
    Trash2,
    AlertTriangle,
} from "lucide-react";
import {NovoParceiroModal, type ParceiroRow} from "@/pages/cadastros/parceiros";
import {ParceiroCombobox} from "@/components/shared/parceiro-combobox";
import {PlanoContaCombobox, type PlanoContaOption as PlanoConta} from "@/components/shared/plano-conta-combobox";

type Departamento = { id: number; nome: string };
type CentroCusto = { id: number; nome: string; departamento_id: number | null };

/**
 * Pré-preenche um lançamento novo a partir da linha do extrato.
 * Não usa LancamentoEditItem (evita GET /lancamentos/:id).
 */
export type LancamentoPrefill = {
    tipo: "CP" | "CR";
    vencimento: string; // "YYYY-MM-DD"
    valor: number;
    descricao?: string | null;
};

function buildDefaultValuesFromPrefill(prefill: LancamentoPrefill): LancamentoModalFormValues {
    return {
        ...getLancamentoModalDefaultValues(null),
        tipo: prefill.tipo,
        vencimento: prefill.vencimento || "",
        valorBr: apiValorToValorBr(prefill.valor),
        descricao: prefill.descricao ?? "",
    };
}

// Converte uma string mascarada em pt-BR ("1.234,56") para number (1234.56).
// Usado apenas para o cálculo em tempo real do "Valor Atual" (Bruto - Desconto + Juros).
function parseValorBrToNumber(display: string | undefined | null): number {
    const api = brMoneyDisplayToApiString(display ?? "");
    const n = parseFloat(api);
    return isNaN(n) ? 0 : n;
}

// ── Estilos do modal ──────────────────────────────────────────────────────
// Tudo em `em`: o DialogContent define o font-size com
// clamp(14px, 0.45vw + 8px, 18px) e campos, rótulos e espaçamentos crescem
// junto em telas maiores. Nenhum texto fica abaixo de 0.75em (10,5px no
// celular). O foco é indicado por um anel visível (não só pela cor da borda).
const focusRingCls =
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#121417]";
// Altura 3.4em no celular (≈44px, alvo de toque) e 2.9em do tablet em diante.
const fieldCls = cn(
    "w-full h-[3.4em] md:h-[2.9em] bg-[#1a1c23] border border-white/10 rounded-[0.7em] px-[0.95em] text-[0.93em] text-white",
    "transition-colors placeholder:text-muted-foreground/50 hover:border-white/20 focus:border-primary/60",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    focusRingCls,
);
const labelCls = "block text-[0.75em] font-bold text-muted-foreground uppercase tracking-[0.06em] mb-[0.45em]";
const errorCls = "text-[0.75em] text-destructive mt-[0.3em] font-medium";
const pmtCellInputCls = cn(
    "w-full h-[2.6em] bg-white/5 border border-white/10 rounded-[0.6em] px-[0.75em] text-[0.93em] text-white",
    "transition-colors placeholder:text-muted-foreground/50 focus:border-primary/60",
    focusRingCls,
);
const pmtErrCls = "text-[0.75em] text-destructive mt-[0.3em]";
const pmtThCls = "px-[0.75em] py-[0.5em] text-[0.75em] font-medium text-muted-foreground uppercase tracking-wide";
const pmtAddBtnCls = cn(
    "inline-flex items-center gap-[0.25em] rounded-[0.4em] text-[0.8em] text-primary hover:text-primary/80 font-semibold transition-colors",
    focusRingCls,
);
const pmtRemoveBtnCls = cn(
    "inline-flex items-center justify-center w-[2em] h-[2em] rounded-[0.5em] text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors",
    focusRingCls,
);

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

/** Bloco com título (Identificação, Valores e classificação, Pagamento e risco). */
function FormSection({id, title, className, children}: {
    id: string;
    title: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section aria-labelledby={id} className={cn("min-w-0", className)}>
            <h3 id={id}
                className="text-[0.78em] font-extrabold uppercase tracking-[0.09em] text-[#7FC4EA] mb-[0.9em] pb-[0.5em] border-b border-white/[0.06]">
                {title}
            </h3>
            <div className="space-y-[1em]">{children}</div>
        </section>
    );
}

// Modal de confirmação genérico e reutilizável, seguindo o padrão visual usado
// em toda a aplicação (ícone no topo, título em negrito, descrição centralizada,
// dois botões lado a lado). Usado aqui para confirmar o cancelamento do
// cadastro/edição quando há alterações não salvas no formulário.
// É um AlertDialog do Radix aninhado no Dialog do lançamento: prende o foco,
// o Esc fecha só ele e o foco volta para o formulário.
type ConfirmDialogTone = "warning" | "danger" | "info";

function ConfirmDialog({
                           open,
                           icon,
                           tone = "warning",
                           title,
                           description,
                           confirmLabel,
                           cancelLabel = "Cancelar",
                           onConfirm,
                           onCancel,
                       }: {
    open: boolean;
    icon?: React.ReactNode;
    tone?: ConfirmDialogTone;
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const toneCls: Record<ConfirmDialogTone, { iconBg: string; iconColor: string; confirmBtn: string }> = {
        warning: {
            iconBg: "bg-yellow-500/10",
            iconColor: "text-yellow-400",
            confirmBtn: "bg-destructive hover:bg-destructive/90",
        },
        danger: {
            iconBg: "bg-destructive/10",
            iconColor: "text-destructive",
            confirmBtn: "bg-destructive hover:bg-destructive/90",
        },
        info: {
            iconBg: "bg-primary/10",
            iconColor: "text-primary",
            confirmBtn: "bg-primary hover:bg-primary/90",
        },
    };
    const t = toneCls[tone];
    // O AlertDialog do Radix só devolve o foco a um Trigger (não há): guardamos
    // o elemento focado ao abrir e voltamos para ele ao fechar.
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const btnFocus = "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#181a20]";

    return (
        <AlertDialog open={open} onOpenChange={(o) => {
            if (!o) onCancel();
        }}>
            <AlertDialogPortal>
                <AlertDialogOverlay className="z-[70] bg-black/70 backdrop-blur-md motion-reduce:animate-none"/>
                <AlertDialogPrimitive.Content
                    onOpenAutoFocus={() => {
                        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    }}
                    onCloseAutoFocus={(e) => {
                        const el = returnFocusRef.current;
                        if (el?.isConnected) {
                            e.preventDefault();
                            el.focus();
                        }
                    }}
                    className="fixed inset-0 m-auto h-fit z-[70] bg-[#181a20] border border-white/10 rounded-2xl w-[calc(100%-2rem)] max-w-sm shadow-2xl p-6 flex flex-col items-center text-center gap-4 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${t.iconBg}`}>
                        {icon ?? <AlertTriangle aria-hidden="true" className={`w-6 h-6 ${t.iconColor}`}/>}
                    </div>
                    <div className="space-y-1.5">
                        <AlertDialogTitle className="text-base font-black text-white tracking-tight">{title}</AlertDialogTitle>
                        {description ? (
                            <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
                                {description}
                            </AlertDialogDescription>
                        ) : null}
                    </div>
                    <div className="flex gap-3 w-full pt-2">
                        <AlertDialogPrimitive.Cancel
                            className={cn("flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white hover:bg-white/5 text-sm font-bold transition-colors", btnFocus)}>
                            {cancelLabel}
                        </AlertDialogPrimitive.Cancel>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className={cn(`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-colors ${t.confirmBtn}`, btnFocus)}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </AlertDialogPrimitive.Content>
            </AlertDialogPortal>
        </AlertDialog>
    );
}

const BASE_RISK_LEVELS: Record<number, { label: string; color: string; tags: string[] }> = {
    1: {
        label: "Nível 1 - Alerta",
        color: "text-yellow-400",
        tags: ["Multas e Juros", "Perda de Desconto", "Restrição de Crédito"]
    },
    2: {
        label: "Nível 2 - Risco Operacional",
        color: "text-orange-500",
        tags: ["Corte de Serviço", "Suspensão de Fornecimento", "Negativação", "Perda de Benefício Fiscal"]
    },
    3: {
        label: "Nível 3 - Risco Jurídico",
        color: "text-red-500",
        tags: ["Protesto", "Ação Judicial", "Dívida Ativa", "Quebra de Contrato"]
    },
    4: {
        label: "Nível 4 - Risco Crítico",
        color: "text-purple-400",
        tags: ["Bloqueio de Contas (Sisbajud)", "Penhora de Bens", "Pedido de Falência", "Impedimento de Certidão"]
    },
};

function CompetenciaPicker({value, onChange}: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const [currentYear, setCurrentYear] = useState(value?.includes("/") ? parseInt(value.split("/")[1]) : new Date().getFullYear());
    const selectedMonthIdx = value?.includes("/") ? parseInt(value.split("/")[0]) - 1 : -1;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" id="lancamento-competencia"
                        className={cn(fieldCls, "flex items-center justify-between text-left", !value && "text-muted-foreground/70")}>
                    {value || "Selecione..."}
                    <CalendarDays aria-hidden="true" className="w-[1.05em] h-[1.05em] text-muted-foreground shrink-0"/>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start"
                            className="bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl p-4 w-72">
                <div className="flex items-center justify-between mb-4 px-1">
                    <button type="button" onClick={() => setCurrentYear((y) => y - 1)} aria-label="Ano anterior"
                            className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
                        <ChevronLeft className="w-5 h-5"/>
                    </button>
                    <span className="text-sm font-bold text-white tracking-widest">{currentYear}</span>
                    <button type="button" onClick={() => setCurrentYear((y) => y + 1)} aria-label="Próximo ano"
                            className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
                        <ChevronRight className="w-5 h-5"/>
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {months.map((m, i) => (
                        <button key={m} type="button"
                                onClick={() => {
                                    onChange(`${String(i + 1).padStart(2, "0")}/${currentYear}`);
                                    setOpen(false);
                                }}
                                className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                                    selectedMonthIdx === i && value.includes(String(currentYear))
                                        ? "bg-primary text-white shadow-lg shadow-primary/30"
                                        : "text-white/60 hover:bg-white/5 hover:text-white"
                                }`}>
                            {m}
                        </button>
                    ))}
                </div>
                <div className="flex justify-end mt-4 pt-3 border-t border-white/5">
                    <button type="button" onClick={() => setOpen(false)}
                            className="px-4 py-1.5 bg-success hover:bg-success/90 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-success/20">
                        Confirmar
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

type PagamentoPIXRowProps = {
    index: number;
    control: Control<LancamentoModalFormValues>;
    setValue: UseFormSetValue<LancamentoModalFormValues>;
    removePagamento: (index: number) => void;
    errors: FieldErrors<LancamentoModalFormValues>;
};

function PagamentoPIXRow({index, control, setValue, removePagamento, errors}: PagamentoPIXRowProps) {
    const tipoChave = useWatch({control, name: `pagamentos.${index}.tipo_chave_pix`}) ?? "";
    const itemErr = errors.pagamentos?.[index];

    return (
        <tr className="border-t border-white/5">
            <td className="px-[0.75em] py-[0.5em] align-top w-[11em]">
                <Controller
                    name={`pagamentos.${index}.tipo_chave_pix`}
                    control={control}
                    render={({field}) => (
                        <SelectCampo
                            value={field.value ?? ""}
                            permitirVazio
                            placeholder="Selecione..."
                            aria-label="Tipo de chave PIX"
                            onBlur={field.onBlur}
                            onChange={(value) => {
                                field.onChange(value);
                                setValue(`pagamentos.${index}.chave_pix`, "", {shouldDirty: true});
                            }}
                            opcoes={[
                                {value: "cpf", label: "CPF"},
                                {value: "cnpj", label: "CNPJ"},
                                {value: "email", label: "E-mail"},
                                {value: "telefone", label: "Telefone"},
                                {value: "aleatoria", label: "Chave Aleatória"},
                            ]}
                        />
                    )}
                />
                {itemErr?.tipo_chave_pix && <p className={pmtErrCls}>{itemErr.tipo_chave_pix.message}</p>}
            </td>
            <td className="px-[0.75em] py-[0.5em] align-top">
                <Controller
                    name={`pagamentos.${index}.chave_pix`}
                    control={control}
                    render={({field}) => (
                        <input
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(maskChavePix(e.target.value, tipoChave))}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            maxLength={pixKeyMaxLength(tipoChave)}
                            placeholder={pixKeyPlaceholder(tipoChave)}
                            aria-label="Chave PIX"
                            className={pmtCellInputCls}
                        />
                    )}
                />
                {itemErr?.chave_pix && <p className={pmtErrCls}>{itemErr.chave_pix.message}</p>}
            </td>
            <td className="px-[0.5em] py-[0.5em] align-top text-right w-[3em]">
                <button
                    type="button"
                    onClick={() => removePagamento(index)}
                    className={pmtRemoveBtnCls}
                    title="Remover chave PIX"
                    aria-label="Remover chave PIX"
                >
                    <Trash2 aria-hidden="true" className="w-[1em] h-[1em]"/>
                </button>
            </td>
        </tr>
    );
}

type LancamentoModalProps = {
    onClose: () => void;
    /** Chamado após salvar com sucesso. No modo de criação (sem `editItem`),
     *  recebe o registro criado (com `id`) - útil para quem abriu o modal em
     *  contexto de Conciliação vincular a linha do extrato em seguida. No
     *  modo edição, é chamado sem argumento. */
    onSaved: (created?: { id: number }) => void;
    editItem?: LancamentoEditItem | null;
    /** Pré-preenche criação nova. Ignorado se editItem estiver presente. */
    prefill?: LancamentoPrefill;
};

export function LancamentoModal({onClose, onSaved, editItem, prefill}: LancamentoModalProps) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [riskLevels, setRiskLevels] = useState(BASE_RISK_LEVELS);
    const [showAddTag, setShowAddTag] = useState(false);
    const [newTag, setNewTag] = useState({name: "", level: 1});
    const [nivelRisco, setNivelRisco] = useState(0);
    const [searchParceiro, setSearchParceiro] = useState("");

    // Controla a exibição do modal "Cancelar cadastro?" quando o usuário
    // tenta fechar/cancelar um formulário que já possui alterações não salvas
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    type ParceiroSubModal = { mode: "create" } | { mode: "edit"; data: ParceiroRow };
    const [parceiroSubModal, setParceiroSubModal] = useState<ParceiroSubModal | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    // Só é edição de um lançamento já existente quando `editItem` foi passado
    // (criação nova e criação via prefill de conciliação NÃO mostram
    // Desconto/Juros - esses campos só fazem sentido para ajustar um título
    // já lançado, na aba Lançamentos).
    const isEditing = !!editItem;

    // Garante que o `reset()` vindo do fetch completo (`editItemFull`) só
    // sobrescreve o formulário quando uma busca REALMENTE NOVA chegou (não a
    // cada re-render). Guardamos pelo timestamp da busca (`dataUpdatedAt`),
    // não pelo id: guardar só pelo id quebra a reabertura do MESMO
    // lançamento, porque o React Query mostra primeiro o valor antigo em
    // cache (mesmo id) e só depois chega a versão atualizada do servidor -
    // um guard "por id" bloquearia essa segunda atualização e o formulário
    // ficaria preso no Desconto/Juros salvos antes da última edição.
    const hydratedAtRef = useRef<number>(0);

    function buildInitialValues(): LancamentoModalFormValues {
        const criar = !editItem;
        const base = editItem
            ? getLancamentoModalDefaultValues(editItem)
            : prefill
                ? buildDefaultValuesFromPrefill(prefill)
                : getLancamentoModalDefaultValues(null);
        return {...base, exigir_tipo_documento: criar, exigir_descricao: criar};
    }

    const form = useForm<LancamentoModalFormValues>({
        resolver: zodResolver(lancamentoModalFormSchema),
        defaultValues: buildInitialValues(),
    });

    const {
        register,
        handleSubmit,
        control,
        watch,
        setValue,
        reset,
        formState: {errors, isDirty, dirtyFields},
    } = form;

    const {data: editItemFull, dataUpdatedAt} = useQuery<LancamentoEditItem>({
        queryKey: tenantQueryKey("lancamento-edit", editItem?.id),
        queryFn: () => fetchApiData<LancamentoEditItem>(`/lancamentos/${editItem!.id}`),
        enabled: !!editItem?.id,
        staleTime: 0,
        // Evita que um refetch automático (ex.: ao voltar o foco pra
        // aba/janela) dispare o reset() abaixo enquanto o usuário edita.
        refetchOnWindowFocus: false,
    });

    const vencimento = watch("vencimento");
    const tipo = watch("tipo");
    const status = watch("status");
    const riscos = watch("riscos");
    const departamento_id = watch("departamento_id");
    const centro_custo_id = watch("centro_custo_id");
    const observacao = watch("observacao") ?? "";
    const exigirTipoDocumento = watch("exigir_tipo_documento");
    const exigirDescricao = watch("exigir_descricao");
    const isCP = tipo === "CP";

    const valorBr = watch("valorBr");
    const descontoBr = watch("descontoBr") ?? "";
    const jurosBr = watch("jurosBr") ?? "";
    const valorAtual = Math.max(
        parseValorBrToNumber(valorBr) - parseValorBrToNumber(descontoBr) + parseValorBrToNumber(jurosBr),
        0
    );

    const {fields: pagamentosFields, append: appendPagamento, remove: removePagamento} = useFieldArray({
        control,
        name: "pagamentos",
    });

    const pagamentosWatched = (watch("pagamentos") ?? []) as Array<{ tipo: string }>;
    const pixEntries = pagamentosFields.map((f, i) => ({f, i})).filter(({i}) => pagamentosWatched[i]?.tipo === "PIX");
    const tedEntries = pagamentosFields.map((f, i) => ({f, i})).filter(({i}) => pagamentosWatched[i]?.tipo === "TED");
    const boletoEntries = pagamentosFields.map((f, i) => ({
        f,
        i
    })).filter(({i}) => pagamentosWatched[i]?.tipo === "Boleto");

    function handlePagamentoTipoChange(index: number, newTipo: PagamentoItemFormValues["tipo"]) {
        setValue(`pagamentos.${index}.tipo`, newTipo, {shouldDirty: true});
        setValue(`pagamentos.${index}.tipo_chave_pix`, "");
        setValue(`pagamentos.${index}.chave_pix`, "");
        setValue(`pagamentos.${index}.banco_codigo`, "");
        setValue(`pagamentos.${index}.banco_nome`, "");
        setValue(`pagamentos.${index}.banco_agencia`, "");
        setValue(`pagamentos.${index}.banco_conta`, "");
        setValue(`pagamentos.${index}.boleto_codigo_barras`, "");
    }

    // Tenta fechar o modal: se o formulário tiver alterações não salvas,
    // exibe a confirmação antes de descartar; caso contrário, fecha direto.
    function handleRequestClose() {
        if (isDirty) {
            setShowCancelConfirm(true);
        } else {
            onClose();
        }
    }

    // Esc, foco preso e devolução do foco ficam com o Modal (Dialog do Radix).
    // O cadastro de parceiro é outro Modal aninhado: enquanto aberto, o Esc e
    // o Tab ficam só nele, e ao fechar o foco volta ao campo Cliente/Fornecedor.

    // Reset ao abrir / mudar item (usa dados da lista - sem pagamentos ainda,
    // ou dados de pré-preenchimento vindos da Conciliação)
    useEffect(() => {
        reset(buildInitialValues());
        // Libera a hidratação do editItemFull para o próximo lançamento
        // aberto (ver useEffect abaixo).
        hydratedAtRef.current = 0;
        setNivelRisco(0);
        setRiskLevels(BASE_RISK_LEVELS);
        setShowAddTag(false);
        setShowCancelConfirm(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editItem, prefill, reset]);

    // Hidrata o formulário com os dados completos (`editItemFull`, incluindo
    // dados_pagamento) assim que uma busca NOVA chegar do servidor - tanto a
    // primeira quanto qualquer uma vinda de uma invalidação explícita (ex.:
    // depois de salvar). Usar `dataUpdatedAt` em vez do id evita dois
    // problemas opostos: (1) reabrir o MESMO lançamento não fica preso nos
    // dados antigos que o React Query mostra primeiro a partir do cache, e
    // (2) um refetch por foco de janela no meio da edição não sobrescreve o
    // que o usuário digitou (isso já está coberto por `refetchOnWindowFocus:
    // false` acima, então aqui só filtramos re-renders sem busca nova).
    useEffect(() => {
        if (!editItem) return;
        if (dirtyFields.tipo_documento) {
            setValue("exigir_tipo_documento", true, {shouldValidate: true});
        }
        if (dirtyFields.descricao) {
            setValue("exigir_descricao", true, {shouldValidate: true});
        }
    }, [editItem, dirtyFields.tipo_documento, dirtyFields.descricao, setValue]);

    useEffect(() => {
        if (editItemFull && dataUpdatedAt !== hydratedAtRef.current) {
            reset(getLancamentoModalDefaultValues(editItemFull));
            hydratedAtRef.current = dataUpdatedAt;
        }
    }, [editItemFull, dataUpdatedAt, reset]);

    // Sincroniza status ao mudar tipo

    useEffect(() => {
        if (tipo === "CR" && status === "pago") setValue("status", "recebido", {shouldValidate: true});
        if (tipo === "CP" && status === "recebido") setValue("status", "pago", {shouldValidate: true});
    }, [tipo, status, setValue]);

    // Sugestão automática de nível de risco

    useEffect(() => {
        if (vencimento && nivelRisco === 0) {
            const vcto = new Date(vencimento + "T00:00:00");
            const diffDays = Math.floor((Date.now() - vcto.getTime()) / 86_400_000);
            let level = 0;
            if (diffDays >= 1 && diffDays <= 15) level = 1;
            else if (diffDays >= 16 && diffDays <= 30) level = 2;
            else if (diffDays >= 31 && diffDays <= 60) level = 3;
            else if (diffDays > 60) level = 4;
            setNivelRisco(level);
        }
    }, [vencimento, nivelRisco]);

    const {data: parceiros = [], isFetching: isFetchingParceiros} = useQuery<ParceiroRow[]>({
        queryKey: tenantQueryKey("parceiros-modal", searchParceiro),
        queryFn: () => {
            const qs = new URLSearchParams({page: "1", limit: "20"});
            if (searchParceiro.trim()) qs.set("search", searchParceiro.trim());
            return fetchApiData<ParceiroRow[]>(`/parceiros?${qs.toString()}`);
        },
    });

    const {data: planoContas = []} = useQuery<PlanoConta[]>({
        queryKey: tenantQueryKey("plano-contas-modal"),
        queryFn: () => fetchApiData<PlanoConta[]>("/plano-contas"),
    });

    const {data: departamentos = []} = useQuery<Departamento[]>({
        queryKey: tenantQueryKey("departamentos-modal"),
        queryFn: () => fetchApiData<Departamento[]>("/departamentos"),
    });

    const {data: centrosCusto = []} = useQuery<CentroCusto[]>({
        queryKey: tenantQueryKey("centros-custo-modal"),
        queryFn: () => fetchApiData<CentroCusto[]>("/centros-custos"),
        retry: false,
    });

    // Filtra centros de custo pelo departamento selecionado
    const centrosCustoFiltrado = departamento_id
        ? centrosCusto.filter((cc) => cc.departamento_id === Number(departamento_id))
        : centrosCusto;

    const mutation = useMutation({
        mutationFn: (body: LancamentoApiBody) => {
            if (editItem) return fetchApiData<{ id: number }>(`/lancamentos/${editItem.id}`, {
                method: "PUT",
                body: JSON.stringify(body)
            });
            // AJUSTAR se a API embrulhar a resposta (ex.: { lancamento: { id } }):
            // troque para fetchApiData<{ lancamento: { id: number } }> e ajuste
            // o onSuccess abaixo (resp.lancamento.id em vez de resp.id).
            return fetchApiData<{ id: number }>(`/lancamentos`, {method: "POST", body: JSON.stringify(body)});
        },
        onSuccess: (resp) => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("lancamentos")});
            // Invalida o cache do fetch-por-ID também - sem isso, reabrir o
            // MESMO lançamento logo em seguida poderia (dependendo do
            // timing) reutilizar dados desatualizados antes do refetch.
            if (editItem?.id) {
                void queryClient.invalidateQueries({queryKey: tenantQueryKey("lancamento-edit", editItem.id)});
            }
            toast({title: "Sucesso", description: editItem ? "Lançamento atualizado." : "Lançamento criado."});
            onSaved(editItem ? undefined : resp);
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro",
                description: e instanceof Error ? e.message : "Não foi possível salvar o lançamento."
            });
        },
    });

    const onSubmit = (values: LancamentoModalFormValues) => mutation.mutate(mapModalFormToApiBody(values));

    // Handlers de risco

    const handleToggleTag = (tag: string) => {
        const exists = riscos.includes(tag);
        setValue("riscos", exists ? riscos.filter((t) => t !== tag) : [...riscos, tag], {
            shouldDirty: true,
            shouldValidate: true
        });
    };

    const handleCreateTag = () => {
        if (!newTag.name) return;
        setRiskLevels((prev) => {
            const lv = prev[newTag.level];
            return {...prev, [newTag.level]: {...lv, tags: [...lv.tags, newTag.name]}};
        });
        setNewTag({name: "", level: newTag.level});
        setShowAddTag(false);
        toast({title: "Tag criada", description: `Tag adicionada ao Nível ${newTag.level}.`});
    };

    const inputCls = fieldCls;
    const comboTriggerCls = cn("h-[3.4em] md:h-[2.9em] py-0 px-[0.95em] text-[0.93em] rounded-[0.7em]", focusRingCls);

    const selectedRisk = riskLevels[nivelRisco];

    // Ctrl/⌘ + Enter conclui o lançamento de qualquer campo do formulário.
    // Não vale com a confirmação de cancelamento ou o cadastro de parceiro
    // abertos por cima (os eventos deles também passam por aqui no React).
    function handleContentKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
        if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
        if (showCancelConfirm || parceiroSubModal || mutation.isPending) return;
        e.preventDefault();
        formRef.current?.requestSubmit();
    }

    const valorAtualFmt = valorAtual.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    return (
        // Clique fora não fecha (evita perder o que foi digitado): padrão do Modal.
        <Modal onClose={handleRequestClose} onKeyDown={handleContentKeyDown}>
                {/* Header (fixo) */}
                <ModalHeader title={editItem ? "Editar Lançamento" : "Novo Lançamento"}
                             description="Preencha os dados financeiros detalhados">
                    {/* Valor Atual - fixo durante toda a edição (Bruto - Desconto + Juros).
                        Fica fora do cabeçalho no celular. */}
                    {isEditing && (
                        <div className="hidden md:block text-right">
                            <p className="text-[0.75em] font-bold text-muted-foreground uppercase tracking-[0.08em]">
                                Valor Atual
                            </p>
                            <p className="text-[1.35em] font-black text-primary leading-tight tabular-nums">
                                {valorAtualFmt}
                            </p>
                        </div>
                    )}
                </ModalHeader>

                    <ModalForm ref={formRef} onSubmit={handleSubmit(onSubmit)}>

                        {/* Corpo: o único trecho que rola */}
                        <ModalBody ref={bodyRef}>
                            <div
                                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.05fr_1fr_1fr] gap-x-[1.8em] gap-y-[1.4em]">

                                {/* ── Identificação ──────────────────────────────────────── */}
                                <FormSection id="lancamento-sec-identificacao" title="Identificação">

                                    {/* Tipo */}
                                    <div role="group" aria-labelledby="lancamento-tipo-label">
                                        <span id="lancamento-tipo-label" className={labelCls}>Tipo de Registro *</span>
                                        <div className="grid grid-cols-2 gap-[0.6em]">
                                            {[
                                                {
                                                    v: "CP" as const,
                                                    label: "Contas a Pagar",
                                                    color: "border-orange-500 bg-orange-500/10 text-orange-400"
                                                },
                                                {
                                                    v: "CR" as const,
                                                    label: "Contas a Receber",
                                                    color: "border-teal-500 bg-teal-500/10 text-teal-400"
                                                },
                                            ].map(({v, label, color}) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    aria-pressed={tipo === v}
                                                    onClick={() => {
                                                        setValue("tipo", v, {shouldValidate: true, shouldDirty: true});
                                                        // Limpeza síncrona: CR não tem formas de pagamento
                                                        if (v === "CR") setValue("pagamentos", []);
                                                    }}
                                                    className={cn(
                                                        "h-[3.4em] md:h-[2.9em] px-[0.5em] rounded-[0.7em] text-[0.93em] font-bold border transition-colors",
                                                        tipo === v ? `${color} shadow-lg` : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-white",
                                                        focusRingCls,
                                                    )}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        {errors.tipo && <p className={errorCls}>{errors.tipo.message}</p>}
                                    </div>

                                    {/* Vencimento + Competência */}
                                    <div className="grid grid-cols-2 gap-[0.8em]">
                                        <div className="min-w-0">
                                            <label htmlFor="lancamento-vencimento" className={labelCls}>Vencimento *</label>
                                            <Controller name="vencimento" control={control} render={({field}) => (
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <button type="button" id="lancamento-vencimento"
                                                                className={cn(inputCls, "flex items-center justify-between text-left", !field.value && "text-muted-foreground/70")}>
                                                            {field.value ? formatBtn(parseISO(field.value), "dd/MM/yyyy") : "Selecione..."}
                                                            <Calendar aria-hidden="true"
                                                                      className="w-[1.05em] h-[1.05em] text-muted-foreground shrink-0"/>
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 border border-white/10"
                                                                    align="start">
                                                        <CalendarPicker
                                                            mode="single"
                                                            selected={field.value ? parseISO(field.value) : undefined}
                                                            onSelect={(date) => field.onChange(date ? formatBtn(date, "yyyy-MM-dd") : "")}
                                                            locale={ptBR}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            )}/>
                                            {errors.vencimento && <p className={errorCls}>{errors.vencimento.message}</p>}
                                        </div>
                                        <div className="min-w-0">
                                            <label htmlFor="lancamento-competencia" className={labelCls}>Competência</label>
                                            <Controller name="competencia" control={control} render={({field}) => (
                                                <CompetenciaPicker value={field.value || ""} onChange={field.onChange}/>
                                            )}/>
                                        </div>
                                    </div>

                                    {/* Cliente/Fornecedor - Combobox com busca */}
                                    <div role="group" aria-labelledby="lancamento-parceiro-label">
                                        <span id="lancamento-parceiro-label" className={labelCls}>Cliente / Fornecedor</span>
                                        <Controller name="parceiro_id" control={control} render={({field}) => (
                                            <ParceiroCombobox
                                                value={field.value}
                                                onChange={field.onChange}
                                                parceiros={parceiros}
                                                search={searchParceiro}
                                                onSearchChange={setSearchParceiro}
                                                isLoading={isFetchingParceiros}
                                                onEdit={(p) => setParceiroSubModal({mode: "edit", data: p})}
                                                onCreateNew={() => setParceiroSubModal({mode: "create"})}
                                                className={comboTriggerCls}
                                            />
                                        )}/>
                                        {errors.parceiro_id && <p className={errorCls}>{errors.parceiro_id.message}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-[0.8em]">
                                        <div className="min-w-0">
                                            <label htmlFor="tipo-documento" className={labelCls}>
                                                Tipo de documento{exigirTipoDocumento ? " *" : ""}
                                            </label>
                                            <Controller name="tipo_documento" control={control} render={({field}) => (
                                                <SelectCampo
                                                    id="tipo-documento"
                                                    value={field.value || ""}
                                                    placeholder="Selecione..."
                                                    aria-required={exigirTipoDocumento}
                                                    aria-invalid={!!errors.tipo_documento}
                                                    aria-describedby={errors.tipo_documento ? "tipo-documento-erro" : undefined}
                                                    onChange={(value) => {
                                                        field.onChange(value);
                                                        if (editItem) {
                                                            setValue("exigir_tipo_documento", true, {
                                                                shouldValidate: true,
                                                                shouldDirty: true,
                                                            });
                                                        }
                                                    }}
                                                    opcoes={TIPOS_DOCUMENTO_LANCAMENTO.map((tipoDoc) => ({
                                                        value: tipoDoc.value,
                                                        label: tipoDoc.label,
                                                    }))}
                                                />
                                            )}/>
                                            {errors.tipo_documento && (
                                                <p id="tipo-documento-erro"
                                                   className={errorCls}>{errors.tipo_documento.message}</p>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <label htmlFor="numero-documento" className={labelCls}>Nº do documento</label>
                                            <input
                                                id="numero-documento"
                                                type="text"
                                                maxLength={60}
                                                {...register("numero_documento")}
                                                className={inputCls}
                                                placeholder="Ex.: 12345"
                                                aria-invalid={!!errors.numero_documento}
                                                aria-describedby={errors.numero_documento ? "numero-documento-erro" : undefined}
                                            />
                                            {errors.numero_documento && (
                                                <p id="numero-documento-erro"
                                                   className={errorCls}>{errors.numero_documento.message}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="lancamento-descricao" className={labelCls}>
                                            Descrição{exigirDescricao ? " *" : ""}
                                        </label>
                                        <input
                                            id="lancamento-descricao"
                                            type="text"
                                            {...register("descricao")}
                                            className={inputCls}
                                            placeholder="Ex.: Manutenção servidor AWS - Outubro"
                                            aria-required={exigirDescricao}
                                            aria-invalid={!!errors.descricao}
                                            aria-describedby={errors.descricao ? "lancamento-descricao-erro lancamento-descricao-hint" : "lancamento-descricao-hint"}
                                        />
                                        <p id="lancamento-descricao-hint"
                                           className="text-[0.75em] text-muted-foreground mt-[0.3em]">
                                            Aparece na lista de lançamentos e na busca.
                                        </p>
                                        {errors.descricao && (
                                            <p id="lancamento-descricao-erro"
                                               className={errorCls}>{errors.descricao.message}</p>
                                        )}
                                    </div>
                                </FormSection>

                                {/* ── Valores e classificação ────────────────────────────── */}
                                <FormSection id="lancamento-sec-valores" title="Valores e classificação">

                                    {/* Classificação (Plano de Contas) - combobox com busca:
                                        debounce de 200ms, busca no servidor a partir de 3 caracteres,
                                        resultados agrupados por categoria */}
                                    <div role="group" aria-labelledby="lancamento-plano-label">
                                        <span id="lancamento-plano-label" className={labelCls}>Classificação (Plano de Contas)</span>
                                        <Controller name="plano_conta_id" control={control} render={({field}) => (
                                            <PlanoContaCombobox
                                                value={field.value}
                                                onChange={field.onChange}
                                                planoContas={planoContas}
                                                error={errors.plano_conta_id?.message}
                                                className={comboTriggerCls}
                                            />
                                        )}/>
                                    </div>

                                    {/* Valor + Status */}
                                    <div className="grid grid-cols-2 gap-[0.8em]">
                                        <div className="min-w-0">
                                            <label htmlFor="lancamento-valor" className={labelCls}>Valor Previsto (R$) *</label>
                                            <Controller name="valorBr" control={control} render={({field}) => (
                                                <input
                                                    id="lancamento-valor"
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    value={field.value}
                                                    onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                                                    onBlur={field.onBlur}
                                                    name={field.name}
                                                    ref={field.ref}
                                                    className={cn(inputCls, "text-[1em] font-bold text-primary tabular-nums")}
                                                    placeholder="0,00"
                                                />
                                            )}/>
                                            {errors.valorBr && <p className={errorCls}>{errors.valorBr.message}</p>}
                                        </div>
                                        <div className="min-w-0">
                                            <label htmlFor="lancamento-status" className={labelCls}>Status</label>
                                            <SelectCampo
                                                id="lancamento-status"
                                                value={status ?? ""}
                                                onChange={(value) => setValue("status", value as typeof status, {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                })}
                                                opcoes={[
                                                    {value: "pendente", label: "Pendente"},
                                                    tipo === "CR"
                                                        ? {value: "recebido", label: "Recebido (Liquidado)"}
                                                        : {value: "pago", label: "Pago (Liquidado)"},
                                                    {value: "pago_parcial", label: "Pago parcial"},
                                                    {value: "atrasado", label: "Atrasado"},
                                                    {value: "cancelado", label: "Cancelado"},
                                                ]}
                                            />
                                            {errors.status && <p className={errorCls}>{errors.status.message}</p>}
                                        </div>
                                    </div>

                                    {/* Desconto / Juros - só na EDIÇÃO de um lançamento já existente.
                                        Ajustam o valor líquido do título (Valor Atual, exibido no
                                        cabeçalho do modal) sem alterar o Valor Previsto/de face acima. */}
                                    {isEditing && (
                                        <div className="grid grid-cols-2 gap-[0.8em]">
                                            <div className="min-w-0">
                                                <label htmlFor="lancamento-desconto" className={labelCls}>Desconto (R$)</label>
                                                <Controller name="descontoBr" control={control} render={({field}) => (
                                                    <input
                                                        id="lancamento-desconto"
                                                        type="text"
                                                        inputMode="numeric"
                                                        autoComplete="off"
                                                        value={field.value ?? ""}
                                                        onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                                                        onBlur={field.onBlur}
                                                        name={field.name}
                                                        ref={field.ref}
                                                        className={cn(inputCls, "text-green-400 tabular-nums")}
                                                        placeholder="0,00"
                                                    />
                                                )}/>
                                                {errors.descontoBr &&
                                                    <p className={errorCls}>{errors.descontoBr.message}</p>}
                                            </div>
                                            <div className="min-w-0">
                                                <label htmlFor="lancamento-juros" className={labelCls}>Juros / Acréscimo (R$)</label>
                                                <Controller name="jurosBr" control={control} render={({field}) => (
                                                    <input
                                                        id="lancamento-juros"
                                                        type="text"
                                                        inputMode="numeric"
                                                        autoComplete="off"
                                                        value={field.value ?? ""}
                                                        onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                                                        onBlur={field.onBlur}
                                                        name={field.name}
                                                        ref={field.ref}
                                                        className={cn(inputCls, "text-red-400 tabular-nums")}
                                                        placeholder="0,00"
                                                    />
                                                )}/>
                                                {errors.jurosBr && <p className={errorCls}>{errors.jurosBr.message}</p>}
                                            </div>
                                            {/* No celular o Valor Atual sai do cabeçalho e aparece aqui. */}
                                            <p className="md:hidden col-span-2 text-[0.85em] text-muted-foreground">
                                                Valor atual: <span className="font-black text-primary tabular-nums">{valorAtualFmt}</span>
                                            </p>
                                        </div>
                                    )}

                                    <div>
                                        <label className={labelCls} htmlFor="lancamento-departamento">
                                            <Building2 aria-hidden="true" className="w-[1em] h-[1em] inline mr-[0.3em] align-[-0.1em]"/> Departamento
                                        </label>
                                        <SelectCampo
                                            id="lancamento-departamento"
                                            value={departamento_id ?? ""}
                                            permitirVazio
                                            placeholder="Selecione o departamento..."
                                            onChange={(value) => {
                                                setValue("departamento_id", value, {shouldDirty: true});
                                                setValue("centro_custo_id", "", {shouldDirty: true});
                                            }}
                                            opcoes={departamentos.map((d) => ({value: String(d.id), label: d.nome}))}
                                        />
                                        {errors.departamento_id &&
                                            <p className={errorCls}>{errors.departamento_id.message}</p>}
                                    </div>

                                    {/* Centro de Custo (filtrado por departamento) */}
                                    <div>
                                        <label htmlFor="lancamento-centro-custo" className={labelCls}>Centro de Custo</label>
                                        <SelectCampo
                                            id="lancamento-centro-custo"
                                            value={centro_custo_id ?? ""}
                                            permitirVazio
                                            disabled={centrosCustoFiltrado.length === 0}
                                            placeholder={centrosCustoFiltrado.length === 0
                                                ? departamento_id ? "Nenhum centro de custo neste departamento" : "Selecione um departamento primeiro..."
                                                : "Selecione o centro de custo..."}
                                            onChange={(value) => setValue("centro_custo_id", value, {shouldDirty: true})}
                                            opcoes={centrosCustoFiltrado.map((cc) => ({value: String(cc.id), label: cc.nome}))}
                                        />
                                        {errors.centro_custo_id &&
                                            <p className={errorCls}>{errors.centro_custo_id.message}</p>}
                                    </div>
                                </FormSection>

                                {/* ── Pagamento e risco ───────────────────────────────────── */}
                                <FormSection id="lancamento-sec-pagamento" title="Pagamento e risco"
                                             className="md:col-span-2 xl:col-span-1">
                                    {!isCP && (
                                        <p className="bg-white/[0.03] border border-white/10 rounded-[0.9em] p-[1em] text-[0.85em] text-muted-foreground">
                                            Contas a receber não têm nível de risco nem formas de pagamento.
                                        </p>
                                    )}

                                    {/* Riscos (apenas CP) */}
                                    {isCP && (
                                        <div
                                            className="bg-white/[0.03] border border-white/10 rounded-[0.9em] p-[1em] space-y-[0.9em]">
                                            <div className="flex items-center justify-between gap-[0.5em] flex-wrap">
                                                <label htmlFor="lancamento-nivel-risco" className={cn(labelCls, "mb-0")}>
                                                    Vulnerabilidade / Nível de Risco
                                                </label>
                                                <span
                                                    className="flex items-center gap-[0.3em] text-[0.75em] font-black text-primary uppercase">
                                                    <Target aria-hidden="true" className="w-[1em] h-[1em]"/> Sugestão Ativa
                                                </span>
                                            </div>
                                            <SelectCampo
                                                id="lancamento-nivel-risco"
                                                value={String(nivelRisco)}
                                                className={cn("font-black tracking-tight", selectedRisk?.color || "text-muted-foreground")}
                                                onChange={(value) => {
                                                    setNivelRisco(parseInt(value, 10));
                                                    setValue("riscos", [], {shouldDirty: true});
                                                }}
                                                opcoes={[
                                                    {value: "0", label: "Sem Risco Definido"},
                                                    ...Object.entries(riskLevels).map(([lv, data]) => ({
                                                        value: lv,
                                                        label: data.label,
                                                    })),
                                                ]}
                                            />

                                            {selectedRisk && (
                                                <div className="space-y-[0.9em] pt-[0.4em]">
                                                    <div
                                                        className="flex items-center justify-between gap-[0.5em] border-b border-white/5 pb-[0.5em]">
                                                        <p className="text-[0.75em] font-black text-muted-foreground uppercase tracking-[0.06em]">
                                                            Tags de Monitoramento
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowAddTag(!showAddTag)}
                                                            aria-expanded={showAddTag}
                                                            className={cn(
                                                                "text-[0.75em] font-bold flex items-center gap-[0.4em] px-[0.8em] py-[0.3em] rounded-full transition-colors border",
                                                                showAddTag ? "bg-primary/20 border-primary text-primary" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white",
                                                                focusRingCls,
                                                            )}>
                                                            <Plus aria-hidden="true"
                                                                  className={`w-[1em] h-[1em] transition-transform motion-reduce:transition-none ${showAddTag ? "rotate-45" : ""}`}/>
                                                            {showAddTag ? "Cancelar" : "Nova Tag"}
                                                        </button>
                                                    </div>
                                                    {showAddTag && (
                                                        <div
                                                            className="flex gap-[0.5em] p-[0.4em] bg-black/60 rounded-[0.8em] border border-primary/20 ring-1 ring-primary/10">
                                                            <input
                                                                type="text"
                                                                autoFocus
                                                                value={newTag.name}
                                                                onChange={(e) => setNewTag((f) => ({
                                                                    ...f,
                                                                    name: e.target.value.toUpperCase()
                                                                }))}
                                                                placeholder="NOME DA NOVA TAG..."
                                                                aria-label="Nome da nova tag"
                                                                className={cn("bg-transparent border-none text-[0.8em] font-bold text-white flex-1 min-w-0 px-[0.6em] rounded-[0.4em]", focusRingCls)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                                                                        e.preventDefault();
                                                                        handleCreateTag();
                                                                    }
                                                                }}
                                                            />
                                                            <button type="button" onClick={handleCreateTag}
                                                                    className={cn("text-[0.75em] font-black bg-primary/20 hover:bg-primary text-primary hover:text-white px-[1.2em] py-[0.5em] rounded-[0.6em] transition-colors", focusRingCls)}>
                                                                CRIAR
                                                            </button>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-wrap gap-[0.5em] max-h-[10em] overflow-y-auto pr-[0.4em]">
                                                        {selectedRisk.tags.map((tag) => {
                                                            const selected = riscos.includes(tag);
                                                            return (
                                                                <button
                                                                    key={tag}
                                                                    type="button"
                                                                    aria-pressed={selected}
                                                                    onClick={() => handleToggleTag(tag)}
                                                                    className={cn(
                                                                        "px-[1em] py-[0.55em] rounded-[0.7em] text-[0.75em] font-black border transition-colors flex items-center gap-[0.5em] group/tag",
                                                                        selected
                                                                            ? `${selectedRisk.color.replace("text-", "bg-")}/20 ${selectedRisk.color} border-current shadow-lg shadow-current/5`
                                                                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-white",
                                                                        focusRingCls,
                                                                    )}>
                                                                    {tag}
                                                                    {selected &&
                                                                        <X aria-hidden="true"
                                                                           className="w-[1em] h-[1em] opacity-60 group-hover/tag:opacity-100"/>}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Formas de Pagamento - sub-seções modulares por tipo */}
                                    {isCP && (
                                        <div
                                            className="bg-white/[0.03] border border-white/10 rounded-[0.9em] p-[1em] space-y-[0.8em]">
                                            {/* Cabeçalho com botões de adição por tipo */}
                                            <div className="flex items-center justify-between flex-wrap gap-[0.5em]">
                                                <div className="flex items-center gap-[0.5em]">
                                                    <CreditCard aria-hidden="true" className="w-[1em] h-[1em] text-primary"/>
                                                    <span className={cn(labelCls, "mb-0")}>Formas de Pagamento</span>
                                                </div>
                                                <div className="flex items-center gap-[0.9em]">
                                                    {(["PIX", "TED", "Boleto"] as const).map((t) => (
                                                        <button key={t} type="button"
                                                                onClick={() => appendPagamento({...pagamentoItemDefault, tipo: t})}
                                                                aria-label={`Adicionar ${t}`}
                                                                className={pmtAddBtnCls}>
                                                            <Plus aria-hidden="true" className="w-[1em] h-[1em]"/> {t}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {pagamentosFields.length === 0 ? (
                                                <p className="text-[0.85em] text-muted-foreground py-[0.3em]">
                                                    Nenhuma forma de pagamento. Use os botões acima para adicionar PIX, TED
                                                    ou Boleto.
                                                </p>
                                            ) : (
                                                <div className="space-y-[0.9em]">

                                                    {/* Sub-bloco PIX */}
                                                    {pixEntries.length > 0 && (
                                                        <div>
                                                            <div className="flex items-center justify-between mb-[0.5em]">
                                                                <span className="text-[0.8em] text-muted-foreground">Tipo de Chave PIX</span>
                                                                <button type="button"
                                                                        onClick={() => appendPagamento({
                                                                            ...pagamentoItemDefault,
                                                                            tipo: "PIX"
                                                                        })}
                                                                        className={pmtAddBtnCls}>
                                                                    <Plus aria-hidden="true" className="w-[1em] h-[1em]"/> Adicionar Chave
                                                                </button>
                                                            </div>
                                                            <div
                                                                className="bg-black/10 border border-white/10 rounded-[0.6em] overflow-x-auto">
                                                                <table className="w-full min-w-[22em] text-left">
                                                                    <thead className="bg-black/20">
                                                                    <tr>
                                                                        <th className={pmtThCls}>Tipo de Chave</th>
                                                                        <th className={pmtThCls}>Chave</th>
                                                                        <th className="w-[3em]"><span className="sr-only">Ações</span></th>
                                                                    </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                    {pixEntries.map(({f, i}) => (
                                                                        <PagamentoPIXRow
                                                                            key={f.id}
                                                                            index={i}
                                                                            control={control}
                                                                            setValue={setValue}
                                                                            removePagamento={removePagamento}
                                                                            errors={errors}
                                                                        />
                                                                    ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Sub-bloco TED */}
                                                    {tedEntries.length > 0 && (
                                                        <div>
                                                            <div className="flex items-center justify-between mb-[0.5em]">
                                                                <span className="text-[0.8em] text-muted-foreground">Contas TED</span>
                                                                <button type="button"
                                                                        onClick={() => appendPagamento({
                                                                            ...pagamentoItemDefault,
                                                                            tipo: "TED"
                                                                        })}
                                                                        className={pmtAddBtnCls}>
                                                                    <Plus aria-hidden="true" className="w-[1em] h-[1em]"/> Adicionar Conta TED
                                                                </button>
                                                            </div>
                                                            <div
                                                                className="bg-black/10 border border-white/10 rounded-[0.6em] overflow-x-auto">
                                                                <table className="w-full min-w-[30em] text-left">
                                                                    <thead className="bg-black/20">
                                                                    <tr>
                                                                        <th className={pmtThCls}>Cód.</th>
                                                                        <th className={pmtThCls}>Nome do Banco</th>
                                                                        <th className={pmtThCls}>Agência</th>
                                                                        <th className={pmtThCls}>Conta</th>
                                                                        <th className="w-[3em]"><span className="sr-only">Ações</span></th>
                                                                    </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                    {tedEntries.map(({f, i}) => {
                                                                        const itemErr = errors.pagamentos?.[i];
                                                                        return (
                                                                            <tr key={f.id} className="border-t border-white/5">
                                                                                <td className="px-[0.75em] py-[0.5em] align-top w-[5.5em]">
                                                                                    <Controller
                                                                                        name={`pagamentos.${i}.banco_codigo`}
                                                                                        control={control} render={({field}) => (
                                                                                        <input value={field.value ?? ""}
                                                                                               onChange={(e) => field.onChange(mascararCodigoBanco(e.target.value))}
                                                                                               onBlur={field.onBlur} ref={field.ref}
                                                                                               inputMode="numeric"
                                                                                               aria-label="Código do banco"
                                                                                               className={pmtCellInputCls}
                                                                                               placeholder="033"/>
                                                                                    )}/>
                                                                                    {itemErr?.banco_codigo &&
                                                                                        <p className={pmtErrCls}>{itemErr.banco_codigo.message}</p>}
                                                                                </td>
                                                                                <td className="px-[0.75em] py-[0.5em] align-top">
                                                                                    <input {...register(`pagamentos.${i}.banco_nome`)}
                                                                                           aria-label="Nome do banco"
                                                                                           className={pmtCellInputCls}
                                                                                           placeholder="Ex: Santander"/>
                                                                                    {itemErr?.banco_nome &&
                                                                                        <p className={pmtErrCls}>{itemErr.banco_nome.message}</p>}
                                                                                </td>
                                                                                <td className="px-[0.75em] py-[0.5em] align-top w-[7em]">
                                                                                    <Controller
                                                                                        name={`pagamentos.${i}.banco_agencia`}
                                                                                        control={control} render={({field}) => (
                                                                                        <input value={field.value ?? ""}
                                                                                               onChange={(e) => field.onChange(mascararAgencia(e.target.value))}
                                                                                               onBlur={field.onBlur} ref={field.ref}
                                                                                               inputMode="numeric"
                                                                                               aria-label="Agência"
                                                                                               className={pmtCellInputCls}
                                                                                               placeholder="0000-0"/>
                                                                                    )}/>
                                                                                    {itemErr?.banco_agencia &&
                                                                                        <p className={pmtErrCls}>{itemErr.banco_agencia.message}</p>}
                                                                                </td>
                                                                                <td className="px-[0.75em] py-[0.5em] align-top w-[7.5em]">
                                                                                    <Controller name={`pagamentos.${i}.banco_conta`}
                                                                                                control={control}
                                                                                                render={({field}) => (
                                                                                                    <input value={field.value ?? ""}
                                                                                                           onChange={(e) => field.onChange(mascararConta(e.target.value))}
                                                                                                           onBlur={field.onBlur}
                                                                                                           ref={field.ref}
                                                                                                           inputMode="numeric"
                                                                                                           aria-label="Conta"
                                                                                                           className={pmtCellInputCls}
                                                                                                           placeholder="00000-0"/>
                                                                                                )}/>
                                                                                    {itemErr?.banco_conta &&
                                                                                        <p className={pmtErrCls}>{itemErr.banco_conta.message}</p>}
                                                                                </td>
                                                                                <td className="px-[0.5em] py-[0.5em] align-top text-right w-[3em]">
                                                                                    <button type="button"
                                                                                            onClick={() => removePagamento(i)}
                                                                                            className={pmtRemoveBtnCls}
                                                                                            title="Remover conta TED"
                                                                                            aria-label="Remover conta TED">
                                                                                        <Trash2 aria-hidden="true" className="w-[1em] h-[1em]"/>
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Sub-bloco Boleto */}
                                                    {boletoEntries.length > 0 && (
                                                        <div>
                                                            <div className="flex items-center justify-between mb-[0.5em]">
                                                                <span className="text-[0.8em] text-muted-foreground">Boletos</span>
                                                                <button type="button"
                                                                        onClick={() => appendPagamento({
                                                                            ...pagamentoItemDefault,
                                                                            tipo: "Boleto"
                                                                        })}
                                                                        className={pmtAddBtnCls}>
                                                                    <Plus aria-hidden="true" className="w-[1em] h-[1em]"/> Adicionar Boleto
                                                                </button>
                                                            </div>
                                                            <div
                                                                className="bg-black/10 border border-white/10 rounded-[0.6em] overflow-x-auto">
                                                                <table className="w-full text-left">
                                                                    <thead className="bg-black/20">
                                                                    <tr>
                                                                        <th className={pmtThCls}>Código de Barras</th>
                                                                        <th className="w-[3em]"><span className="sr-only">Ações</span></th>
                                                                    </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                    {boletoEntries.map(({f, i}) => {
                                                                        const itemErr = errors.pagamentos?.[i];
                                                                        return (
                                                                            <tr key={f.id} className="border-t border-white/5">
                                                                                <td className="px-[0.75em] py-[0.5em] align-top">
                                                                                    <input {...register(`pagamentos.${i}.boleto_codigo_barras`)}
                                                                                           aria-label="Código de barras do boleto"
                                                                                           className={pmtCellInputCls}
                                                                                           placeholder="00000000000000000000000000000000000000000000"/>
                                                                                    {itemErr?.boleto_codigo_barras &&
                                                                                        <p className={pmtErrCls}>{itemErr.boleto_codigo_barras.message}</p>}
                                                                                </td>
                                                                                <td className="px-[0.5em] py-[0.5em] align-top text-right w-[3em]">
                                                                                    <button type="button"
                                                                                            onClick={() => removePagamento(i)}
                                                                                            className={pmtRemoveBtnCls}
                                                                                            title="Remover boleto"
                                                                                            aria-label="Remover boleto">
                                                                                        <Trash2 aria-hidden="true" className="w-[1em] h-[1em]"/>
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                </div>
                                            )}
                                        </div>
                                    )}
                                </FormSection>

                                {/* ── Observação (largura total) ─────────────────────────── */}
                                <div className="col-span-full">
                                    <label htmlFor="lancamento-observacao" className={labelCls}>Observação</label>
                                    <textarea
                                        id="lancamento-observacao"
                                        rows={3}
                                        maxLength={1000}
                                        {...register("observacao")}
                                        className={cn(inputCls, "h-auto md:h-auto min-h-[4.6em] py-[0.7em] resize-y")}
                                        placeholder="Informações adicionais (opcional): condições, referência do pedido, contato..."
                                        aria-invalid={!!errors.observacao}
                                        aria-describedby={errors.observacao ? "observacao-erro observacao-contador" : "observacao-contador"}
                                    />
                                    <p id="observacao-contador"
                                       className="text-[0.75em] text-muted-foreground mt-[0.3em] text-right"
                                       aria-hidden="true">
                                        {observacao.length}/1000
                                    </p>
                                    <p className="sr-only" aria-live="polite">
                                        {observacao.length >= 900 ? `${observacao.length} de 1000 caracteres` : ""}
                                    </p>
                                    {errors.observacao && (
                                        <p id="observacao-erro" className={errorCls}>{errors.observacao.message}</p>
                                    )}
                                </div>
                            </div>
                        </ModalBody>

                        {/* Rodapé (fixo): no celular, os botões dividem a largura */}
                        <ModalFooter hint={<>* Campos obrigatórios · Esc fecha · {IS_MAC ? "⌘" : "Ctrl"}+Enter conclui</>}>
                            <button type="button" onClick={handleRequestClose} className={modalBtnSecondaryCls}>
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={mutation.isPending}
                                aria-keyshortcuts="Control+Enter Meta+Enter"
                                className={modalBtnPrimaryCls}>
                                {mutation.isPending ? <ModalSpinner/> : editItem ? "Salvar Alterações" : "Concluir Lançamento"}
                            </button>
                        </ModalFooter>
                    </ModalForm>

                {/* Confirmação de cancelamento - só aparece se o formulário tiver alterações não salvas */}
                <ConfirmDialog
                    open={showCancelConfirm}
                    tone="warning"
                    title="Cancelar cadastro?"
                    description="As informações preenchidas serão perdidas. Deseja realmente cancelar?"
                    confirmLabel="Sim, cancelar"
                    cancelLabel="Não, continuar"
                    onCancel={() => setShowCancelConfirm(false)}
                    onConfirm={() => {
                        setShowCancelConfirm(false);
                        onClose();
                    }}
                />

                {/* Cadastro de parceiro: Modal aninhado (foco, Tab e Esc ficam nele). */}
                {parceiroSubModal && (
                    <NovoParceiroModal
                        key={parceiroSubModal.mode === "edit" ? parceiroSubModal.data.id : "new-parceiro"}
                        initialData={parceiroSubModal.mode === "edit" ? parceiroSubModal.data : null}
                        returnFocusTo={() => bodyRef.current?.querySelector<HTMLElement>("[aria-labelledby=lancamento-parceiro-label] button")}
                        onClose={() => setParceiroSubModal(null)}
                        onSaved={() => {
                            void queryClient.invalidateQueries({queryKey: tenantQueryKey("parceiros-modal")});
                        }}
                    />
                )}
        </Modal>
    );
}
