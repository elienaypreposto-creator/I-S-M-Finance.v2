import {tenantQueryKey} from "@/lib/tenant-query";
import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    Modal,
    ModalBody,
    ModalFooter,
    ModalForm,
    ModalHeader,
    ModalSpinner,
    modalBtnPrimaryCls,
    modalBtnSecondaryCls,
    modalGridCls,
} from "@/components/ui/modal-responsivo";
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

/** Edição a partir da conciliação. Valor só com permissão alterar_valor. */
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
        queryKey: tenantQueryKey("lancamento-edit-conciliacao", lancamentoId),
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
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("conciliacao")});
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

    const labelCls = "block text-xs uppercase tracking-wide text-muted-foreground mb-1.5";
    const inputCls = "w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed";

    return (
        <Modal open={open} onClose={() => void handleRequestClose()}>
            <ModalHeader
                icon={<Pencil className="w-[1.2em] h-[1.2em] text-primary"/>}
                title={`Editar lançamento #${lancamentoId}`}
                description="Corrija cadastro errado sem sair da conciliação. Alterar o valor exige permissão dedicada."
            />
            <ModalForm
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!mutation.isPending && !isLoading) mutation.mutate();
                }}
            >
                <ModalBody>
                    {isLoading || !data ? (
                        <div className="py-8 flex justify-center" role="status">
                            <Loader2 aria-hidden="true" className="w-6 h-6 animate-spin text-primary"/>
                            <span className="sr-only">Carregando…</span>
                        </div>
                    ) : (
                        <div className={modalGridCls}>
                            <div>
                                <label htmlFor="editar-lanc-descricao" className={labelCls}>Descrição</label>
                                <input
                                    id="editar-lanc-descricao"
                                    value={descricao}
                                    onChange={(e) => setDescricao(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="editar-lanc-vencimento" className={labelCls}>Vencimento</label>
                                <input
                                    id="editar-lanc-vencimento"
                                    type="date"
                                    value={vencimento}
                                    onChange={(e) => setVencimento(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="editar-lanc-valor" className={labelCls}>Valor</label>
                                <input
                                    id="editar-lanc-valor"
                                    value={valor}
                                    onChange={(e) => setValor(e.target.value)}
                                    disabled={!canAlterarValor}
                                    aria-describedby={canAlterarValor ? undefined : "editar-lanc-valor-aviso"}
                                    title={
                                        canAlterarValor
                                            ? undefined
                                            : "Sem permissão financeiro:lancamentos:alterar_valor"
                                    }
                                    className={inputCls}
                                />
                                {!canAlterarValor && (
                                    <span id="editar-lanc-valor-aviso" className="block mt-1 text-xs text-amber-300/80">
                                        Sem permissão para alterar valor - demais campos liberados.
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </ModalBody>
                <ModalFooter hint="Esc fecha">
                    <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
                        Cancelar
                    </button>
                    <button type="submit" disabled={mutation.isPending || isLoading} className={modalBtnPrimaryCls}>
                        {mutation.isPending ? <ModalSpinner/> : "Salvar"}
                    </button>
                </ModalFooter>
            </ModalForm>
            <ConfirmDialog {...ConfirmDialogProps} />
        </Modal>
    );
}
