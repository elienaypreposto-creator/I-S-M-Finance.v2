import {useEffect, useState} from "react";
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
import {Calendar as CalendarPicker} from "@/components/ui/calendar";
import {format as formatBtn, parseISO} from "date-fns";
import {ptBR} from "date-fns/locale";
import {cn} from "@/lib/utils";
import {fetchApiData} from "@/lib/api-config";
import {maskChavePix, pixKeyMaxLength, pixKeyPlaceholder} from "@/lib/pix-masks";
import {
    formatValorBrInput,
    getLancamentoModalDefaultValues,
    lancamentoModalFormSchema,
    mapModalFormToApiBody,
    pagamentoItemDefault,
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
    Search,
    Building2,
    CreditCard,
    Trash2,
    Edit2,
} from "lucide-react";
import {NovoParceiroModal, type ParceiroRow} from "@/pages/cadastros/parceiros";

type PlanoConta = { id: number; tipo: string; categoria: string; subcategoria: string | null };
type Departamento = { id: number; nome: string };
type CentroCusto = { id: number; nome: string; departamento_id: number | null };

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
                <button type="button"
                        className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white flex items-center justify-between hover:border-white/20 transition-all">
                    {value || "Selecione..."}
                    <CalendarDays className="w-4 h-4 text-muted-foreground"/>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start"
                            className="bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl p-4 w-72">
                <div className="flex items-center justify-between mb-4 px-1">
                    <button type="button" onClick={() => setCurrentYear((y) => y - 1)}
                            className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
                        <ChevronLeft className="w-5 h-5"/>
                    </button>
                    <span className="text-sm font-bold text-white tracking-widest">{currentYear}</span>
                    <button type="button" onClick={() => setCurrentYear((y) => y + 1)}
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

function ParceiroCombobox({
                              value,
                              onChange,
                              parceiros,
                              search,
                              onSearchChange,
                              onEdit,
                              onCreateNew,
                              isLoading = false,
                          }: {
    value: string;
    onChange: (v: string) => void;
    parceiros: ParceiroRow[];
    search: string;
    onSearchChange: (s: string) => void;
    onEdit: (p: ParceiroRow) => void;
    onCreateNew: () => void;
    isLoading?: boolean;
}) {
    const [open, setOpen] = useState(false);

    const handleOpenChange = (o: boolean) => {
        setOpen(o);
        if (!o) onSearchChange("");
    };

    const selected = parceiros.find((p) => String(p.id) === value);

    const badgeCls = (tipoPessoa: string) =>
        `text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
            tipoPessoa === "PJ" ? "bg-primary/20 text-primary" : "bg-teal-500/20 text-teal-400"
        }`;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between hover:border-white/20 transition-all"
                >
                    {selected ? (
                        <span className="text-white flex items-center gap-2 min-w-0">
                            <span className={badgeCls(selected.tipo_pessoa)}>{selected.tipo_pessoa}</span>
                            <span className="truncate">{selected.nome}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground/40">Selecione o cliente/fornecedor...</span>
                    )}
                    <Search className="w-4 h-4 text-muted-foreground shrink-0 ml-2"/>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={4}
                className="p-0 bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl"
                style={{width: "var(--radix-popover-trigger-width)"}}
            >
                {/* Barra de busca */}
                <div className="p-3 border-b border-white/5">
                    <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                        <Search className="w-4 h-4 text-muted-foreground shrink-0"/>
                        <input
                            autoFocus
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Buscar por nome..."
                            className="bg-transparent text-sm text-white outline-none w-full placeholder:text-muted-foreground/40"
                        />
                    </div>
                </div>

                {/* Lista de resultados */}
                <div className="max-h-56 overflow-y-auto">
                    {isLoading ? (
                        <p className="px-4 py-3 text-xs text-muted-foreground text-center animate-pulse">Buscando...</p>
                    ) : parceiros.length === 0 ? (
                        <>
                            <p className="px-4 py-3 text-xs text-muted-foreground text-center">
                                {search ? `Nenhum resultado para "${search}"` : "Nenhum parceiro encontrado"}
                            </p>
                            {/* "Nenhum" aparece só no empty-state para permitir desselecionar */}
                            <button
                                type="button"
                                onClick={() => {
                                    onChange("");
                                    setOpen(false);
                                }}
                                className="w-full text-left px-4 py-2.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors italic"
                            >
                                Nenhum (sem parceiro)
                            </button>
                        </>
                    ) : (
                        parceiros.map((p) => (
                            /* Linha com botão de edição inline */
                            <div
                                key={p.id}
                                className={`flex items-center justify-between px-4 py-2.5 transition-colors cursor-pointer hover:bg-white/5 ${
                                    String(p.id) === value ? "bg-primary/10" : ""
                                }`}
                                onClick={() => {
                                    onChange(String(p.id));
                                    setOpen(false);
                                }}
                            >
                                <span
                                    className={`text-sm flex items-center gap-2 min-w-0 ${String(p.id) === value ? "text-primary" : "text-white"}`}>
                                    <span className={badgeCls(p.tipo_pessoa)}>{p.tipo_pessoa}</span>
                                    <span className="truncate">{p.nome}</span>
                                </span>
                                <button
                                    type="button"
                                    title="Editar parceiro"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onEdit(p);
                                        setOpen(false);
                                    }}
                                    className="ml-2 p-1 shrink-0 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                                >
                                    <Edit2 className="w-3.5 h-3.5"/>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Botão de quick create */}
                <div className="p-2 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => {
                            onCreateNew();
                            setOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-primary/10 rounded-lg font-semibold transition-all"
                    >
                        <Plus className="w-3.5 h-3.5"/>
                        Cadastrar Novo Cliente/Fornecedor
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// Sub-componente isolado para campos PIX

type PagamentoPixSectionProps = {
    index: number;
    control: Control<LancamentoModalFormValues>;
    setValue: UseFormSetValue<LancamentoModalFormValues>;
    errors: FieldErrors<LancamentoModalFormValues>;
};

function PagamentoPixSection({index, control, setValue, errors}: PagamentoPixSectionProps) {
    const tipoChave = useWatch({control, name: `pagamentos.${index}.tipo_chave_pix`}) ?? "";
    const itemErr = errors.pagamentos?.[index];

    const innerLbl = "text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block";
    const innerInp = "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
    const innerSel = "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer [&>option]:bg-[#141720]";
    const errCls = "text-[10px] text-destructive mt-1 font-medium";

    return (
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className={innerLbl}>Tipo de Chave *</label>
                <Controller
                    name={`pagamentos.${index}.tipo_chave_pix`}
                    control={control}
                    render={({field}) => (
                        <select
                            value={field.value ?? ""}
                            onChange={(e) => {
                                field.onChange(e.target.value);
                                setValue(`pagamentos.${index}.chave_pix`, "", {shouldDirty: true});
                            }}
                            onBlur={field.onBlur}
                            className={innerSel}
                        >
                            <option value="">Selecione...</option>
                            <option value="cpf">CPF</option>
                            <option value="cnpj">CNPJ</option>
                            <option value="email">E-mail</option>
                            <option value="telefone">Telefone</option>
                            <option value="aleatoria">Chave Aleatória</option>
                        </select>
                    )}
                />
                {itemErr?.tipo_chave_pix && <p className={errCls}>{itemErr.tipo_chave_pix.message}</p>}
            </div>
            <div>
                <label className={innerLbl}>Chave PIX *</label>
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
                            className={innerInp}
                        />
                    )}
                />
                {itemErr?.chave_pix && <p className={errCls}>{itemErr.chave_pix.message}</p>}
            </div>
        </div>
    );
}

type LancamentoModalProps = {
    onClose: () => void;
    onSaved: () => void;
    editItem?: LancamentoEditItem | null;
};

export function LancamentoModal({onClose, onSaved, editItem}: LancamentoModalProps) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [riskLevels, setRiskLevels] = useState(BASE_RISK_LEVELS);
    const [showAddTag, setShowAddTag] = useState(false);
    const [newTag, setNewTag] = useState({name: "", level: 1});
    const [nivelRisco, setNivelRisco] = useState(0);
    const [searchParceiro, setSearchParceiro] = useState("");

    type ParceiroSubModal = { mode: "create" } | { mode: "edit"; data: ParceiroRow };
    const [parceiroSubModal, setParceiroSubModal] = useState<ParceiroSubModal | null>(null);

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
        formState: {errors},
    } = form;

    const vencimento = watch("vencimento");
    const tipo = watch("tipo");
    const status = watch("status");
    const riscos = watch("riscos");
    const departamento_id = watch("departamento_id");
    const isCP = tipo === "CP";

    const {fields: pagamentosFields, append: appendPagamento, remove: removePagamento} = useFieldArray({
        control,
        name: "pagamentos",
    });

    // Limpa campos irrelevantes ao trocar o tipo de um item
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

    // Reset ao abrir / mudar item

    useEffect(() => {
        reset(getLancamentoModalDefaultValues(editItem));
        setNivelRisco(0);
        setRiskLevels(BASE_RISK_LEVELS);
        setShowAddTag(false);
    }, [editItem, reset]);

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
        queryKey: ["parceiros-modal", searchParceiro],
        queryFn: () => {
            const qs = new URLSearchParams({page: "1", limit: "20"});
            if (searchParceiro.trim()) qs.set("search", searchParceiro.trim());
            return fetchApiData<ParceiroRow[]>(`/parceiros?${qs.toString()}`);
        },
    });

    const {data: planoContas = []} = useQuery<PlanoConta[]>({
        queryKey: ["plano-contas-modal"],
        queryFn: () => fetchApiData<PlanoConta[]>("/plano-contas"),
    });

    const {data: departamentos = []} = useQuery<Departamento[]>({
        queryKey: ["departamentos-modal"],
        queryFn: () => fetchApiData<Departamento[]>("/departamentos"),
    });

    const {data: centrosCusto = []} = useQuery<CentroCusto[]>({
        queryKey: ["centros-custo-modal"],
        queryFn: () => fetchApiData<CentroCusto[]>("/centros-custos"),
        retry: false,
    });

    // Filtra centros de custo pelo departamento selecionado
    const centrosCustoFiltrado = departamento_id
        ? centrosCusto.filter((cc) => cc.departamento_id === Number(departamento_id))
        : centrosCusto;

    const mutation = useMutation({
        mutationFn: (body: LancamentoApiBody) => {
            if (editItem) return fetchApiData(`/lancamentos/${editItem.id}`, {
                method: "PUT",
                body: JSON.stringify(body)
            });
            return fetchApiData(`/lancamentos`, {method: "POST", body: JSON.stringify(body)});
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["lancamentos"]});
            toast({title: "Sucesso", description: editItem ? "Lançamento atualizado." : "Lançamento criado."});
            onSaved();
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

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
    const innerInputCls =
        "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
    const innerLabelCls = "text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block";
    const selectCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer [&>option]:bg-[#1a1c23]";
    const innerSelectCls =
        "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer [&>option]:bg-[#141720]";
    const errorCls = "text-[10px] text-destructive mt-1 font-medium";

    const selectedRisk = riskLevels[nivelRisco];

    return (
        <>
            {/* Sub-modal de parceiro - z-[60] sobrepõe o modal de lançamentos */}
            {parceiroSubModal && (
                <NovoParceiroModal
                    key={parceiroSubModal.mode === "edit" ? parceiroSubModal.data.id : "new-parceiro"}
                    initialData={parceiroSubModal.mode === "edit" ? parceiroSubModal.data : null}
                    onClose={() => setParceiroSubModal(null)}
                    onSaved={() => {
                        void queryClient.invalidateQueries({queryKey: ["parceiros-modal"]});
                    }}
                />
            )}

            <div
                className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-md p-4 pt-16 overflow-hidden">
                <div
                    className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">

                    {/* Header */}
                    <div
                        className="flex items-center justify-between p-6 border-b border-white/5 bg-[#121417] rounded-t-2xl">
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tighter">
                                {editItem ? "Editar Lançamento" : "Novo Lançamento"}
                            </h2>
                            <p className="text-xs text-muted-foreground">Preencha os dados financeiros detalhados</p>
                        </div>
                        <button type="button" onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-xl text-muted-foreground hover:text-white transition-all group">
                            <X className="w-5 h-5 group-hover:rotate-90 transition-transform"/>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 overflow-y-auto">

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                            <div className="space-y-5">

                                {/* Tipo */}
                                <div>
                                    <label className={labelCls}>Tipo de Registro *</label>
                                    <div className="flex gap-3">
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
                                                onClick={() => {
                                                    setValue("tipo", v, {shouldValidate: true, shouldDirty: true});
                                                    // Limpeza síncrona: CR não tem formas de pagamento
                                                    if (v === "CR") setValue("pagamentos", []);
                                                }}
                                                className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                                                    tipo === v ? `${color} shadow-lg` : "border-white/5 bg-white/5 text-muted-foreground hover:border-white/10"
                                                }`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {errors.tipo && <p className={errorCls}>{errors.tipo.message}</p>}
                                </div>

                                {/* Vencimento + Competência */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Data de Vencimento *</label>
                                        <Controller name="vencimento" control={control} render={({field}) => (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <button type="button"
                                                            className={cn(inputCls, "flex items-center justify-between text-left", !field.value && "text-muted-foreground/30")}>
                                                        {field.value ? formatBtn(parseISO(field.value), "dd/MM/yyyy") : "Selecione uma data..."}
                                                        <Calendar className="w-4 h-4 text-muted-foreground"/>
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
                                    <div>
                                        <label className={labelCls}>Mês de Competência</label>
                                        <Controller name="competencia" control={control} render={({field}) => (
                                            <CompetenciaPicker value={field.value || ""} onChange={field.onChange}/>
                                        )}/>
                                    </div>
                                </div>

                                {/* Cliente/Fornecedor - Combobox com busca */}
                                <div>
                                    <label className={labelCls}>Cliente / Fornecedor</label>
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
                                        />
                                    )}/>
                                    {errors.parceiro_id && <p className={errorCls}>{errors.parceiro_id.message}</p>}
                                </div>

                                {/* Descrição */}
                                <div>
                                    <label className={labelCls}>Título / Descrição</label>
                                    <input type="text" {...register("descricao")} className={inputCls}
                                           placeholder="Ex: Manutenção servidor AWS, Aluguel Setembro..."/>
                                </div>

                                {/* Departamento */}
                                <div>
                                    <label className={labelCls}>
                                        <Building2 className="w-3 h-3 inline mr-1"/> Departamento
                                    </label>
                                    <select {...register("departamento_id")} className={selectCls}
                                            onChange={(e) => {
                                                setValue("departamento_id", e.target.value, {shouldDirty: true});
                                                setValue("centro_custo_id", "", {shouldDirty: true});
                                            }}>
                                        <option value="">Selecione o departamento...</option>
                                        {departamentos.map((d) => (
                                            <option key={d.id} value={d.id}>{d.nome}</option>
                                        ))}
                                    </select>
                                    {errors.departamento_id &&
                                        <p className={errorCls}>{errors.departamento_id.message}</p>}
                                </div>
                            </div>

                            {/* ── Coluna direita ──────────────────────────────────────────── */}
                            <div className="space-y-5">

                                {/* Classificação (Plano de Contas) */}
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
                                    {errors.plano_conta_id &&
                                        <p className={errorCls}>{errors.plano_conta_id.message}</p>}
                                </div>

                                {/* Valor + Status */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Valor Previsto (R$)</label>
                                        <Controller name="valorBr" control={control} render={({field}) => (
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
                                        )}/>
                                        {errors.valorBr && <p className={errorCls}>{errors.valorBr.message}</p>}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Status Atual</label>
                                        <select {...register("status")} className={selectCls}>
                                            <option value="pendente">Pendente</option>
                                            {tipo === "CR"
                                                ? <option value="recebido">Recebido (Liquidado)</option>
                                                : <option value="pago">Pago (Liquidado)</option>
                                            }
                                            <option value="atrasado">Atrasado</option>
                                            <option value="cancelado">Cancelado</option>
                                        </select>
                                        {errors.status && <p className={errorCls}>{errors.status.message}</p>}
                                    </div>
                                </div>

                                {/* Centro de Custo (filtrado por departamento) */}
                                <div>
                                    <label className={labelCls}>Centro de Custo</label>
                                    <select {...register("centro_custo_id")} className={selectCls}
                                            disabled={centrosCustoFiltrado.length === 0}>
                                        <option value="">
                                            {centrosCustoFiltrado.length === 0
                                                ? departamento_id ? "Nenhum centro de custo neste departamento" : "Selecione um departamento primeiro..."
                                                : "Selecione o centro de custo..."}
                                        </option>
                                        {centrosCustoFiltrado.map((cc) => (
                                            <option key={cc.id} value={cc.id}>{cc.nome}</option>
                                        ))}
                                    </select>
                                    {errors.centro_custo_id &&
                                        <p className={errorCls}>{errors.centro_custo_id.message}</p>}
                                </div>

                                {/* Riscos (apenas CP) */}
                                {isCP && (
                                    <div
                                        className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4 shadow-inner">
                                        <div className="flex items-center justify-between">
                                            <label className={labelCls}>Vulnerabilidade / Nível de Risco</label>
                                            <div
                                                className="flex items-center gap-1 text-[9px] font-black text-primary uppercase">
                                                <Target className="w-3 h-3"/> Sugestão Ativa
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <select
                                                value={nivelRisco}
                                                onChange={(e) => {
                                                    setNivelRisco(parseInt(e.target.value, 10));
                                                    setValue("riscos", [], {shouldDirty: true});
                                                }}
                                                className={`${selectCls} border-white/5 bg-black/40 font-black tracking-tight ${selectedRisk?.color || "text-white/40"} hover:border-white/20`}>
                                                <option value={0}>Sem Risco Definido</option>
                                                {Object.entries(riskLevels).map(([lv, data]) => (
                                                    <option key={lv} value={lv}
                                                            className="bg-[#1a1c23] py-2">{data.label}</option>
                                                ))}
                                            </select>
                                            <div
                                                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground group-hover:text-white transition-colors">
                                                <ChevronRight className="w-4 h-4 rotate-90"/>
                                            </div>
                                        </div>

                                        {selectedRisk && (
                                            <div className="space-y-4 animate-in pt-2">
                                                <div
                                                    className="flex items-center justify-between border-b border-white/5 pb-2">
                                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40">Tags
                                                        de Monitoramento</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAddTag(!showAddTag)}
                                                        className={`text-[9px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all border ${
                                                            showAddTag ? "bg-primary/20 border-primary text-primary" : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                                        }`}>
                                                        <Plus
                                                            className={`w-2.5 h-2.5 transition-transform ${showAddTag ? "rotate-45" : ""}`}/>
                                                        {showAddTag ? "Cancelar" : "Nova Tag"}
                                                    </button>
                                                </div>
                                                {showAddTag && (
                                                    <div
                                                        className="flex gap-2 p-1.5 bg-black/60 rounded-xl border border-primary/20 animate-in ring-1 ring-primary/10">
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            value={newTag.name}
                                                            onChange={(e) => setNewTag((f) => ({
                                                                ...f,
                                                                name: e.target.value.toUpperCase()
                                                            }))}
                                                            placeholder="NOME DA NOVA TAG..."
                                                            className="bg-transparent border-none outline-none text-[10px] font-bold text-white flex-1 px-2"
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    e.preventDefault();
                                                                    handleCreateTag();
                                                                }
                                                            }}
                                                        />
                                                        <button type="button" onClick={handleCreateTag}
                                                                className="text-[10px] font-black bg-primary/20 hover:bg-primary text-primary hover:text-white px-4 py-1.5 rounded-lg transition-all">
                                                            CRIAR
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2">
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
                                                                {selected &&
                                                                    <X className="w-2.5 h-2.5 opacity-50 group-hover/tag:opacity-100"/>}
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

                        {/* Formas de Pagamento - split (apenas CP) */}
                        {isCP && (
                            <div className="border border-white/10 rounded-2xl p-5 space-y-4 bg-white/[0.02]">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-primary"/>
                                        <label className={`${labelCls} mb-0`}>Formas de Pagamento</label>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => appendPagamento({...pagamentoItemDefault})}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-bold transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5"/> Adicionar
                                    </button>
                                </div>

                                {pagamentosFields.length === 0 && (
                                    <p className="text-xs text-muted-foreground/50 text-center py-3">
                                        Nenhuma forma de pagamento. Clique em "Adicionar" para informar como este
                                        lançamento
                                        será pago.
                                    </p>
                                )}

                                {pagamentosFields.map((field, index) => {
                                    const itemTipo = watch(`pagamentos.${index}.tipo`);
                                    const itemErr = errors.pagamentos?.[index];
                                    return (
                                        <div key={field.id}
                                             className="bg-black/20 rounded-xl p-4 space-y-3 border border-white/5">
                                            {/* Cabeçalho do item */}
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                                                    Pagamento {index + 1}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => removePagamento(index)}
                                                    className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5"/>
                                                </button>
                                            </div>

                                            {/* Tipo + Valor */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className={innerLabelCls}>Tipo *</label>
                                                    <select
                                                        value={itemTipo}
                                                        onChange={(e) =>
                                                            handlePagamentoTipoChange(
                                                                index,
                                                                e.target.value as PagamentoItemFormValues["tipo"],
                                                            )
                                                        }
                                                        className={innerSelectCls}
                                                    >
                                                        <option value="PIX">PIX</option>
                                                        <option value="TED">TED</option>
                                                        <option value="Boleto">Boleto</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={innerLabelCls}>Valor (R$) *</label>
                                                    <Controller
                                                        name={`pagamentos.${index}.valorBr`}
                                                        control={control}
                                                        render={({field: f}) => (
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                autoComplete="off"
                                                                value={f.value}
                                                                onChange={(e) => f.onChange(formatValorBrInput(e.target.value))}
                                                                onBlur={f.onBlur}
                                                                ref={f.ref}
                                                                className={`${innerInputCls} font-bold text-primary`}
                                                                placeholder="0,00"
                                                            />
                                                        )}
                                                    />
                                                    {itemErr?.valorBr &&
                                                        <p className={errorCls}>{itemErr.valorBr.message}</p>}
                                                </div>
                                            </div>

                                            {/* Campos PIX - subcomponente isolado com useWatch por item */}
                                            {itemTipo === "PIX" && (
                                                <PagamentoPixSection
                                                    index={index}
                                                    control={control}
                                                    setValue={setValue}
                                                    errors={errors}
                                                />
                                            )}

                                            {/* Campos TED */}
                                            {itemTipo === "TED" && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className={innerLabelCls}>Código do Banco *</label>
                                                        <input {...register(`pagamentos.${index}.banco_codigo`)}
                                                               className={innerInputCls} placeholder="033"/>
                                                        {itemErr?.banco_codigo &&
                                                            <p className={errorCls}>{itemErr.banco_codigo.message}</p>}
                                                    </div>
                                                    <div>
                                                        <label className={innerLabelCls}>Nome do Banco *</label>
                                                        <input {...register(`pagamentos.${index}.banco_nome`)}
                                                               className={innerInputCls} placeholder="Ex: Santander"/>
                                                        {itemErr?.banco_nome &&
                                                            <p className={errorCls}>{itemErr.banco_nome.message}</p>}
                                                    </div>
                                                    <div>
                                                        <label className={innerLabelCls}>Agência *</label>
                                                        <input {...register(`pagamentos.${index}.banco_agencia`)}
                                                               className={innerInputCls} placeholder="0000"/>
                                                        {itemErr?.banco_agencia &&
                                                            <p className={errorCls}>{itemErr.banco_agencia.message}</p>}
                                                    </div>
                                                    <div>
                                                        <label className={innerLabelCls}>Conta *</label>
                                                        <input {...register(`pagamentos.${index}.banco_conta`)}
                                                               className={innerInputCls} placeholder="00000-0"/>
                                                        {itemErr?.banco_conta &&
                                                            <p className={errorCls}>{itemErr.banco_conta.message}</p>}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Campos Boleto */}
                                            {itemTipo === "Boleto" && (
                                                <div>
                                                    <label className={innerLabelCls}>Código de Barras *</label>
                                                    <input
                                                        {...register(`pagamentos.${index}.boleto_codigo_barras`)}
                                                        className={innerInputCls}
                                                        placeholder="00000000000000000000000000000000000000000000"
                                                    />
                                                    {itemErr?.boleto_codigo_barras &&
                                                        <p className={errorCls}>{itemErr.boleto_codigo_barras.message}</p>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Largura natural, alinhados à direita */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                            <button type="button" onClick={onClose}
                                    className="px-6 py-2.5 rounded-xl border border-white/10 text-white hover:bg-white/5 text-sm font-bold transition-all">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={mutation.isPending}
                                className="px-8 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-black shadow-xl shadow-primary/25 transition-all disabled:opacity-50 flex items-center gap-2">
                                {mutation.isPending ? <Loader2
                                    className="w-5 h-5 animate-spin"/> : editItem ? "Salvar Alterações" : "Concluir Lançamento"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
