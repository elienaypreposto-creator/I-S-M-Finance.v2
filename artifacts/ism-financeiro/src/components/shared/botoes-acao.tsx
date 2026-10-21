import type {MouseEventHandler, PointerEventHandler} from "react";
import {Lock, Pencil, Trash2, Unlock} from "lucide-react";
import {cn} from "@/lib/utils";

const editarClass =
    "p-2 bg-white/5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors disabled:opacity-40";
const excluirClass =
    "p-2 bg-white/5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40";

type BotaoAcaoProps = {
    onClick: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    title?: string;
    onPointerDown?: PointerEventHandler<HTMLButtonElement>;
};

export function BotaoEditar({
    onClick,
    disabled,
    title = "Editar",
    onPointerDown,
}: BotaoAcaoProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            onPointerDown={onPointerDown}
            disabled={disabled}
            title={title}
            className={editarClass}
        >
            <Pencil className="w-4 h-4"/>
        </button>
    );
}

export function BotaoExcluir({
    onClick,
    disabled,
    title = "Excluir",
    onPointerDown,
}: BotaoAcaoProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            onPointerDown={onPointerDown}
            disabled={disabled}
            title={title}
            className={excluirClass}
        >
            <Trash2 className="w-4 h-4"/>
        </button>
    );
}

type BotaoBloquearProps = BotaoAcaoProps & {
    bloqueado: boolean;
};

export function BotaoBloquear({
    bloqueado,
    onClick,
    disabled,
    title,
    onPointerDown,
}: BotaoBloquearProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            onPointerDown={onPointerDown}
            disabled={disabled}
            title={title ?? (bloqueado ? "Desbloquear" : "Bloquear")}
            className={cn(
                "p-2 rounded-lg transition-colors disabled:opacity-40",
                bloqueado
                    ? "bg-success/20 text-success hover:bg-success/30"
                    : "bg-white/5 hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400",
            )}
        >
            {bloqueado ? <Unlock className="w-4 h-4"/> : <Lock className="w-4 h-4"/>}
        </button>
    );
}
