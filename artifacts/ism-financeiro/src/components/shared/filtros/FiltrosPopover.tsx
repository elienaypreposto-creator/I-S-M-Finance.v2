import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent} from "react";
import {Check, Filter, Search, X} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {cn} from "@/lib/utils";
import {SelectCampo} from "@/components/ui/select-campo";
import {
    atualizarRascunho,
    contemBusca,
    juntarMulti,
    moedaDigitadaParaUrl,
    moedaUrlParaDigitada,
    opcoesDaDefinicao,
    separarMulti,
    validarFaixa,
    type DefinicaoFiltro,
    type OpcaoFiltro,
    type ValoresFiltros,
} from "./filtros-core";

/** Anel de foco padrão dos controles de filtro (WCAG 2.4.7). */
export const FOCO_VISIVEL =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const CAMPO =
    "w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed";

const ROTULO = "block text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5";

type FiltrosPopoverProps = {
    definicoes: DefinicaoFiltro[];
    /** Valores aplicados (vindos da URL). */
    valores: ValoresFiltros;
    contagem: number;
    onAplicar: (valores: ValoresFiltros) => void;
    className?: string;
};

export function FiltrosPopover({definicoes, valores, contagem, onAplicar, className}: FiltrosPopoverProps) {
    const [aberto, setAberto] = useState(false);
    const [rascunho, setRascunho] = useState<ValoresFiltros>(valores);
    const [faixaDigitada, setFaixaDigitada] = useState<Record<string, string>>({});
    const [erroFaixa, setErroFaixa] = useState<string | null>(null);
    const conteudoRef = useRef<HTMLDivElement>(null);
    const baseId = useId();
    const tituloId = `${baseId}-titulo`;

    const abrirOuFechar = (abrir: boolean) => {
        if (abrir) {
            setRascunho(valores);
            const digitada: Record<string, string> = {};
            for (const def of definicoes) {
                if (def.tipo !== "faixa-moeda") continue;
                for (const k of [`${def.chave}_min`, `${def.chave}_max`]) {
                    digitada[k] = moedaUrlParaDigitada(valores[k]);
                }
            }
            setFaixaDigitada(digitada);
            setErroFaixa(null);
        }
        setAberto(abrir);
    };

    const definir = (chave: string, valor: string) =>
        setRascunho((r) => atualizarRascunho(definicoes, r, chave, valor));

    const aplicar = () => {
        const final: ValoresFiltros = {...rascunho};
        for (const def of definicoes) {
            if (def.tipo !== "faixa-moeda") continue;
            const kMin = `${def.chave}_min`;
            const kMax = `${def.chave}_max`;
            const min = moedaDigitadaParaUrl(faixaDigitada[kMin] ?? "");
            const max = moedaDigitadaParaUrl(faixaDigitada[kMax] ?? "");
            const erro = validarFaixa(min, max);
            if (erro) {
                setErroFaixa(erro);
                conteudoRef.current?.querySelector<HTMLInputElement>(`[data-faixa="${kMax}"]`)?.focus();
                return;
            }
            if (min) final[kMin] = min;
            else delete final[kMin];
            if (max) final[kMax] = max;
            else delete final[kMax];
        }
        onAplicar(final);
        setAberto(false);
    };

    const limparRascunho = () => {
        setRascunho({});
        setFaixaDigitada({});
        setErroFaixa(null);
    };

    const aoTeclar = (e: KeyboardEvent<HTMLFormElement>) => {
        if (e.key !== "Enter" || e.defaultPrevented) return;
        const alvo = e.target as HTMLElement;
        // Botões (chips, Cancelar, Limpar) mantêm o comportamento nativo do Enter.
        if (alvo.tagName === "BUTTON" || alvo.tagName === "TEXTAREA") return;
        e.preventDefault();
        aplicar();
    };

    const rotuloBotao = contagem > 0
        ? `Filtros, ${contagem} ${contagem === 1 ? "ativo" : "ativos"}`
        : "Filtros, nenhum ativo";

    return (
        <Popover open={aberto} onOpenChange={abrirOuFechar} modal>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={rotuloBotao}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors",
                        contagem > 0
                            ? "bg-primary/15 border-primary/50 text-primary"
                            : "bg-black/20 border-white/10 text-white hover:bg-white/5 hover:border-white/20",
                        FOCO_VISIVEL,
                        className,
                    )}
                >
                    <Filter className="w-3.5 h-3.5" aria-hidden="true"/>
                    Filtros
                    {contagem > 0 && (
                        <span
                            aria-hidden="true"
                            className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center"
                        >
                            {contagem}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                ref={conteudoRef}
                align="start"
                sideOffset={8}
                collisionPadding={16}
                aria-labelledby={tituloId}
                className="p-0 w-[min(560px,calc(100vw-32px))] bg-card border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    const primeiro = conteudoRef.current?.querySelector<HTMLElement>(
                        "[data-campo-filtro]:not([disabled])",
                    );
                    primeiro?.focus();
                }}
                onEscapeKeyDown={(e) => {
                    // Esc dentro de um combobox aberto fecha só a lista.
                    const alvo = document.activeElement as HTMLElement | null;
                    if (alvo?.getAttribute("role") === "combobox" && alvo.getAttribute("aria-expanded") === "true") {
                        e.preventDefault();
                    }
                }}
                onFocusOutside={(e) => {
                    const alvo = e.target instanceof Element ? e.target : null;
                    if (alvo?.closest("[data-radix-select-content]")) e.preventDefault();
                }}
                onInteractOutside={(e) => {
                    const alvo = e.target instanceof Element ? e.target : null;
                    if (alvo?.closest("[data-radix-select-content]")) e.preventDefault();
                }}
            >
                <form
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        aplicar();
                    }}
                    onKeyDown={aoTeclar}
                >
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                        <h2 id={tituloId} className="text-sm font-bold text-white">Filtros</h2>
                        <p className="text-[11px] text-muted-foreground">Esc fecha · Enter aplica</p>
                    </div>

                    <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                        {definicoes.map((def) => {
                            const idCampo = `${baseId}-${def.chave}`;
                            const pai = def.dependeDe ? rascunho[def.dependeDe] : undefined;
                            const desabilitado = Boolean(def.dependeDe) && !pai;
                            const opcoes = opcoesDaDefinicao(def, rascunho);

                            if (def.tipo === "multi") {
                                return (
                                    <CampoMulti
                                        key={def.chave}
                                        id={idCampo}
                                        def={def}
                                        opcoes={opcoes}
                                        valor={rascunho[def.chave]}
                                        onChange={(v) => definir(def.chave, v)}
                                    />
                                );
                            }
                            if (def.tipo === "faixa-moeda") {
                                const kMin = `${def.chave}_min`;
                                const kMax = `${def.chave}_max`;
                                return (
                                    <fieldset key={def.chave} className="min-w-0">
                                        <legend className={ROTULO}>{def.rotulo}</legend>
                                        <div className="flex items-center gap-2">
                                            <label htmlFor={`${idCampo}-min`} className="sr-only">Valor mínimo</label>
                                            <input
                                                id={`${idCampo}-min`}
                                                data-campo-filtro
                                                data-faixa={kMin}
                                                type="text"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="Mín. 0,00"
                                                value={faixaDigitada[kMin] ?? ""}
                                                aria-invalid={Boolean(erroFaixa)}
                                                aria-describedby={erroFaixa ? `${idCampo}-erro` : undefined}
                                                onChange={(e) => {
                                                    setErroFaixa(null);
                                                    setFaixaDigitada((f) => ({...f, [kMin]: e.target.value}));
                                                }}
                                                className={cn(CAMPO, FOCO_VISIVEL, "min-w-0")}
                                            />
                                            <span className="text-muted-foreground text-xs" aria-hidden="true">a</span>
                                            <label htmlFor={`${idCampo}-max`} className="sr-only">Valor máximo</label>
                                            <input
                                                id={`${idCampo}-max`}
                                                data-faixa={kMax}
                                                type="text"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="Máx. 0,00"
                                                value={faixaDigitada[kMax] ?? ""}
                                                aria-invalid={Boolean(erroFaixa)}
                                                aria-describedby={erroFaixa ? `${idCampo}-erro` : undefined}
                                                onChange={(e) => {
                                                    setErroFaixa(null);
                                                    setFaixaDigitada((f) => ({...f, [kMax]: e.target.value}));
                                                }}
                                                className={cn(CAMPO, FOCO_VISIVEL, "min-w-0")}
                                            />
                                        </div>
                                        {erroFaixa && (
                                            <p id={`${idCampo}-erro`} role="alert" className="mt-1 text-[11px] text-red-300">
                                                {erroFaixa}
                                            </p>
                                        )}
                                    </fieldset>
                                );
                            }
                            if (def.tipo === "select") {
                                return (
                                    <div key={def.chave} className="min-w-0">
                                        <label htmlFor={idCampo} className={ROTULO}>{def.rotulo}</label>
                                        <SelectCampo
                                            id={idCampo}
                                            campoFiltro
                                            value={rascunho[def.chave] ?? ""}
                                            disabled={desabilitado}
                                            permitirVazio
                                            placeholder={desabilitado
                                                ? def.placeholderDependente ?? "Selecione antes o filtro anterior"
                                                : def.placeholder ?? "Todos"}
                                            onChange={(v) => definir(def.chave, v)}
                                            opcoes={opcoes.map((o) => ({value: o.valor, label: o.rotulo}))}
                                        />
                                    </div>
                                );
                            }
                            return (
                                <CampoCombobox
                                    key={def.chave}
                                    id={idCampo}
                                    def={def}
                                    opcoes={opcoes}
                                    valor={rascunho[def.chave] ?? ""}
                                    desabilitado={desabilitado}
                                    onChange={(v) => definir(def.chave, v)}
                                />
                            );
                        })}
                    </div>

                    <div className="sticky bottom-0 bg-card flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-white/10">
                        <button
                            type="button"
                            onClick={limparRascunho}
                            className={cn("text-xs font-semibold text-sky-300 hover:underline rounded px-1 py-1", FOCO_VISIVEL)}
                        >
                            Limpar filtros
                        </button>
                        <div className="flex items-center gap-2 ml-auto">
                            <button
                                type="button"
                                onClick={() => setAberto(false)}
                                className={cn(
                                    "px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-white hover:bg-white/10",
                                    FOCO_VISIVEL,
                                )}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className={cn(
                                    "px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90",
                                    FOCO_VISIVEL,
                                )}
                            >
                                Aplicar filtros
                            </button>
                        </div>
                    </div>
                </form>
            </PopoverContent>
        </Popover>
    );
}

// ── Campos ───────────────────────────────────────────────────────────────────

function CampoMulti({
                        id,
                        def,
                        opcoes,
                        valor,
                        onChange,
                    }: {
    id: string;
    def: DefinicaoFiltro;
    opcoes: OpcaoFiltro[];
    valor: string | undefined;
    onChange: (valor: string) => void;
}) {
    const selecionados = separarMulti(valor);
    const alternar = (v: string) => {
        const proximo = selecionados.includes(v) ? selecionados.filter((s) => s !== v) : [...selecionados, v];
        // Mantém a ordem das opções para a URL e os chips ficarem estáveis.
        onChange(juntarMulti(opcoes.map((o) => o.valor).filter((o) => proximo.includes(o))));
    };
    return (
        <div role="group" aria-labelledby={`${id}-rotulo`} className="sm:col-span-2 min-w-0">
            <span id={`${id}-rotulo`} className={ROTULO}>{def.rotulo}</span>
            <div className="flex flex-wrap gap-2">
                {opcoes.map((o, i) => {
                    const marcado = selecionados.includes(o.valor);
                    return (
                        <button
                            key={o.valor}
                            type="button"
                            role="checkbox"
                            aria-checked={marcado}
                            data-campo-filtro={i === 0 ? true : undefined}
                            onClick={() => alternar(o.valor)}
                            className={cn(
                                "inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors",
                                marcado
                                    ? "bg-primary/20 border-primary text-sky-200"
                                    : "bg-black/20 border-white/15 text-white/80 hover:border-white/30",
                                FOCO_VISIVEL,
                            )}
                        >
                            {marcado && <Check className="w-3.5 h-3.5" aria-hidden="true"/>}
                            {o.rotulo}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

const MAX_OPCOES_COMBOBOX = 100;

function CampoCombobox({
                           id,
                           def,
                           opcoes,
                           valor,
                           desabilitado,
                           onChange,
                       }: {
    id: string;
    def: DefinicaoFiltro;
    opcoes: OpcaoFiltro[];
    valor: string;
    desabilitado: boolean;
    onChange: (valor: string) => void;
}) {
    const [aberto, setAberto] = useState(false);
    const [texto, setTexto] = useState("");
    const [ativo, setAtivo] = useState(0);
    const listaId = `${id}-lista`;
    const selecionado = opcoes.find((o) => o.valor === valor);

    const filtradas = useMemo(
        () => opcoes.filter((o) => contemBusca(texto, o.rotulo, o.grupo)).slice(0, MAX_OPCOES_COMBOBOX),
        [opcoes, texto],
    );

    useEffect(() => {
        if (!aberto) return;
        document.getElementById(`${listaId}-${ativo}`)?.scrollIntoView({block: "nearest"});
    }, [aberto, ativo, listaId]);

    const escolher = (o: OpcaoFiltro) => {
        onChange(o.valor);
        setAberto(false);
        setTexto("");
    };

    const abrir = () => {
        if (desabilitado) return;
        setAberto(true);
        setTexto("");
        setAtivo(Math.max(0, filtradas.findIndex((o) => o.valor === valor)));
    };

    const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!aberto) abrir();
            else setAtivo((a) => Math.min(a + 1, filtradas.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => Math.max(a - 1, 0));
        } else if (e.key === "Enter" && aberto) {
            // Enter escolhe a opção destacada em vez de aplicar o painel.
            e.preventDefault();
            const o = filtradas[ativo];
            if (o) escolher(o);
            else setAberto(false);
        } else if (e.key === "Escape" && aberto) {
            setAberto(false);
            setTexto("");
        }
    };

    return (
        <div className="min-w-0">
            <label htmlFor={id} className={ROTULO}>{def.rotulo}</label>
            <div className="relative">
                <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                />
                <input
                    id={id}
                    data-campo-filtro
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={aberto}
                    aria-controls={listaId}
                    aria-activedescendant={aberto && filtradas[ativo] ? `${listaId}-${ativo}` : undefined}
                    disabled={desabilitado}
                    placeholder={def.placeholder ?? "Buscar…"}
                    value={aberto ? texto : selecionado?.rotulo ?? ""}
                    onChange={(e) => {
                        setTexto(e.target.value);
                        setAtivo(0);
                        if (!aberto) setAberto(true);
                    }}
                    onClick={() => (aberto ? undefined : abrir())}
                    onKeyDown={aoTeclar}
                    onBlur={() => {
                        setAberto(false);
                        setTexto("");
                    }}
                    className={cn(CAMPO, FOCO_VISIVEL, "pl-8", valor ? "pr-8" : "")}
                />
                {valor && !desabilitado && (
                    <button
                        type="button"
                        aria-label={`Limpar ${def.rotulo}`}
                        onClick={() => onChange("")}
                        className={cn(
                            "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-white",
                            FOCO_VISIVEL,
                        )}
                    >
                        <X className="w-3.5 h-3.5" aria-hidden="true"/>
                    </button>
                )}
                <ul
                    id={listaId}
                    role="listbox"
                    aria-label={def.rotulo}
                    hidden={!aberto}
                    className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-card shadow-2xl py-1"
                >
                    {filtradas.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground" role="presentation">
                            Nenhum resultado
                        </li>
                    ) : (
                        filtradas.map((o, i) => (
                            <li
                                key={o.valor}
                                id={`${listaId}-${i}`}
                                role="option"
                                aria-selected={o.valor === valor}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => escolher(o)}
                                onMouseEnter={() => setAtivo(i)}
                                className={cn(
                                    "px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2",
                                    i === ativo ? "bg-white/10 text-white" : "text-white/80",
                                )}
                            >
                                <span className="truncate">{o.rotulo}</span>
                                {o.valor === valor && <Check className="w-3.5 h-3.5 shrink-0 text-sky-300" aria-hidden="true"/>}
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </div>
    );
}
