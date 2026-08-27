import {useEffect, useState} from "react";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogFooter,
    AlertDialogDescription,
} from "@/components/ui/dialog";
import {Ban} from "lucide-react";

export type MotivoIgnorarPayload = {
    motivo_codigo?: string;
    motivo?: string;
};

type Props = {
    open: boolean;
    /** Quando true (parametro do sistema), o textarea passa a ser obrigatório. */
    obrigatorio?: boolean;
    pending?: boolean;
    onClose: () => void;
    onConfirm: (payload: MotivoIgnorarPayload) => void;
};

/** Modal de confirmação para ignorar linha — motivo opcional (ou obrigatório se parametro ativo). */
export function IgnorarLinhaModal({open, obrigatorio = false, pending, onClose, onConfirm}: Props) {
    const [motivo, setMotivo] = useState("");

    useEffect(() => {
        if (open) setMotivo("");
    }, [open]);

    const podeConfirmar = !obrigatorio || motivo.trim().length > 0;

    return (
        <AlertDialog
            open={open}
            onOpenChange={(v) => {
                if (!v) onClose();
            }}
        >
            <AlertDialogContent className="sm:max-w-md bg-card border border-white/10 text-white rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-base">
                        <Ban className="w-4 h-4 text-amber-300"/>
                        Ignorar movimentação
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-muted-foreground">
                        Esta linha não será conciliada. Você poderá reverter depois, sem precisar informar motivo.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <label className="text-[10px] uppercase tracking-wide text-muted-foreground block">
                    Motivo {obrigatorio ? "(obrigatório)" : "(opcional)"}
                    <textarea
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="Ex.: transferência entre contas próprias, duplicado…"
                        className="mt-1.5 w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white resize-none placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                    />
                </label>

                <AlertDialogFooter className="gap-2 sm:gap-2 flex-row">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={!podeConfirmar || pending}
                        onClick={() =>
                            onConfirm({
                                motivo: motivo.trim() || undefined,
                            })
                        }
                        className="flex-1 px-3 py-2.5 rounded-xl bg-amber-500/90 hover:bg-amber-500 text-black text-xs font-bold disabled:opacity-40"
                    >
                        Confirmar ignorar
                    </button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
