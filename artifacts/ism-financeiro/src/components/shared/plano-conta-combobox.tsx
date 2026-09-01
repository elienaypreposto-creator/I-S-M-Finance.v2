import {useMemo, useState} from "react";
import {Search} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";

export type PlanoContaOption = {
    id: number;
    tipo?: string;
    categoria: string;
    subcategoria: string | null;
};

export function normalizePlanoSearch(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

export function filterPlanoContas(
    itens: PlanoContaOption[],
    rawQuery: string,
): PlanoContaOption[] {
    const q = normalizePlanoSearch(rawQuery);
    if (!q) return itens;

    const categoriasQueCasam = new Set<string>();
    for (const p of itens) {
        if (normalizePlanoSearch(p.categoria).includes(q)) {
            categoriasQueCasam.add(normalizePlanoSearch(p.categoria));
        }
    }

    return itens.filter((p) => {
        const cat = normalizePlanoSearch(p.categoria);
        if (categoriasQueCasam.has(cat)) return true;
        const sub = normalizePlanoSearch(p.subcategoria ?? "");
        return sub.includes(q) || `${cat} ${sub}`.includes(q);
    });
}

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

    const options = useMemo(
        () => filterPlanoContas(planoContas, searchTerm),
        [planoContas, searchTerm],
    );
    const grupos = useMemo(() => groupPlanoContasPorCategoria(options), [options]);
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
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
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

                        {grupos.length === 0 ? (
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
