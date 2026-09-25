import {useState} from "react";
import {Building2, Check, ChevronsUpDown, Loader2} from "lucide-react";
import {useAuth} from "@/hooks/use-auth";
import {nomeEmpresa} from "@/lib/tenant-query";
import {useToast} from "@/hooks/use-toast";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";

export function EmpresaSwitcher() {
    const {empresaAtiva, empresas, switchEmpresa} = useAuth();
    const {toast} = useToast();
    const [open, setOpen] = useState(false);
    const [pendingId, setPendingId] = useState<number | null>(null);

    const nome = empresaAtiva?.nome ?? "Sem empresa";
    const podeTrocar = empresas.length > 1;

    async function handleSwitch(id: number) {
        if (id === empresaAtiva?.id || pendingId !== null) return;
        setPendingId(id);
        try {
            await switchEmpresa(id);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Não foi possível trocar de empresa.";
            toast({variant: "destructive", title: "Troca de empresa", description: message});
            setPendingId(null);
        }
    }

    return (
        <div className="flex items-center min-w-0">
            {podeTrocar ? (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            title="Trocar de empresa"
                            className="flex items-center gap-2 max-w-[16rem] md:max-w-xs rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-left transition-colors"
                        >
                            <Building2 className="w-4 h-4 text-primary shrink-0"/>
                            <span className="min-w-0">
                                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">
                                    Empresa
                                </span>
                                <span className="block text-sm font-semibold text-foreground truncate mt-0.5">
                                    {nome}
                                </span>
                            </span>
                            <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0"/>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-1 bg-card border-white/10">
                        <ul className="max-h-72 overflow-y-auto">
                            {empresas.map((empresa) => {
                                const ativa = empresa.id === empresaAtiva?.id;
                                const emCurso = pendingId === empresa.id;
                                return (
                                    <li key={empresa.id}>
                                        <button
                                            type="button"
                                            disabled={pendingId !== null}
                                            onClick={() => void handleSwitch(empresa.id)}
                                            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-medium text-foreground truncate">
                                                    {nomeEmpresa(empresa)}
                                                </span>
                                                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                                                    {empresa.papel}
                                                </span>
                                            </span>
                                            {emCurso ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-primary"/>
                                            ) : ativa ? (
                                                <Check className="w-4 h-4 text-primary"/>
                                            ) : null}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </PopoverContent>
                </Popover>
            ) : (
                <div
                    className="flex items-center gap-2 max-w-[16rem] md:max-w-xs rounded-xl border border-white/10 bg-white/5 px-3 py-1.5"
                    title={nome}
                >
                    <Building2 className="w-4 h-4 text-primary shrink-0"/>
                    <span className="min-w-0">
                        <span className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none">
                            Empresa
                        </span>
                        <span className="block text-sm font-semibold text-foreground truncate mt-0.5">
                            {nome}
                        </span>
                    </span>
                </div>
            )}
        </div>
    );
}
