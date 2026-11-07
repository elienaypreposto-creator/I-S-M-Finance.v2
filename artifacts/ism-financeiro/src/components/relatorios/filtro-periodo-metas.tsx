import {useId, useState} from "react";
import {ChevronDown} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Checkbox} from "@/components/ui/checkbox";
import {SelectCampo} from "@/components/ui/select-campo";
import {FOCO_VISIVEL} from "@/components/shared/filtros";
import {cn} from "@/lib/utils";
import {
    alternarPeriodo,
    ehVisao,
    periodosDaVisao,
    resumoDaSelecao,
    selecaoPadrao,
    todosMarcados,
    VISOES,
    type SelecaoPeriodo,
} from "@/lib/periodo-metas";

type Props = {
    selecao: SelecaoPeriodo;
    onChange: (selecao: SelecaoPeriodo) => void;
    /** Mês (1–12) usado como padrão ao trocar de visão. */
    mesReferencia: number;
};

/**
 * Filtro de período do Relatório de Metas: visão (ano / semestre / trimestre / mês)
 * + lista suspensa com caixas de seleção para marcar um ou mais períodos.
 */
export function FiltroPeriodoMetas({selecao, onChange, mesReferencia}: Props) {
    const [aberto, setAberto] = useState(false);
    const baseId = useId();
    const periodos = periodosDaVisao(selecao.visao);
    const tudo = todosMarcados(selecao);

    return (
        <>
            <label htmlFor={`${baseId}-visao`} className="text-xs text-muted-foreground whitespace-nowrap">
                Visão
            </label>
            <SelectCampo
                id={`${baseId}-visao`}
                value={selecao.visao}
                onChange={(v) => {
                    if (!ehVisao(v) || v === selecao.visao) return;
                    onChange(selecaoPadrao(v, mesReferencia));
                }}
                className="w-[9.5em]"
                opcoes={VISOES.map((v) => ({value: v.valor, label: v.rotulo}))}
            />

            {selecao.visao !== "ano" && (
                <Popover open={aberto} onOpenChange={setAberto}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label={`Períodos: ${resumoDaSelecao(selecao)}`}
                            className={cn(
                                "inline-flex items-center justify-between gap-2 min-w-[9.5em] max-w-full",
                                "h-[3.4em] md:h-[2.9em] bg-[#1a1c23] border border-white/10 rounded-[0.7em] px-[0.95em] text-[0.93em] text-white",
                                "transition-colors hover:border-white/20",
                                FOCO_VISIVEL,
                            )}
                        >
                            <span className="truncate">{resumoDaSelecao(selecao)}</span>
                            <ChevronDown className="w-[1em] h-[1em] opacity-70 shrink-0" aria-hidden="true"/>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        sideOffset={6}
                        collisionPadding={16}
                        className={cn(
                            "p-0 bg-card border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
                            selecao.visao === "mes" ? "w-[min(18rem,calc(100vw-32px))]" : "w-[min(14rem,calc(100vw-32px))]",
                        )}
                    >
                        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 border-b border-white/5">
                            <span id={`${baseId}-periodos`} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                {VISOES.find((v) => v.valor === selecao.visao)?.rotulo}
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    onChange(
                                        tudo
                                            ? selecaoPadrao(selecao.visao, mesReferencia)
                                            : {visao: selecao.visao, periodos: periodos.map((p) => p.indice)},
                                    )
                                }
                                className={cn("text-xs text-primary hover:underline rounded", FOCO_VISIVEL)}
                            >
                                {tudo ? "Só o atual" : "Marcar todos"}
                            </button>
                        </div>
                        <div
                            role="group"
                            aria-labelledby={`${baseId}-periodos`}
                            className={cn("p-2 gap-0.5", selecao.visao === "mes" ? "grid grid-cols-2" : "flex flex-col")}
                        >
                            {periodos.map((p) => {
                                const marcado = selecao.periodos.includes(p.indice);
                                const unico = marcado && selecao.periodos.length === 1;
                                const idItem = `${baseId}-p${p.indice}`;
                                return (
                                    <label
                                        key={p.indice}
                                        htmlFor={idItem}
                                        className={cn(
                                            "flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-white cursor-pointer hover:bg-white/5",
                                            unico && "cursor-default",
                                        )}
                                        title={unico ? "Pelo menos um período fica marcado" : undefined}
                                    >
                                        <Checkbox
                                            id={idItem}
                                            checked={marcado}
                                            disabled={unico}
                                            onCheckedChange={() => onChange(alternarPeriodo(selecao, p.indice))}
                                            className="touch-target-exempt disabled:opacity-100"
                                        />
                                        {p.rotulo}
                                    </label>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </>
    );
}
