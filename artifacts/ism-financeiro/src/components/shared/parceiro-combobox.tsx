import {useState} from "react";
import {Edit2, Plus, Search} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import type {ParceiroRow} from "@/pages/cadastros/parceiros";

type ParceiroComboboxProps = {
    value: string;
    onChange: (v: string) => void;
    parceiros: ParceiroRow[];
    search: string;
    onSearchChange: (s: string) => void;
    onEdit: (p: ParceiroRow) => void;
    onCreateNew: () => void;
    isLoading?: boolean;
};

export function ParceiroCombobox({
                                     value,
                                     onChange,
                                     parceiros,
                                     search,
                                     onSearchChange,
                                     onEdit,
                                     onCreateNew,
                                     isLoading = false,
                                 }: ParceiroComboboxProps) {
    const [open, setOpen] = useState(false);

    const handleOpenChange = (o: boolean) => {
        setOpen(o);
        if (!o) onSearchChange("");
    };

    const selected = parceiros.find((p) => String(p.id) === value);

    const badgeCls = (tipoPessoa: string) =>
        `text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
            tipoPessoa === "PJ" ? "bg-primary/20 text-primary" : "bg-teal-500/20 text-teal-400"
        }`;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between hover:border-white/20 transition-all"
                >
                    {selected ? (
                        <span className="text-white flex items-center gap-2 min-w-0">
                            <span className={badgeCls(selected.tipo_pessoa)}>{selected.tipo_pessoa}</span>
                            <span className="truncate">{selected.nome}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground/40">Selecione o cliente/fornecedor...</span>
                    )}
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
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Buscar por nome..."
                            className="bg-transparent text-sm text-white outline-none w-full placeholder:text-muted-foreground/40"
                        />
                    </div>
                </div>

                <div className="max-h-56 overflow-y-auto">
                    {isLoading ? (
                        <p className="px-4 py-3 text-xs text-muted-foreground text-center animate-pulse">Buscando...</p>
                    ) : parceiros.length === 0 ? (
                        <>
                            <p className="px-4 py-3 text-xs text-muted-foreground text-center">
                                {search ? `Nenhum resultado para "${search}"` : "Nenhum parceiro encontrado"}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange("");
                                    setOpen(false);
                                }}
                                className="w-full text-left px-4 py-2.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors italic"
                            >
                                Nenhum (sem parceiro)
                            </button>
                        </>
                    ) : (
                        parceiros.map((p) => (
                            <div
                                key={p.id}
                                className={`flex items-center justify-between px-4 py-2.5 transition-colors cursor-pointer hover:bg-white/5 ${
                                    String(p.id) === value ? "bg-primary/10" : ""
                                }`}
                                onClick={() => {
                                    onChange(String(p.id));
                                    setOpen(false);
                                }}
                            >
                                <span
                                    className={`text-sm flex items-center gap-2 min-w-0 ${String(p.id) === value ? "text-primary" : "text-white"}`}>
                                    <span className={badgeCls(p.tipo_pessoa)}>{p.tipo_pessoa}</span>
                                    <span className="truncate">{p.nome}</span>
                                </span>
                                <button
                                    type="button"
                                    title="Editar parceiro"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onEdit(p);
                                        setOpen(false);
                                    }}
                                    className="ml-2 p-1 shrink-0 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                                >
                                    <Edit2 className="w-3.5 h-3.5"/>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-2 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => {
                            onCreateNew();
                            setOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-primary/10 rounded-lg font-semibold transition-all"
                    >
                        <Plus className="w-3.5 h-3.5"/>
                        Cadastrar Novo Cliente/Fornecedor
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
