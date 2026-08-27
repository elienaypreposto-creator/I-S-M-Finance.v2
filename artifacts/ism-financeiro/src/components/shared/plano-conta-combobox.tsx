import {useEffect, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Search} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {fetchApiData} from "@/lib/api-config";

export type PlanoContaOption = {
    id: number;
    tipo?: string;
    categoria: string;
    subcategoria: string | null;
};

function groupPlanoContasPorCategoria(itens: PlanoContaOption[]): { categoria: string; itens: PlanoContaOption[] }[] {
    const map = new Map<string, PlanoContaOption[]>();
    for (const item of itens) {
        const lista = map.get(item.categoria) ?? [];
        lista.push(item);
        map.set(item.categoria, lista);
    }
    return Array.from(map.entries()).map(([categoria, grupoItens]) => ({categoria, itens: grupoItens}));
}

type PlanoContaComboboxProps = {
    value: string;
    onChange: (v: string) => void;
    planoContas: PlanoContaOption[];
    error?: string;
};

export function PlanoContaCombobox({
                                       value,
                                       onChange,
                                       planoContas,
                                       error,
                                   }: PlanoContaComboboxProps) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 200);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const shouldSearchServer = debouncedSearch.length >= 3;

    const {data: searchResults, isFetching} = useQuery<PlanoContaOption[]>({
        queryKey: ["plano-contas-search", debouncedSearch],
        queryFn: () => fetchApiData<PlanoContaOption[]>(`/plano-contas?search=${encodeURIComponent(debouncedSearch)}`),
        enabled: shouldSearchServer,
    });

    const localFiltered = searchTerm.trim().length === 0
        ? planoContas
        : planoContas.filter((p) => {
            const haystack = `${p.categoria} ${p.subcategoria ?? ""}`.toLowerCase();
            return haystack.includes(searchTerm.trim().toLowerCase());
        });

    const options = shouldSearchServer ? (searchResults ?? []) : localFiltered;
    const grupos = groupPlanoContasPorCategoria(options);
    const selected = planoContas.find((p) => String(p.id) === value)
        ?? options.find((p) => String(p.id) === value);

    const handleOpenChange = (o: boolean) => {
        setOpen(o);
        if (!o) setSearchTerm("");
    };

    const handleSelect = (p: PlanoContaOption) => {
        onChange(String(p.id));
        setOpen(false);
        setSearchTerm("");
    };

    return (
        <div>
            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={`w-full bg-[#1a1c23] border rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between hover:border-white/20 transition-all ${
                            error ? "border-red-500/60" : "border-white/10"
                        }`}
                    >
                        <span className={selected ? "text-white truncate" : "text-muted-foreground/40"}>
                            {selected
                                ? `${selected.categoria}${selected.subcategoria ? ` - ${selected.subcategoria}` : ""}`
                                : "Indique a categoria contábil..."}
                        </span>
                        <Search className="w-4 h-4 text-muted-foreground shrink-0 ml-2"/>
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    sideOffset={4}
                    className="p-0 bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl"
                    style={{width: "var(--radix-popover-trigger-width)"}}
                >
                    <div className="p-3 border-b border-white/5">
                        <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                            <Search className="w-4 h-4 text-muted-foreground shrink-0"/>
                            <input
                                autoFocus
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar categoria ou subcategoria..."
                                className="bg-transparent text-sm text-white outline-none w-full placeholder:text-muted-foreground/40"
                            />
                        </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setOpen(false);
                                setSearchTerm("");
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            Indique a categoria contábil...
                        </button>

                        {shouldSearchServer && isFetching ? (
                            <p className="px-4 py-3 text-xs text-muted-foreground text-center animate-pulse">Buscando...</p>
                        ) : grupos.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-muted-foreground text-center">Nenhuma categoria
                                encontrada.</p>
                        ) : (
                            grupos.map((grupo) => (
                                <div key={grupo.categoria} className="py-1">
                                    <p className="px-4 py-1 text-[11px] font-bold text-white uppercase tracking-wide">
                                        {grupo.categoria}
                                    </p>
                                    {grupo.itens.map((item) => {
                                        const isSelected = String(item.id) === value;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleSelect(item)}
                                                className={`w-full text-left pl-8 pr-4 py-1.5 text-xs transition-colors ${
                                                    isSelected
                                                        ? "bg-primary/10 text-primary font-semibold"
                                                        : "text-white/70 hover:bg-white/5"
                                                }`}
                                            >
                                                {item.subcategoria || item.categoria}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>
            {error && <p className="text-[10px] text-destructive mt-1 font-medium">{error}</p>}
        </div>
    );
}
