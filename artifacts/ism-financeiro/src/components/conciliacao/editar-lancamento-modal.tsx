import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogFooter,
    AlertDialogDescription,
} from "@/components/ui/dialog";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {Loader2, Pencil} from "lucide-react";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {DISCARD_PROMPT} from "@/hooks/use-escape-close";

type LancamentoEditavel = {
    id: number;
    descricao: string | null;
    vencimento: string;
    valor: string | number;
};

type Props = {
    open: boolean;
    lancamentoId: number | null;
    onClose: () => void;
    onSaved?: () => void;
};

/** FEAT-09: editar lançamento a partir da conciliação (valor só com alterar_valor). */
export function EditarLancamentoConciliacaoModal({open, lancamentoId, onClose, onSaved}: Props) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const {hasPermission} = useAuth();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const canAlterarValor = hasPermission(PERM.LANCAMENTOS_ALTERAR_VALOR);

    const [descricao, setDescricao] = useState("");
    const [vencimento, setVencimento] = useState("");
    const [valor, setValor] = useState("");

    const {data, isLoading} = useQuery({
        queryKey: ["lancamento-edit-conciliacao", lancamentoId],
        queryFn: () => fetchApiData<LancamentoEditavel>(`/lancamentos/${lancamentoId}`),
        enabled: open && lancamentoId != null,
    });

    useEffect(() => {
        if (!data) return;
        setDescricao(data.descricao ?? "");
        setVencimento(data.vencimento?.slice(0, 10) ?? "");
        setValor(String(data.valor ?? ""));
    }, [data]);

    const mutation = useMutation({
        mutationFn: () => {
            const payload: Record<string, string> = {
                descricao,
                vencimento,
            };
            if (canAlterarValor) {
                payload.valor = valor;
            }
            return fetchApiData(`/lancamentos/${lancamentoId}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
        },
        onSuccess: () => {
            toast({title: "Lançamento atualizado", description: "Alterações salvas com sucesso."});
            void queryClient.invalidateQueries({queryKey: ["conciliacao"]});
            onSaved?.();
            onClose();
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível salvar.";
            toast({variant: "destructive", title: "Erro", description: msg});
        },
    });

    async function handleRequestClose() {
        if (data) {
            const dirty =
                descricao !== (data.descricao ?? "") ||
                vencimento !== (data.vencimento?.slice(0, 10) ?? "") ||
                (canAlterarValor && valor !== String(data.valor ?? ""));
            if (dirty) {
                const ok = await confirm(DISCARD_PROMPT);
                if (!ok) return;
            }
        }
        onClose();
    }

    return (
        <>
        <AlertDialog
            open={open}
            onOpenChange={(v) => {
                if (!v) void handleRequestClose();
            }}
        >
            <AlertDialogContent className="sm:max-w-md bg-card border border-white/10 text-white rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-base">
                        <Pencil className="w-4 h-4 text-primary"/>
                        Editar lançamento #{lancamentoId}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-muted-foreground">
                        Corrija cadastro errado sem sair da conciliação. Alterar o valor exige permissão dedicada.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {isLoading || !data ? (
                    <div className="py-8 flex justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary"/>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 py-1">
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Descrição
                            <input
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                className="mt-1 w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                            />
                        </label>
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Vencimento
                            <input
                                type="date"
                                value={vencimento}
                                onChange={(e) => setVencimento(e.target.value)}
                                className="mt-1 w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                            />
                        </label>
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Valor
                            <input
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                disabled={!canAlterarValor}
                                title={
                                    canAlterarValor
                                        ? undefined
                                        : "Sem permissão financeiro:lancamentos:alterar_valor"
                                }
                                className="mt-1 w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            {!canAlterarValor && (
                                <span className="block mt-1 text-[10px] text-amber-300/80 normal-case tracking-normal">
                                    Sem permissão para alterar valor - demais campos liberados.
                                </span>
                            )}
                        </label>
                    </div>
                )}

                <AlertDialogFooter className="gap-2 flex-row">
                    <button
                        type="button"
                        onClick={() => void handleRequestClose()}
                        className="flex-1 px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={mutation.isPending || isLoading}
                        onClick={() => mutation.mutate()}
                        className="flex-1 px-3 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold disabled:opacity-40"
                    >
                        {mutation.isPending ? "Salvando…" : "Salvar"}
                    </button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <ConfirmDialog {...ConfirmDialogProps} />
        </>
    );
}
