import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Building2, Loader2, Plus, Power} from "lucide-react";
import {PageHeader} from "@/components/shared/page-header";
import {fetchApiData} from "@/lib/api-config";
import {tenantQueryKey, nomeEmpresa} from "@/lib/tenant-query";
import {useToast} from "@/hooks/use-toast";
import {TableSkeleton} from "@/components/shared/table-skeleton";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {ViewportOverlay} from "@/components/shared/viewport-overlay";

type EmpresaRow = {
    id: number;
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string | null;
    slug: string;
    ativa: boolean;
    created_at: string;
};

export default function AdminEmpresas() {
    const {hasPermission} = useAuth();
    const canCriar = hasPermission(PERM.ADMIN_EMPRESAS_CRIAR);
    const canEditar = hasPermission(PERM.ADMIN_EMPRESAS_EDITAR);
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [razao, setRazao] = useState("");
    const [fantasia, setFantasia] = useState("");
    const [cnpj, setCnpj] = useState("");

    const {data: empresas = [], isLoading} = useQuery({
        queryKey: tenantQueryKey("admin-empresas"),
        queryFn: () => fetchApiData<EmpresaRow[]>("/empresas"),
        enabled: hasPermission(PERM.ADMIN_EMPRESAS_LISTAR),
    });

    const createMutation = useMutation({
        mutationFn: () =>
            fetchApiData<EmpresaRow>("/empresas", {
                method: "POST",
                body: JSON.stringify({
                    razao_social: razao.trim(),
                    nome_fantasia: fantasia.trim() || null,
                    cnpj: cnpj.trim() || null,
                }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("admin-empresas")});
            toast({title: "Empresa criada."});
            setShowModal(false);
            setRazao("");
            setFantasia("");
            setCnpj("");
        },
        onError: (err: Error) => toast({title: "Erro ao criar", description: err.message, variant: "destructive"}),
    });

    const toggleMutation = useMutation({
        mutationFn: ({id, ativa}: {id: number; ativa: boolean}) =>
            fetchApiData<EmpresaRow>(`/empresas/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ativa}),
            }),
        onSuccess: (_, vars) => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("admin-empresas")});
            toast({title: vars.ativa ? "Empresa ativada." : "Empresa desativada."});
        },
        onError: (err: Error) => toast({title: "Erro", description: err.message, variant: "destructive"}),
    });

    if (!hasPermission(PERM.ADMIN_EMPRESAS_LISTAR)) {
        return <p className="text-sm text-destructive">Sem permissão para listar empresas.</p>;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Empresas"
                description="Cadastro multiempresa — criar e ativar/desativar tenants"
                actions={
                    canCriar ? (
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium shadow-lg shadow-primary/25"
                    >
                        <Plus className="w-4 h-4"/>
                        Nova empresa
                    </button>
                    ) : undefined
                }
            />

            {isLoading ? (
                <TableSkeleton rows={4} columns={5}/>
            ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-white/5">
                                <th className="px-5 py-3">Empresa</th>
                                <th className="px-5 py-3">Slug</th>
                                <th className="px-5 py-3">CNPJ</th>
                                <th className="px-5 py-3">Estado</th>
                                <th className="px-5 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {empresas.map((e) => (
                                <tr key={e.id} className="border-b border-white/5 last:border-0">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <span className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                                                <Building2 className="w-4 h-4 text-primary"/>
                                            </span>
                                            <div>
                                                <p className="font-semibold text-white">{nomeEmpresa(e)}</p>
                                                {e.nome_fantasia && e.nome_fantasia !== e.razao_social ? (
                                                    <p className="text-xs text-muted-foreground">{e.razao_social}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{e.slug}</td>
                                    <td className="px-5 py-4 text-muted-foreground">{e.cnpj || "—"}</td>
                                    <td className="px-5 py-4">
                                        <span className={e.ativa ? "text-success text-xs font-medium" : "text-destructive text-xs font-medium"}>
                                            {e.ativa ? "Ativa" : "Inativa"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        {canEditar ? (
                                        <button
                                            type="button"
                                            disabled={toggleMutation.isPending}
                                            onClick={() => toggleMutation.mutate({id: e.id, ativa: !e.ativa})}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs hover:bg-white/10 text-muted-foreground"
                                        >
                                            <Power className="w-3.5 h-3.5"/>
                                            {e.ativa ? "Desativar" : "Ativar"}
                                        </button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <ViewportOverlay>
                    <div className="glass-panel w-full max-w-md rounded-2xl p-6 space-y-4">
                        <h2 className="text-lg font-bold text-white">Nova empresa</h2>
                        <label className="block space-y-1">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Razão social</span>
                            <input
                                value={razao}
                                onChange={(e) => setRazao(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Nome fantasia</span>
                            <input
                                value={fantasia}
                                onChange={(e) => setFantasia(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">CNPJ (opcional)</span>
                            <input
                                value={cnpj}
                                onChange={(e) => setCnpj(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
                            />
                        </label>
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-2.5 rounded-xl text-sm bg-white/5 text-muted-foreground"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={razao.trim().length < 2 || createMutation.isPending}
                                onClick={() => createMutation.mutate()}
                                className="flex-1 py-2.5 rounded-xl text-sm bg-primary text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
                            >
                                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin"/>}
                                Criar
                            </button>
                        </div>
                    </div>
                </ViewportOverlay>
            )}
        </div>
    );
}
