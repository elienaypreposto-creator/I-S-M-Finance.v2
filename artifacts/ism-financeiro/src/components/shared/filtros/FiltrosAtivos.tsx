import {useId, type ReactNode} from "react";
import {X} from "lucide-react";
import {cn} from "@/lib/utils";
import type {ChipFiltro} from "./filtros-core";
import {FOCO_VISIVEL} from "./FiltrosPopover";

type FiltrosAtivosProps = {
    chips: ChipFiltro[];
    onRemover: (chave: string) => void;
    onLimparTodos: () => void;
    /** Resumo do resultado à direita (ex.: quantidade e totais). */
    resumo?: ReactNode;
    /** Frase anunciada aos leitores de tela quando o resultado muda ("12 lançamentos encontrados"). */
    anuncio?: string;
    className?: string;
};

/** Linha "Filtros ativos" com um chip removível por filtro e "Limpar todos". */
export function FiltrosAtivos({chips, onRemover, onLimparTodos, resumo, anuncio, className}: FiltrosAtivosProps) {
    const rotuloId = useId();
    const mostrarLinha = chips.length > 0 || Boolean(resumo);
    return (
        <>
            <p className="sr-only" aria-live="polite" aria-atomic="true">{anuncio ?? ""}</p>
            {mostrarLinha && (
                <div
                    className={cn(
                        "px-4 py-2 border-b border-white/5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs",
                        className,
                    )}
                >
                    {chips.length > 0 && (
                        <>
                            <span className="text-muted-foreground" id={rotuloId}>Filtros ativos:</span>
                            <ul className="flex flex-wrap items-center gap-2" aria-labelledby={rotuloId}>
                                {chips.map((chip) => (
                                    <li key={chip.chave}>
                                        <button
                                            type="button"
                                            onClick={() => onRemover(chip.chave)}
                                            aria-label={`Remover filtro ${chip.rotulo}: ${chip.texto}`}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 max-w-[320px] text-xs pl-3 pr-2 py-1 rounded-full border border-primary/50 bg-primary/15 text-white hover:bg-primary/25",
                                                FOCO_VISIVEL,
                                            )}
                                        >
                                            <span className="truncate">
                                                <span className="font-bold">{chip.rotulo}:</span> {chip.texto}
                                            </span>
                                            <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true"/>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <button
                                type="button"
                                onClick={onLimparTodos}
                                className={cn("text-xs font-semibold text-sky-300 hover:underline rounded px-1", FOCO_VISIVEL)}
                            >
                                Limpar todos
                            </button>
                        </>
                    )}
                    {resumo && <div className="ml-auto text-muted-foreground">{resumo}</div>}
                </div>
            )}
        </>
    );
}
