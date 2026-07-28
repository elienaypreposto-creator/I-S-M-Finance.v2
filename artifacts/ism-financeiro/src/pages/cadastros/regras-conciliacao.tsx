import {useState} from "react";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {PageHeader} from "@/components/shared/page-header";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {RegraConciliacaoModal, type RegraConciliacaoItem} from "@/components/conciliacao/regra-conciliacao-modal";
import {Loader2, Plus, Pencil, Trash2, Sparkles, ArrowDownCircle, ArrowUpCircle} from "lucide-react";
import {cn} from "@/lib/utils";

type RegraConciliacaoRow = RegraConciliacaoItem & {
    conta_nome: string | null;
    plano_conta_categoria: string | null;
    plano_conta_subcategoria: string | null;
    parceiro_nome: string | null;
    departamento_nome: string | null;
    centro_custo_nome: string | null;
};

export default function RegrasConciliacao() {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const {confirm, ConfirmDialogProps} = useConfirm();

    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<RegraConciliacaoItem | null>(null);

    const {data: regras = [], isLoading} = useQuery<RegraConciliacaoRow[]>({
        queryKey: ["regras-conciliacao"],
        queryFn: () => fetchApiData<RegraConciliacaoRow[]>("/regras-conciliacao"),
    });

    const removeMutation = useMutation({
        mutationFn: (id: number) => fetchApiData(`/regras-conciliacao/${id}`, {method: "DELETE"}),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["regras-conciliacao"]});
            toast({title: "Regra removida"});
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro ao remover",
                description: e instanceof Error ? e.message : "Não foi possível remover a regra.",
            });
        },
    });

    const handleNovo = () => {
        setEditItem(null);
        setModalOpen(true);
    };

    const handleEditar = (item: RegraConciliacaoRow) => {
        setEditItem(item);
        setModalOpen(true);
    };

    const handleRemover = async (item: RegraConciliacaoRow) => {
        const ok = await confirm({
            title: "Remover regra",
            description: `Remover a regra "${item.texto_gatilho}"? Linhas já classificadas por ela não são afetadas.`,
            confirmLabel: "Remover",
            variant: "destructive",
        });
        if (ok) removeMutation.mutate(item.id);
    };

    return (
        <div className="flex flex-col gap-4 max-w-5xl mx-auto py-2">
            <ConfirmDialog {...ConfirmDialogProps} />

            <PageHeader
                title="Regras de conciliação"
                description="Classifica (e opcionalmente cria) automaticamente lançamentos repetitivos na importação, como tarifas bancárias."
                actions={
                    <button
                        type="button"
                        onClick={handleNovo}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
                        <Plus className="w-4 h-4"/> Nova regra
                    </button>
                }
            />

            {modalOpen && (
                <RegraConciliacaoModal
                    open
                    editItem={editItem}
                    onClose={() => setModalOpen(false)}
                    onSuccess={() => setModalOpen(false)}
                />
            )}

            {isLoading ? (
                <div className="glass-panel rounded-2xl p-16 flex flex-col items-center gap-3 border border-white/10">
                    <Loader2 className="w-8 h-8 animate-spin text-primary"/>
                </div>
            ) : regras.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 border border-white/10 text-center">
                    <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3"/>
                    <p className="text-sm text-white font-medium">Nenhuma regra cadastrada ainda.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Crie uma regra para classificar tarifas e outras linhas repetitivas automaticamente.
                    </p>
                </div>
            ) : (
                <div className="glass-panel rounded-2xl border border-white/10 divide-y divide-white/5">
                    {regras.map((r) => {
                        const isEntrada = r.natureza === "entrada";
                        return (
                            <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span
                                            className={cn(
                                                "inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded border uppercase",
                                                isEntrada
                                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                                                    : "bg-red-500/15 text-red-300 border-red-500/25",
                                            )}>
                                            {isEntrada ? <ArrowDownCircle className="w-3 h-3"/> :
                                                <ArrowUpCircle className="w-3 h-3"/>}
                                            {isEntrada ? "Entrada" : "Saída"}
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 text-white/70 uppercase">
                                            {r.tipo_match}
                                        </span>
                                        {!r.ativo && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 text-muted-foreground uppercase">
                                                Inativa
                                            </span>
                                        )}
                                        {r.criar_lancamento_automatico && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-sky-500/25 bg-sky-500/10 text-sky-300 uppercase">
                                                Cria lançamento
                                            </span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground">Prioridade {r.prioridade}</span>
                                    </div>
                                    <p className="text-sm text-white font-medium">"{r.texto_gatilho}"</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {r.conta_nome ?? "Todas as contas"}
                                        {r.plano_conta_categoria && ` · ${r.plano_conta_categoria}${r.plano_conta_subcategoria ? ` - ${r.plano_conta_subcategoria}` : ""}`}
                                        {r.parceiro_nome && ` · ${r.parceiro_nome}`}
                                        {r.departamento_nome && ` · ${r.departamento_nome}`}
                                        {r.centro_custo_nome && ` · ${r.centro_custo_nome}`}
                                    </p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button type="button" onClick={() => handleEditar(r)}
                                            className="p-2 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5">
                                        <Pencil className="w-4 h-4"/>
                                    </button>
                                    <button type="button" onClick={() => handleRemover(r)}
                                            className="p-2 rounded-lg border border-white/10 text-muted-foreground hover:text-red-300 hover:bg-red-500/10">
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}