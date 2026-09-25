import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Loader2, Unlink, X} from "lucide-react";
import {fetchApiData} from "@/lib/api-config";
import {nomeEmpresa, tenantQueryKey} from "@/lib/tenant-query";
import {useToast} from "@/hooks/use-toast";
import {ViewportOverlay} from "@/components/shared/viewport-overlay";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";

type VinculoRow = {
    id: number;
    usuario_id: number;
    empresa_id: number;
    papel: "admin" | "membro";
    ativo: boolean;
    razao_social: string;
    nome_fantasia: string | null;
    slug: string;
};

type EmpresaOpt = {
    id: number;
    razao_social: string;
    nome_fantasia: string | null;
    slug: string;
    ativa: boolean;
};

export function UsuarioEmpresasModal({
    usuarioId,
    usuarioNome,
    onClose,
}: {
    usuarioId: number;
    usuarioNome: string;
    onClose: () => void;
}) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [empresaId, setEmpresaId] = useState<number | "">("");
    const [papel, setPapel] = useState<"admin" | "membro">("membro");

    const {data: vinculos = [], isLoading} = useQuery({
        queryKey: tenantQueryKey("usuario-empresas", usuarioId),
        queryFn: () => fetchApiData<VinculoRow[]>(`/usuarios/${usuarioId}/empresas`),
    });

    const {data: empresas = []} = useQuery({
        queryKey: tenantQueryKey("admin-empresas"),
        queryFn: () => fetchApiData<EmpresaOpt[]>("/empresas"),
    });

    const invalidate = () => {
        void queryClient.invalidateQueries({queryKey: tenantQueryKey("usuario-empresas", usuarioId)});
    };

    const upsert = useMutation({
        mutationFn: () =>
            fetchApiData(`/usuarios/${usuarioId}/empresas`, {
                method: "PUT",
                body: JSON.stringify({empresa_id: Number(empresaId), papel, ativo: true}),
            }),
        onSuccess: () => {
            invalidate();
            toast({title: "Vínculo salvo."});
            setEmpresaId("");
        },
        onError: (err: Error) => toast({title: "Erro", description: err.message, variant: "destructive"}),
    });

    const unlink = useMutation({
        mutationFn: (eid: number) =>
            fetchApiData(`/usuarios/${usuarioId}/empresas/${eid}`, {method: "DELETE"}),
        onSuccess: () => {
            invalidate();
            toast({title: "Vínculo removido."});
        },
        onError: (err: Error) => toast({title: "Erro", description: err.message, variant: "destructive"}),
    });

    const vinculados = new Set(vinculos.map((v) => v.empresa_id));
    const disponiveis = empresas.filter((e) => e.ativa && !vinculados.has(e.id));

    return (
        <ViewportOverlay>
            <div className="glass-panel w-full max-w-lg rounded-2xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-white">Empresas de {usuarioNome}</h2>
                        <p className="text-xs text-muted-foreground mt-1">Vincular, definir papel ou desvincular</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg">
                        <X className="w-4 h-4 text-muted-foreground"/>
                    </button>
                </div>

                {isLoading ? (
                    <p className="text-sm text-muted-foreground">A carregar…</p>
                ) : (
                    <ul className="space-y-2">
                        {vinculos.map((v) => (
                            <li
                                key={v.id}
                                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2"
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm text-white truncate">{nomeEmpresa(v)}</span>
                                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                        {v.papel} · {v.ativo ? "ativo" : "inativo"}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    disabled={unlink.isPending}
                                    onClick={() => unlink.mutate(v.empresa_id)}
                                    className="p-1.5 hover:bg-destructive/15 rounded-lg text-muted-foreground hover:text-destructive"
                                    title="Desvincular"
                                >
                                    <Unlink className="w-4 h-4"/>
                                </button>
                            </li>
                        ))}
                        {vinculos.length === 0 ? (
                            <li className="text-sm text-muted-foreground">Nenhum vínculo.</li>
                        ) : null}
                    </ul>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/5">
                    <Select
                        value={empresaId === "" ? undefined : String(empresaId)}
                        onValueChange={(v) => setEmpresaId(Number(v))}
                        disabled={disponiveis.length === 0}
                    >
                        <SelectTrigger className="flex-1 h-10 bg-white/5 border-white/10 rounded-xl text-sm text-white shadow-none">
                            <SelectValue placeholder={disponiveis.length === 0 ? "Sem empresas disponíveis" : "Empresa…"} />
                        </SelectTrigger>
                        <SelectContent className="z-[70] bg-[#1A1A24] border-white/10 text-white">
                            {disponiveis.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)} className="text-white focus:bg-primary/20 focus:text-white">
                                    {nomeEmpresa(e)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={papel} onValueChange={(v) => setPapel(v as "admin" | "membro")}>
                        <SelectTrigger className="sm:w-[140px] h-10 bg-white/5 border-white/10 rounded-xl text-sm text-white shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[70] bg-[#1A1A24] border-white/10 text-white">
                            <SelectItem value="membro" className="text-white focus:bg-primary/20 focus:text-white">
                                Membro
                            </SelectItem>
                            <SelectItem value="admin" className="text-white focus:bg-primary/20 focus:text-white">
                                Admin
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <button
                        type="button"
                        disabled={!empresaId || upsert.isPending}
                        onClick={() => upsert.mutate()}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                        {upsert.isPending && <Loader2 className="w-4 h-4 animate-spin"/>}
                        Vincular
                    </button>
                </div>
            </div>
        </ViewportOverlay>
    );
}
