import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Unlink} from "lucide-react";
import {fetchApiData} from "@/lib/api-config";
import {nomeEmpresa, tenantQueryKey} from "@/lib/tenant-query";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {SelectCampo} from "@/components/ui/select-campo";
import {
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    ModalSpinner,
    modalBtnPrimaryCls,
    modalBtnSecondaryCls,
    modalGridCls,
} from "@/components/ui/modal-responsivo";

const labelCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block";

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
        <Modal
            onClose={onClose}
            // O 1º focável do corpo pode ser um "Desvincular": começa pelo campo Empresa
            // (ou Papel, se não houver empresa disponível).
            initialFocus={(content) =>
                content.querySelector<HTMLElement>("#usuario-empresas-empresa:not([disabled]), #usuario-empresas-papel")}
        >
            <ModalHeader title={`Empresas de ${usuarioNome}`} description="Vincular, definir papel ou desvincular"/>
            <ModalBody className="space-y-5">
                <section aria-labelledby="usuario-empresas-vinculos-titulo">
                    <h3 id="usuario-empresas-vinculos-titulo"
                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Vínculos atuais
                    </h3>
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">A carregar…</p>
                    ) : (
                        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                            {vinculos.map((v) => (
                                <li
                                    key={v.id}
                                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2"
                                >
                                    <span className="min-w-0">
                                        <span className="block text-sm text-white truncate">{nomeEmpresa(v)}</span>
                                        <span className="text-xs uppercase tracking-widest text-muted-foreground">
                                            {v.papel} · {v.ativo ? "ativo" : "inativo"}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        disabled={unlink.isPending}
                                        onClick={() => unlink.mutate(v.empresa_id)}
                                        className="p-1.5 hover:bg-destructive/15 rounded-lg text-muted-foreground hover:text-destructive"
                                        title="Desvincular"
                                        aria-label={`Desvincular ${nomeEmpresa(v)}`}
                                    >
                                        <Unlink aria-hidden="true" className="w-4 h-4"/>
                                    </button>
                                </li>
                            ))}
                            {vinculos.length === 0 ? (
                                <li className="col-span-full text-sm text-muted-foreground">Nenhum vínculo.</li>
                            ) : null}
                        </ul>
                    )}
                </section>

                <section aria-labelledby="usuario-empresas-novo-titulo" className="pt-4 border-t border-white/5">
                    <h3 id="usuario-empresas-novo-titulo"
                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Novo vínculo
                    </h3>
                    <div className={modalGridCls}>
                        <div>
                            <label htmlFor="usuario-empresas-empresa" className={labelCls}>Empresa</label>
                            <SelectCampo
                                id="usuario-empresas-empresa"
                                value={empresaId === "" ? "" : String(empresaId)}
                                onChange={(v) => setEmpresaId(Number(v))}
                                disabled={disponiveis.length === 0}
                                placeholder={disponiveis.length === 0 ? "Sem empresas disponíveis" : "Empresa…"}
                                opcoes={disponiveis.map((e) => ({value: String(e.id), label: nomeEmpresa(e)}))}
                            />
                        </div>
                        <div>
                            <label htmlFor="usuario-empresas-papel" className={labelCls}>Papel</label>
                            <SelectCampo
                                id="usuario-empresas-papel"
                                value={papel}
                                onChange={(v) => setPapel(v as "admin" | "membro")}
                                opcoes={[
                                    {value: "membro", label: "Membro"},
                                    {value: "admin", label: "Admin"},
                                ]}
                            />
                        </div>
                        <div className="flex items-end md:col-span-2 xl:col-span-1">
                            <button
                                type="button"
                                disabled={!empresaId || upsert.isPending}
                                onClick={() => upsert.mutate()}
                                className={cn(modalBtnPrimaryCls, "w-full")}
                            >
                                {upsert.isPending && <ModalSpinner label="Vinculando..."/>}
                                Vincular
                            </button>
                        </div>
                    </div>
                </section>
            </ModalBody>
            <ModalFooter hint="Esc fecha">
                <button type="button" onClick={onClose} className={modalBtnSecondaryCls}>
                    Fechar
                </button>
            </ModalFooter>
        </Modal>
    );
}
