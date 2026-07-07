import {useEffect, useMemo, useState} from "react";
import {useForm, Controller} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {PageHeader} from "@/components/shared/page-header";
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
    CreditCard,
    Repeat2,
    TrendingUp,
} from "lucide-react";
import {formatCurrency, cn} from "@/lib/utils";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {
    contaBancariaFormSchema,
    type ContaBancariaFormValues,
} from "@/validations/cadastros.schema";
import {apiValorToValorBr, brMoneyDisplayToApiString, formatValorBrInput} from "@/validations/lancamentos.schema";
import {CardsSkeleton} from "@/components/shared/table-skeleton";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    EmptyContent,
} from "@/components/ui/empty";

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

// Máscaras
function maskAgencia(value: string): string {
    return value.replace(/\D/g, "").slice(0, 4);
}

function maskConta(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 1) return digits;
    return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

const TIPO_CONFIG = [
    {
        value: "Conta Corrente",
        label: "Conta Corrente",
        icon: CreditCard,
        desc: "Movimentação diária e pagamentos",
    },
    {
        value: "Conta Movimento",
        label: "Conta Movimento (Caixinha)",
        icon: Repeat2,
        desc: "Conta interna para transferências",
    },
    {
        value: "Conta Poupança",
        label: "Conta Poupança",
        icon: TrendingUp,
        desc: "Reserva financeira com rendimento",
    },
] as const;

function Req() {
    return <span className="text-destructive ml-0.5">*</span>;
}

const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors";

const monoInputCls = `${inputCls} font-mono`;

interface ModalProps {
    onClose: () => void;
    initialData?: ContaBancaria | null;
}

function NovaContaModal({onClose, initialData}: ModalProps) {
    const queryClient = useQueryClient();
    const {toast} = useToast();

    const [step, setStep] = useState(initialData ? 2 : 1);

    const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

    const defaultValues = useMemo<ContaBancariaFormValues>(
        () => ({
            tipo: initialData?.tipo ?? "",
            nome: initialData?.nome ?? "",
            banco: initialData?.banco ?? "",
            agencia: initialData?.agencia ?? "",
            conta: initialData?.conta ?? "",
            saldo_inicial_br: initialData ? apiValorToValorBr(initialData.saldo_inicial) : "",
            data_inicio: initialData?.data_inicio ?? todayIso,
            cor: initialData?.cor?.match(/^#[0-9A-Fa-f]{6}$/i) ? initialData.cor : "#3BA8DC",
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [initialData],
    );

    const {
        register,
        control,
        handleSubmit,
        trigger,
        reset,
        watch,
        setValue,
        getValues,
        formState: {errors},
    } = useForm<ContaBancariaFormValues>({
        resolver: zodResolver(contaBancariaFormSchema),
        defaultValues,
    });

    useEffect(() => {
        reset(defaultValues);
        setStep(initialData ? 2 : 1);
    }, [defaultValues, reset, initialData]);

    const tipo = watch("tipo");
    const cor = watch("cor");

    // Ghost Data Prevention
    const handleSelectTipo = (newTipo: string) => {
        const prevTipo = getValues("tipo");
        if (prevTipo !== newTipo) {
            const precisavaBanco =
                prevTipo === "Conta Corrente" || prevTipo === "Conta Poupança";
            const precisaBanco =
                newTipo === "Conta Corrente" || newTipo === "Conta Poupança";

            if (precisavaBanco && !precisaBanco) {
                // Mudou para Conta Movimento: limpa dados bancários
                setValue("banco", "");
                setValue("agencia", "");
                setValue("conta", "");
            }
        }
        setValue("tipo", newTipo, {shouldValidate: true});
    };

    // Mutation
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
                data_inicio: values.data_inicio,
                cor: values.cor,
                ...(isEdit && initialData ? {status: initialData.status} : {}),
            };
            const path = isEdit ? `/contas-bancarias/${initialData.id}` : "/contas-bancarias";
            return fetchApiData<ContaBancaria>(path, {
                method: isEdit ? "PUT" : "POST",
                body: JSON.stringify(body),
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["contas-bancarias"]});
            toast({
                title: initialData ? "Conta atualizada" : "Conta cadastrada",
                description: "As informações foram salvas com sucesso.",
            });
            onClose();
        },
        onError: (e: unknown) => {
            toast({
                title: "Erro ao salvar",
                description: e instanceof Error ? e.message : String(e),
                variant: "destructive",
            });
        },
    });

    // Trava de navegação
    const toastObrigatorio = () =>
        toast({
            variant: "destructive",
            title: "Campos obrigatórios",
            description: "Há campos obrigatórios não preenchidos, volte e conclua!",
        });

    const goNext = async () => {
        let ok = false;
        if (step === 1) {
            ok = await trigger(["tipo"]);
        } else if (step === 2) {
            const campos: (keyof ContaBancariaFormValues)[] = ["nome"];
            if (tipo === "Conta Corrente" || tipo === "Conta Poupança")
                campos.push("banco", "agencia", "conta");
            ok = await trigger(campos);
        }
        if (!ok) {
            toastObrigatorio();
            return;
        }
        setStep((s) => s + 1);
    };

    const onSubmitFinal = handleSubmit(
        (values) => mutation.mutate(values),
        () => toastObrigatorio(),
    );

    const headerTitle =
        step === 3 ? "Dados Iniciais da Conta" : "Cadastrar conta bancária";
    const headerSub =
        step === 3
            ? "Informe uma data de início e o saldo do dia anterior"
            : `Passo ${step} de 3`;

    // Render
    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start pt-24 overflow-y-auto justify-center px-4 pb-8">
            <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div>
                        <h2 className="text-lg font-bold text-white">{headerTitle}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">{headerSub}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                {/* Barra de progresso - 3 segmentos */}
                <div className="flex gap-1 px-6 pt-4">
                    {[1, 2, 3].map((s) => (
                        <div
                            key={s}
                            className={cn(
                                "flex-1 h-1 rounded-full transition-all duration-300",
                                s <= step ? "bg-primary" : "bg-white/10",
                            )}
                        />
                    ))}
                </div>

                <form noValidate className="flex flex-col" onSubmit={(e) => e.preventDefault()}>
                    <div className="p-6 space-y-4">

                        {/* Passo 1: Escolha o tipo de conta */}
                        {step === 1 && (
                            <div className="space-y-3">
                                <p className="text-sm font-semibold text-white">
                                    Escolha o tipo de conta
                                </p>
                                {errors.tipo && (
                                    <p className="text-[11px] text-destructive">{errors.tipo.message}</p>
                                )}
                                {TIPO_CONFIG.map(({value, label, icon: Icon, desc}) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => handleSelectTipo(value)}
                                        className={cn(
                                            "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                                            tipo === value
                                                ? "border-primary/60 bg-primary/10"
                                                : "border-white/10 bg-white/5 hover:border-white/20",
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                                tipo === value ? "bg-primary/20" : "bg-white/5",
                                            )}
                                        >
                                            <Icon
                                                className={cn(
                                                    "w-5 h-5 transition-colors",
                                                    tipo === value ? "text-primary" : "text-muted-foreground",
                                                )}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p
                                                className={cn(
                                                    "text-sm font-semibold leading-tight",
                                                    tipo === value ? "text-white" : "text-muted-foreground",
                                                )}
                                            >
                                                {label}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                                        </div>
                                        {tipo === value && (
                                            <CheckCircle className="w-4 h-4 text-primary shrink-0"/>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Passo 2: Preencha os dados (condicional por tipo) */}
                        {step === 2 && (
                            <div className="space-y-4">

                                {/* Nome - obrigatório para todos os tipos */}
                                <div>
                                    <label
                                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                        {tipo === "Conta Movimento"
                                            ? "Nome da conta movimento"
                                            : tipo === "Conta Poupança"
                                                ? "Nome da conta poupança"
                                                : "Nome da conta"}
                                        <Req/>
                                    </label>
                                    <input {...register("nome")} className={inputCls}
                                           placeholder="Ex: Itaú PJ Principal"/>
                                    {errors.nome && (
                                        <p className="text-[11px] text-destructive mt-1">{errors.nome.message}</p>
                                    )}
                                </div>

                                {/* Banco - Conta Corrente e Conta Poupança */}
                                {(tipo === "Conta Corrente" || tipo === "Conta Poupança") && (
                                    <div>
                                        <label
                                            className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                            Banco <Req/>
                                        </label>
                                        <input
                                            {...register("banco")}
                                            className={inputCls}
                                            placeholder={tipo === "Conta Poupança" ? "Ex: Caixa Econômica" : "Ex: Itaú"}
                                        />
                                        {errors.banco && (
                                            <p className="text-[11px] text-destructive mt-1">{errors.banco.message}</p>
                                        )}
                                    </div>
                                )}

                                {/* Agência + Conta - Conta Corrente e Conta Poupança */}
                                {(tipo === "Conta Corrente" || tipo === "Conta Poupança") && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label
                                                className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                                Agência (sem dígito) <Req/>
                                            </label>
                                            <Controller
                                                name="agencia"
                                                control={control}
                                                render={({field}) => (
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        autoComplete="off"
                                                        value={field.value ?? ""}
                                                        onChange={(e) => field.onChange(maskAgencia(e.target.value))}
                                                        className={monoInputCls}
                                                        placeholder="0000"
                                                        maxLength={4}
                                                    />
                                                )}
                                            />
                                            {errors.agencia && (
                                                <p className="text-[11px] text-destructive mt-1">{errors.agencia.message}</p>
                                            )}
                                        </div>
                                        <div>
                                            <label
                                                className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                                Conta (com dígito) <Req/>
                                            </label>
                                            <Controller
                                                name="conta"
                                                control={control}
                                                render={({field}) => (
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        autoComplete="off"
                                                        value={field.value ?? ""}
                                                        onChange={(e) => field.onChange(maskConta(e.target.value))}
                                                        className={monoInputCls}
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
                                )}

                                {/* Cor de identificação - todos os tipos */}
                                <div>
                                    <label
                                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                        Cor de identificação
                                    </label>
                                    <div className="flex gap-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                                        {["#3BA8DC", "#E67E22", "#8B5CF6", "#27AE60", "#E74C3C"].map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setValue("cor", c, {shouldValidate: true})}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg border-2 transition-all",
                                                    cor === c
                                                        ? "border-white scale-110"
                                                        : "border-transparent opacity-50 hover:opacity-100",
                                                )}
                                                style={{backgroundColor: c}}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Passo 3: Dados Iniciais da Conta */}
                        {step === 3 && (
                            <div className="space-y-4">
                                <div>
                                    <label
                                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                        Início dos lançamentos <Req/>
                                    </label>
                                    <input
                                        type="date"
                                        {...register("data_inicio")}
                                        className={cn(inputCls, "[color-scheme:dark]")}
                                    />
                                    {errors.data_inicio && (
                                        <p className="text-[11px] text-destructive mt-1">
                                            {errors.data_inicio.message}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label
                                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                        Saldo final da conta no dia anterior
                                    </label>
                                    <div className="relative">
                    <span
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold select-none">
                      R$
                    </span>
                                        <Controller
                                            name="saldo_inicial_br"
                                            control={control}
                                            render={({field}) => (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    value={field.value}
                                                    onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white font-bold outline-none focus:border-primary/50 transition-colors"
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
                            </div>
                        )}
                    </div>

                    {/* Rodapé de navegação */}
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

                        {step < 3 ? (
                            <button
                                type="button"
                                onClick={() => void goNext()}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-all"
                            >
                                Continuar
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={mutation.isPending}
                                onClick={() => void onSubmitFinal()}
                                className="flex-1 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                            >
                                {mutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin mx-auto"/>
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
    const {toast} = useToast();
    const [showSaldos, setShowSaldos] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingConta, setEditingConta] = useState<ContaBancaria | null>(null);
    const {confirm, ConfirmDialogProps} = useConfirm();

    const {data: contas = [], isLoading} = useQuery<ContaBancaria[]>({
        queryKey: ["contas-bancarias"],
        queryFn: () => fetchApiData<ContaBancaria[]>("/contas-bancarias"),
    });

    const blockMutation = useMutation({
        mutationFn: ({id, status}: { id: number; status: string }) =>
            fetchApiData<ContaBancaria>(`/contas-bancarias/${id}`, {
                method: "PUT",
                body: JSON.stringify({status}),
            }),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({queryKey: ["contas-bancarias"]});
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
            fetchApiData<{ deleted?: boolean }>(`/contas-bancarias/${id}`, {method: "DELETE"}),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["contas-bancarias"]});
            toast({title: "Conta removida", description: "A conta foi deletada com sucesso."});
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro",
                description: e instanceof Error ? e.message : String(e),
            });
        },
    });

    const handleDelete = async (conta: ContaBancaria) => {
        const ok = await confirm({
            title: `Excluir "${conta.nome}"?`,
            description: "Esta ação não pode ser desfeita. Contas com movimentações vinculadas não podem ser removidas.",
            confirmLabel: "Excluir",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(conta.id);
    };

    const handleToggleStatus = async (conta: ContaBancaria) => {
        const bloqueando = conta.status === "ativo";
        const ok = await confirm({
            title: bloqueando ? `Bloquear "${conta.nome}"?` : `Desbloquear "${conta.nome}"?`,
            description: bloqueando
                ? "A conta não poderá receber novos lançamentos enquanto estiver bloqueada."
                : "A conta voltará a ficar disponível para lançamentos.",
            confirmLabel: bloqueando ? "Bloquear" : "Desbloquear",
            cancelLabel: "Cancelar",
            variant: bloqueando ? "destructive" : "default",
        });
        if (ok) blockMutation.mutate({id: conta.id, status: bloqueando ? "bloqueado" : "ativo"});
    };

    const totalSaldoCents = contas
        .filter((c) => c.status === "ativo")
        .reduce((acc, c) => acc + toCents(c.saldo_atual), 0);

    return (
        <div className="space-y-6">
            {/* Dialog de confirmação */}
            <ConfirmDialog {...ConfirmDialogProps} />

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
                            {showSaldos ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                            {showSaldos ? "Ocultar" : "Mostrar"} Saldos
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                        >
                            <Plus className="w-4 h-4"/> Nova Conta Bancária
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
                        <Landmark className="w-7 h-7 text-primary"/>
                    </div>
                </div>
            </div>

            {/* Loading - skeleton de cards */}
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <CardsSkeleton cards={2}/>
                    <CardsSkeleton cards={2}/>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && contas.length === 0 && (
                <div className="glass-panel rounded-2xl border border-white/5">
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Landmark className="text-muted-foreground/40"/>
                            </EmptyMedia>
                            <EmptyTitle className="text-white">Nenhuma conta cadastrada</EmptyTitle>
                            <EmptyDescription>
                                Cadastre uma conta bancária para começar a registrar movimentações e saldos.
                            </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                            <button
                                type="button"
                                onClick={() => setShowModal(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                            >
                                <Plus className="w-4 h-4"/> Nova Conta Bancária
                            </button>
                        </EmptyContent>
                    </Empty>
                </div>
            )}

            {/* Lista */}
            {!isLoading && contas.length > 0 && (
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
                                        style={{backgroundColor: `${conta.cor}20`}}
                                    >
                                        <Landmark className="w-6 h-6" style={{color: conta.cor}}/>
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
                                        <Pencil className="w-4 h-4"/>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleStatus(conta)}
                                        className={`p-2 rounded-lg transition-colors ${
                                            conta.status === "ativo"
                                                ? "bg-white/5 hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400"
                                                : "bg-success/20 text-success hover:bg-success/30"
                                        }`}
                                    >
                                        {conta.status === "ativo" ? (
                                            <Lock className="w-4 h-4"/>
                                        ) : (
                                            <Unlock className="w-4 h-4"/>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(conta)}
                                        className="p-2 bg-white/5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4"/>
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
                                    <p className="text-2xl font-bold" style={{color: conta.cor}}>
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
                        <CheckCircle className="w-3 h-3"/>
                    ) : (
                        <AlertCircle className="w-3 h-3"/>
                    )}
                                        {conta.status}
                  </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}