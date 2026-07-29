import {useState} from "react";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {PageHeader} from "@/components/shared/page-header";
import {
    Plus,
    Building,
    Pencil,
    Trash2,
    X,
    Loader2,
    AlertCircle,
    Info,
    CheckCircle,
} from "lucide-react";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
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

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type FilialRow = {
    id: number;
    nome: string;
    created_at: string;
};

// ─── Schema de validação ───────────────────────────────────────────────────────
const filialFormSchema = z.object({
    nome: z.string().trim().min(1, "Nome da filial é obrigatório."),
});
type FilialFormValues = z.infer<typeof filialFormSchema>;

// Paleta determinística por id (idêntica ao padrão de departamentos)
const FILIAL_COLORS = [
    "#3BA8DC", "#27AE60", "#E67E22", "#8B5CF6",
    "#E74C3C", "#F39C12", "#1ABC9C", "#E91E63",
];

function getColor(id: number): string {
    return FILIAL_COLORS[id % FILIAL_COLORS.length];
}

// ─── Modal Criar / Editar ──────────────────────────────────────────────────────
interface FilialModalProps {
    onClose: () => void;
    initialData?: FilialRow | null;
    isPending: boolean;
    onSave: (data: FilialFormValues) => void;
}

function FilialModal({onClose, initialData, isPending, onSave}: FilialModalProps) {
    const isEdit = !!initialData;

    const {
        register,
        handleSubmit,
        formState: {errors},
    } = useForm<FilialFormValues>({
        resolver: zodResolver(filialFormSchema),
        defaultValues: {nome: initialData?.nome ?? ""},
    });

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <h2 className="text-lg font-bold text-white">
                        {isEdit ? "Editar Filial" : "Nova Filial"}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSave)}>
                    <div className="p-6 space-y-4">
                        <div>
                            <label
                                className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                Nome da Filial <span className="text-destructive">*</span>
                            </label>
                            <input
                                {...register("nome")}
                                autoFocus
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                                placeholder="Ex: Filial Curitiba"
                            />
                            {errors.nome && (
                                <p className="text-xs text-destructive mt-1">{errors.nome.message}</p>
                            )}
                        </div>

                        <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3">
                            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5"/>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Campos de CNPJ, endereço e contacto serão adicionados na{" "}
                                <strong className="text-white">Fase 7 — Ampliação de Schema</strong>.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3 px-6 pb-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                            {isPending && <Loader2 className="w-4 h-4 animate-spin"/>}
                            {isEdit ? "Salvar" : "Criar Filial"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function Filiais() {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [editingFilial, setEditingFilial] = useState<FilialRow | null | undefined>(undefined);
    const [modalKey, setModalKey] = useState(0);
    const {confirm, ConfirmDialogProps} = useConfirm();

    // undefined -> modal fechado; null -> criar; FilialRow -> editar
    const modalAberto = editingFilial !== undefined;

    const openCreate = () => {
        setEditingFilial(null);
        setModalKey((k) => k + 1);
    };
    const openEdit = (f: FilialRow) => {
        setEditingFilial(f);
        setModalKey((k) => k + 1);
    };
    const closeModal = () => setEditingFilial(undefined);

    // ── Query ────────────────────────────────────────────────────────────────────
    const {data: filiais = [], isLoading, isError} = useQuery<FilialRow[]>({
        queryKey: ["filiais"],
        queryFn: () => fetchApiData<FilialRow[]>("/filiais"),
    });

    // ── Criar ────────────────────────────────────────────────────────────────────
    const createMutation = useMutation({
        mutationFn: (data: FilialFormValues) =>
            fetchApiData<FilialRow>("/filiais", {
                method: "POST",
                body: JSON.stringify({nome: data.nome}),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["filiais"]});
            toast({title: "Filial criada com sucesso."});
            closeModal();
        },
        onError: (err: Error) =>
            toast({title: "Erro ao criar filial", description: err.message, variant: "destructive"}),
    });

    // ── Editar ───────────────────────────────────────────────────────────────────
    const updateMutation = useMutation({
        mutationFn: ({id, data}: { id: number; data: FilialFormValues }) =>
            fetchApiData<FilialRow>(`/filiais/${id}`, {
                method: "PUT",
                body: JSON.stringify({nome: data.nome}),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["filiais"]});
            toast({title: "Filial atualizada com sucesso."});
            closeModal();
        },
        onError: (err: Error) =>
            toast({title: "Erro ao atualizar filial", description: err.message, variant: "destructive"}),
    });

    // ── Deletar ──────────────────────────────────────────────────────────────────
    const deleteMutation = useMutation({
        mutationFn: (id: number) =>
            fetchApiData<{ deleted: boolean }>(`/filiais/${id}`, {method: "DELETE"}),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["filiais"]});
            toast({title: "Filial removida com sucesso."});
        },
        onError: (err: Error) => {
            const isIntegrity =
                err.message.toLowerCase().includes("integrity") ||
                err.message.toLowerCase().includes("foreign") ||
                err.message.toLowerCase().includes("fk");
            toast({
                title: isIntegrity ? "Não é possível excluir" : "Erro ao excluir filial",
                description: isIntegrity
                    ? "Esta filial possui lançamentos ou dados vinculados. Remova os vínculos antes de excluir."
                    : err.message,
                variant: "destructive",
            });
        },
    });

    const isSaving = createMutation.isPending || updateMutation.isPending;

    const handleSave = (data: FilialFormValues) => {
        if (editingFilial) {
            updateMutation.mutate({id: editingFilial.id, data});
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = async (filial: FilialRow) => {
        const ok = await confirm({
            title: `Excluir "${filial.nome}"?`,
            description: "Esta ação não pode ser desfeita. Filiais com dados vinculados não podem ser removidas.",
            confirmLabel: "Excluir",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(filial.id);
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Dialog de confirmação de exclusão */}
            <ConfirmDialog {...ConfirmDialogProps} />

            {/* Modal criar/editar */}
            {modalAberto && (
                <FilialModal
                    key={`filial-modal-${modalKey}`}
                    initialData={editingFilial}
                    onClose={closeModal}
                    isPending={isSaving}
                    onSave={handleSave}
                />
            )}

            <PageHeader
                title="Filiais"
                description="Gerencie as filiais e unidades da empresa"
                actions={
                    <button
                        type="button"
                        onClick={openCreate}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                    >
                        <Plus className="w-4 h-4"/>
                        Nova Filial
                    </button>
                }
            />

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                {[
                    {label: "Total Filiais", value: filiais.length, color: "text-primary"},
                    {
                        label: "Criadas em " + new Date().getFullYear(),
                        value: filiais.filter(
                            (f) => new Date(f.created_at).getFullYear() === new Date().getFullYear(),
                        ).length,
                        color: "text-success",
                    },
                ].map((item) => (
                    <div key={item.label} className="glass-panel rounded-2xl p-3 sm:p-4 text-center">
                        <p className={`text-2xl sm:text-3xl font-bold ${item.color}`}>{item.value}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{item.label}</p>
                    </div>
                ))}

                <div
                    className="col-span-2 sm:col-span-1 glass-panel rounded-2xl p-3 sm:p-4 flex items-center gap-2 border border-primary/20 bg-primary/5">
                    <Info className="w-4 h-4 text-primary shrink-0"/>
                    <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                        CNPJ, endereço e contacto chegam na Fase 7.
                    </p>
                </div>
            </div>

            {/* Loading — skeleton de cards */}
            {isLoading && <CardsSkeleton cards={4}/>}

            {/* Erro */}
            {isError && !isLoading && (
                <div className="glass-panel rounded-2xl p-5 border border-destructive/20 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive shrink-0"/>
                    <p className="text-sm text-muted-foreground">Erro ao carregar filiais. Tente novamente.</p>
                </div>
            )}

            {/* Lista */}
            {!isLoading && !isError && (
                <>
                    {filiais.length === 0 ? (
                        <div className="glass-panel rounded-2xl border border-white/5">
                            <Empty>
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <Building className="text-muted-foreground/40"/>
                                    </EmptyMedia>
                                    <EmptyTitle className="text-white">Nenhuma filial cadastrada</EmptyTitle>
                                    <EmptyDescription>
                                        Adicione a primeira filial para começar a organizar as unidades da empresa.
                                    </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                    <button
                                        type="button"
                                        onClick={openCreate}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                                    >
                                        <Plus className="w-4 h-4"/>
                                        Nova Filial
                                    </button>
                                </EmptyContent>
                            </Empty>
                        </div>
                    ) : (
                        <div className="space-y-3 sm:space-y-4">
                            {filiais.map((filial) => (
                                <div
                                    key={filial.id}
                                    className="glass-panel rounded-2xl p-4 sm:p-5 hover:border-white/20 border border-white/5 transition-all group"
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                            <div
                                                className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
                                                style={{backgroundColor: `${getColor(filial.id)}20`}}
                                            >
                                                <Building
                                                    className="w-5 h-5 sm:w-6 sm:h-6"
                                                    style={{color: getColor(filial.id)}}
                                                />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                    <h3 className="font-bold text-white text-sm sm:text-base truncate">
                                                        {filial.nome}
                                                    </h3>
                                                    <span
                                                        className="text-xs text-muted-foreground font-mono bg-white/5 px-2 py-0.5 rounded shrink-0">
                            #{String(filial.id).padStart(3, "0")}
                          </span>
                                                    <span
                                                        className="inline-flex items-center gap-1 text-xs bg-success/20 text-success px-2 py-0.5 rounded-full shrink-0">
                            <CheckCircle className="w-2.5 h-2.5"/> Ativa
                          </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Criada em{" "}
                                                    {new Date(filial.created_at).toLocaleDateString("pt-BR", {
                                                        day: "2-digit",
                                                        month: "long",
                                                        year: "numeric",
                                                    })}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Ações */}
                                        <div
                                            className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0">
                                            <button
                                                type="button"
                                                title="Editar filial"
                                                onClick={() => openEdit(filial)}
                                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                            >
                                                <Pencil className="w-4 h-4 text-muted-foreground"/>
                                            </button>
                                            <button
                                                type="button"
                                                title="Excluir filial"
                                                disabled={deleteMutation.isPending}
                                                onClick={() => handleDelete(filial)}
                                                className="p-2 hover:bg-destructive/20 rounded-lg transition-colors disabled:opacity-40"
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive"/>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}