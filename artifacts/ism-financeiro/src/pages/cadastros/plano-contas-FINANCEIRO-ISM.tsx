import {useMemo, useState, useRef, useEffect} from "react";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {PageHeader} from "@/components/shared/page-header";
import {Plus, Edit, Trash2, Lock, X} from "lucide-react";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {fetchApi, fetchApiData} from "@/lib/api-config";

type PlanoConta = {
    id: number;
    tipo: string;
    categoria: string;
    subcategoria: string | null;
    ativo: boolean;
};

// Comparador alfabético 
const collator = new Intl.Collator("pt-BR", {sensitivity: "base"});

const normalizeText = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const planoContaFormSchema = z.object({
    tipo: z.enum(["receita", "custo", "despesa"], {
        required_error: "Selecione o tipo.",
        invalid_type_error: "Tipo inválido.",
    }),
    categoria: z.string().trim().min(1, "Categoria é obrigatória."),
    subcategoria: z.string().trim().optional().default(""),
});

type PlanoContaFormValues = z.infer<typeof planoContaFormSchema>;

type FormModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { id?: number } & PlanoContaFormValues) => void;
    initialData?: Partial<PlanoConta> | null;
    lockedTipo?: boolean;
    lockedCategoria?: boolean;
};

// Modal simples para formulário de Conta
function FormModal({
                       isOpen,
                       onClose,
                       onSubmit,
                       initialData,
                       lockedTipo = false,
                       lockedCategoria = false,
                   }: FormModalProps) {
    const {
        register,
        handleSubmit,
        formState: {errors},
    } = useForm<PlanoContaFormValues>({
        resolver: zodResolver(planoContaFormSchema),
        defaultValues: {
            tipo: (initialData?.tipo as PlanoContaFormValues["tipo"]) ?? "despesa",
            categoria: initialData?.categoria ?? "",
            subcategoria: initialData?.subcategoria ?? "",
        },
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1a1c23] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h2 className="text-lg font-bold text-white mb-4">
                    {initialData?.id
                        ? 'Editar Categoria'
                        : lockedCategoria
                            ? 'Nova Subcategoria'
                            : 'Nova Categoria'}
                </h2>

                <form
                    onSubmit={handleSubmit((values) => onSubmit({id: initialData?.id, ...values}))}
                    className="space-y-4"
                    noValidate
                >
                    {/* Tipo */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            Tipo
                            {lockedTipo && <Lock className="w-3 h-3 text-red-400"/>}
                        </label>
                        <select
                            {...register("tipo")}
                            disabled={lockedTipo}
                            className={`mt-1 w-full border rounded-lg p-2.5 outline-none focus:border-primary/50 transition-colors ${
                                lockedTipo
                                    ? 'bg-white/5 border-red-400/30 text-white/70 cursor-not-allowed'
                                    : 'bg-black/20 border-white/10 text-white'
                            }`}
                        >
                            <option value="receita" className="bg-[#1a1c23] text-white">Receita</option>
                            <option value="custo" className="bg-[#1a1c23] text-white">Custo</option>
                            <option value="despesa" className="bg-[#1a1c23] text-white">Despesa</option>
                        </select>
                        {lockedTipo && (
                            <p className="text-xs text-red-400/80 mt-1">Tipo travado pelo grupo selecionado</p>
                        )}
                        {errors.tipo && (
                            <p className="text-xs text-destructive mt-1">{errors.tipo.message}</p>
                        )}
                    </div>

                    {/* Categoria */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            Grupo Principal (Categoria)
                            {lockedCategoria && <Lock className="w-3 h-3 text-red-400"/>}
                        </label>
                        <input
                            type="text"
                            {...register("categoria")}
                            readOnly={lockedCategoria}
                            className={`mt-1 w-full border rounded-lg p-2.5 outline-none focus:border-primary/50 transition-colors ${
                                lockedCategoria
                                    ? 'bg-white/5 border-red-400/30 text-white/70 cursor-not-allowed'
                                    : errors.categoria
                                        ? 'bg-black/20 border-destructive/60 text-white'
                                        : 'bg-black/20 border-white/10 text-white'
                            }`}
                            placeholder="Ex: Despesas Administrativas"
                        />
                        {lockedCategoria && (
                            <p className="text-xs text-red-400/80 mt-1">Categoria travada — você está adicionando uma
                                subcategoria</p>
                        )}
                        {errors.categoria && (
                            <p className="text-xs text-destructive mt-1">{errors.categoria.message}</p>
                        )}
                    </div>

                    {/* Subcategoria */}
                    <div>
                        <label className="text-sm font-medium text-muted-foreground">Subcategoria (Opcional)</label>
                        <input
                            type="text"
                            {...register("subcategoria")}
                            className="mt-1 w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white outline-none focus:border-primary/50"
                            placeholder="Ex: Aluguel"
                            autoFocus={lockedCategoria}
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-colors">Cancelar
                        </button>
                        <button type="submit"
                                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors">Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function PlanoContas() {
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {confirm, ConfirmDialogProps} = useConfirm();

    const [modal, setModal] = useState<{
        open: boolean;
        data: PlanoConta | null;
        key: number;
        lockedTipo: boolean;
        lockedCategoria: boolean;
    }>({
        open: false,
        data: null,
        key: 0,
        lockedTipo: false,
        lockedCategoria: false,
    });

    // ── Banner de sucesso (topo, 3s, com botão de fechar) ──────────────────
    // Usado apenas para a mensagem de cadastro de categoria/subcategoria,
    // sem afetar o sistema de toast global (bottom-right) usado no resto do app.
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showSuccessBanner = (message: string) => {
        if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        setSuccessMessage(message);
        successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 3000);
    };

    const closeSuccessBanner = () => {
        if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        setSuccessMessage(null);
    };

    useEffect(() => {
        return () => {
            if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        };
    }, []);

    const {data: contas = [], isLoading} = useQuery<PlanoConta[]>({
        queryKey: ['plano-contas'],
        queryFn: () => fetchApiData("/plano-contas")
    });

    const saveMutation = useMutation({
        mutationFn: (data: any) => {
            const method = data.id ? 'PUT' : 'POST';
            const path = data.id ? `/plano-contas/${data.id}` : "/plano-contas";
            return fetchApi(path, {
                method,
                body: JSON.stringify(data)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ['plano-contas']});
            setModal(prev => ({...prev, open: false, data: null}));
            showSuccessBanner('Categoria salva com sucesso.');
        },
        onError: (error) => {
            toast({variant: 'destructive', title: 'Erro', description: error.message});
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => fetchApi(`/plano-contas/${id}`, {method: 'DELETE'}),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ['plano-contas']});
            toast({title: 'Sucesso', description: 'Categoria removida.'});
        },
        onError: async (error: Error) => {
            const vinculada = /vincul|em uso|associad|relacionad/i.test(error.message);
            await confirm({
                title: vinculada ? 'Não é possível excluir' : 'Erro ao excluir',
                description: vinculada
                    ? 'Categorias com lançamentos vinculados não podem ser removidas.'
                    : error.message,
                confirmLabel: 'Entendi',
                variant: vinculada ? 'default' : 'destructive',
            });
        }
    });

    const handleCreate = (tipoDef?: string) => {
        setModal(prev => ({
            open: true,
            data: tipoDef ? {tipo: tipoDef} as any : null,
            key: prev.key + 1,
            lockedTipo: !!tipoDef,
            lockedCategoria: false,
        }));
    };

    const handleAddSubcategoria = (categoria: string, tipo: string) => {
        setModal(prev => ({
            open: true,
            data: {tipo, categoria} as any,
            key: prev.key + 1,
            lockedTipo: true,
            lockedCategoria: true,
        }));
    };

    const handleEdit = (item: PlanoConta) => {
        setModal(prev => ({
            open: true,
            data: item,
            key: prev.key + 1,
            lockedTipo: false,
            lockedCategoria: false,
        }));
    };

    const handleDelete = async (cat: PlanoConta) => {
        const label = cat.subcategoria
            ? `"${cat.subcategoria.toUpperCase()}"`
            : `"${cat.categoria.toUpperCase()}"`;
        const ok = await confirm({
            title: `Excluir ${label}?`,
            description: 'Esta ação não pode ser desfeita. A categoria será removida permanentemente.',
            confirmLabel: 'Excluir',
            cancelLabel: 'Cancelar',
            variant: 'destructive',
        });
        if (ok) deleteMutation.mutate(cat.id);
    };

    // Validação de categoria duplicada dentro do mesmo tipo
    const handleSubmit = (data: { id?: number } & PlanoContaFormValues) => {
        const categoriaTrim = data.categoria.trim().replace(/\s+/g, ' ');
        const categoriaNorm = normalizeText(categoriaTrim);

        const isReaproveitandoCategoriaTravada =
            !data.id &&
            contas.some(c => c.tipo === data.tipo && normalizeText(c.categoria) === categoriaNorm);

        if (!isReaproveitandoCategoriaTravada) {
            const existeDuplicada = contas.some(
                c => c.tipo === data.tipo &&
                    normalizeText(c.categoria) === categoriaNorm &&
                    c.id !== data.id
            );

            if (existeDuplicada) {
                toast({
                    variant: 'destructive',
                    title: 'Categoria duplicada',
                    description: `Já existe uma categoria "${categoriaTrim}" neste tipo de plano de contas.`,
                });
                return;
            }
        }

        saveMutation.mutate({
            ...data,
            categoria: categoriaTrim,
            subcategoria: data.subcategoria?.trim() || null,
        });
    };

    const receitas = contas.filter(c => c.tipo === 'receita');
    const custos = contas.filter(c => c.tipo === 'custo');
    const despesas = contas.filter(c => c.tipo === 'despesa');

    // Agrupa por categoria normalizada
    const groupByCategoriaOrdenado = (items: PlanoConta[]) => {
        const grouped: Record<string, { label: string; items: PlanoConta[] }> = {};

        items.forEach(item => {
            const key = normalizeText(item.categoria);
            const labelLimpo = item.categoria.trim().replace(/\s+/g, ' ');
            if (!grouped[key]) {
                grouped[key] = {label: labelLimpo, items: []};
            }
            grouped[key].items.push(item);
        });

        Object.values(grouped).forEach(group => {
            group.items.sort((a, b) =>
                collator.compare((a.subcategoria || "").trim(), (b.subcategoria || "").trim())
            );
        });

        return Object.values(grouped)
            .sort((a, b) => collator.compare(a.label, b.label))
            .map(group => [group.label, group.items] as [string, PlanoConta[]]);
    };

    const renderSection = (title: string, tipoCode: string, colorConfig: any, items: PlanoConta[], tipoDef: string) => {
        const groupedEntries = groupByCategoriaOrdenado(items);

        return (
            <div className={`glass-panel rounded-2xl overflow-hidden ${colorConfig.border}`}>
                <div
                    className={`${colorConfig.bg} p-4 border-b ${colorConfig.borderHeader} flex justify-between items-center`}>
                    <h3 className={`font-bold ${colorConfig.text}`}>{title}</h3>
                    <span
                        className={`text-xs ${colorConfig.bgBadge} ${colorConfig.textBadge} px-2 py-1 rounded`}>Grupo {tipoCode}</span>
                </div>

                <div className="p-4 space-y-4">
                    {isLoading ? (
                        <div className="text-sm text-muted-foreground animate-pulse p-2">Carregando...</div>
                    ) : groupedEntries.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-4 text-center">Nenhuma categoria
                            cadastrada</div>
                    ) : (
                        groupedEntries.map(([categoria, subcontas]) => (
                            <div key={categoria} className="space-y-1">
                                <div
                                    className="flex items-center justify-between pl-2 mb-2 border-l-2 border-white/20 group/cat">
                                    <div className="text-sm font-bold text-white/80 capitalize">{categoria}</div>
                                    <button
                                        onClick={() => handleAddSubcategoria(categoria, tipoDef)}
                                        title="Adicionar subcategoria"
                                        className="p-1 rounded text-muted-foreground/70 hover:text-white hover:bg-white/10 transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5"/>
                                    </button>
                                </div>
                                {subcontas.map(cat => (
                                    <div key={cat.id}
                                         className="p-3 bg-white/5 rounded-lg border border-white/5 flex justify-between items-center hover:bg-white/10 transition-colors group">
                     <span className="text-sm font-medium text-white pl-4 capitalize truncate max-w-[200px]">
                       {cat.subcategoria?.trim() || "—"}
                     </span>
                                        <div
                                            className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEdit(cat)}
                                                    className="text-muted-foreground hover:text-white p-1">
                                                <Edit className="w-4 h-4"/>
                                            </button>
                                            <button onClick={() => handleDelete(cat)}
                                                    className="text-muted-foreground hover:text-rose-400 p-1">
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}

                    <button onClick={() => handleCreate(tipoDef)}
                            className="w-full py-2 border-2 border-dashed border-white/10 rounded-lg text-sm text-muted-foreground hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2 mt-4">
                        <Plus className="w-4 h-4"/> Adicionar Categoria
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <ConfirmDialog {...ConfirmDialogProps} />

            {successMessage && (
                <div className="fixed top-0 right-0 z-[100] w-full max-w-[420px] p-4 animate-in fade-in slide-in-from-top-full">
                    <div className="group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border bg-background text-foreground p-6 pr-8 shadow-lg">
                        <div className="grid gap-1">
                            <p className="text-sm font-semibold">Sucesso</p>
                            <p className="text-sm opacity-90">{successMessage}</p>
                        </div>
                        <button
                            onClick={closeSuccessBanner}
                            className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-100 transition-opacity hover:text-foreground focus:outline-none focus:ring-2"
                            aria-label="Fechar"
                        >
                            <X className="h-4 w-4"/>
                        </button>
                    </div>
                </div>
            )}

            <PageHeader
                title="Plano de Contas"
                description="Estrutura hierárquica de categorias financeiras para receitas, custos e despesas"
                actions={
                    <button onClick={() => handleCreate()}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
                        <Plus className="w-4 h-4"/>
                        Nova Categoria
                    </button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {renderSection('Receitas (+)', '1.0', {
                    border: 'border-teal-500/20',
                    bg: 'bg-teal-500/20',
                    borderHeader: 'border-teal-500/30',
                    text: 'text-teal-400',
                    bgBadge: 'bg-teal-500/20',
                    textBadge: 'text-teal-300'
                }, receitas, 'receita')}

                {renderSection('Custos (-)', '2.0', {
                    border: 'border-blue-500/20',
                    bg: 'bg-blue-500/20',
                    borderHeader: 'border-blue-500/30',
                    text: 'text-blue-400',
                    bgBadge: 'bg-blue-500/20',
                    textBadge: 'text-blue-300'
                }, custos, 'custo')}

                {renderSection('Despesas (-)', '3.0', {
                    border: 'border-orange-500/20',
                    bg: 'bg-orange-500/20',
                    borderHeader: 'border-orange-500/30',
                    text: 'text-orange-400',
                    bgBadge: 'bg-orange-500/20',
                    textBadge: 'text-orange-300'
                }, despesas, 'despesa')}
            </div>

            <FormModal
                key={modal.key}
                isOpen={modal.open}
                onClose={() => setModal(prev => ({...prev, open: false, data: null}))}
                onSubmit={handleSubmit}
                initialData={modal.data}
                lockedTipo={modal.lockedTipo}
                lockedCategoria={modal.lockedCategoria}
            />
        </div>
    );
}