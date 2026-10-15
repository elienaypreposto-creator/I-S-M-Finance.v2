import {useEffect, useId, useRef, useState} from "react";
import {Search, X} from "lucide-react";
import {cn} from "@/lib/utils";
import {FOCO_VISIVEL} from "./FiltrosPopover";

type CampoBuscaProps = {
    /** Valor aplicado (vindo da URL). */
    valor: string;
    /** Chamado após o debounce com o termo final. */
    onBuscar: (termo: string) => void;
    placeholder: string;
    /** Nome acessível do campo. */
    rotulo?: string;
    atrasoMs?: number;
    className?: string;
};

/** Busca padrão das telas (lado direito da barra) com debounce e botão de limpar. */
export function CampoBusca({valor, onBuscar, placeholder, rotulo = "Buscar", atrasoMs = 400, className}: CampoBuscaProps) {
    const [texto, setTexto] = useState(valor);
    const id = useId();
    const onBuscarRef = useRef(onBuscar);
    onBuscarRef.current = onBuscar;
    const ultimoEnviado = useRef(valor);

    // A URL mudou por fora (ex.: "Limpar todos", voltar no histórico): sincroniza o campo.
    useEffect(() => {
        if (valor !== ultimoEnviado.current) {
            ultimoEnviado.current = valor;
            setTexto(valor);
        }
    }, [valor]);

    useEffect(() => {
        const termo = texto.trim();
        if (termo === ultimoEnviado.current) return;
        const t = setTimeout(() => {
            ultimoEnviado.current = termo;
            onBuscarRef.current(termo);
        }, atrasoMs);
        return () => clearTimeout(t);
    }, [texto, atrasoMs]);

    return (
        <div
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background transition-all w-full sm:w-72",
                className,
            )}
        >
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true"/>
            <label htmlFor={id} className="sr-only">{rotulo}</label>
            <input
                id={id}
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={placeholder}
                className="bg-transparent border-none outline-none text-xs w-full min-w-0 placeholder:text-muted-foreground text-white [&::-webkit-search-cancel-button]:hidden"
            />
            {texto && (
                <button
                    type="button"
                    aria-label="Limpar busca"
                    onClick={() => setTexto("")}
                    className={cn("p-0.5 rounded text-muted-foreground hover:text-white", FOCO_VISIVEL)}
                >
                    <X className="w-3.5 h-3.5" aria-hidden="true"/>
                </button>
            )}
        </div>
    );
}
