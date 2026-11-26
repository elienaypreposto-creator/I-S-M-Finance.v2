import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Link2, Plus, Trash2} from "lucide-react";
import {ApiError, fetchApiData} from "@/lib/api-config";
import {nomeEmpresa, tenantQueryKey} from "@/lib/tenant-query";
import {useAuth} from "@/hooks/use-auth";
import {useToast} from "@/hooks/use-toast";
import {useConfirm} from "@/hooks/use-confirm";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {SelectCampo} from "@/components/ui/select-campo";
import {ModalSpinner, modalBtnPrimaryCls} from "@/components/ui/modal-responsivo";
import {cn} from "@/lib/utils";

/** Vínculo do usuário do ISM Finance com o usuário do GovADM (login vindo do GovADM). */
type IdentidadeExterna = {
    id: number;
    provedor: string;
    emissor: string | null;
    sujeito_externo: string;
    empresa_id_padrao: number | null;
    ativo: boolean;
    created_at: string;
    ultimo_uso_em: string | null;
};

/** Mesmo formato de GET /usuarios/:id/empresas (só superadmin consulta). */
type VinculoEmpresa = {
    empresa_id: number;
    ativo: boolean;
    razao_social: string;
    nome_fantasia: string | null;
};

const MSG_VINCULO_DUPLICADO = "Esse ID do GovADM já está vinculado a outro usuário.";

const labelCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block";
const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors";

function formatarDataHora(valor: string | null): string {
    if (!valor) return "Nunca usado";
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return "-";
    return data.toLocaleString("pt-BR", {dateStyle: "short", timeStyle: "short"});
}

/**
 * Seção "Acesso pelo GovADM" do modal de edição de usuário. Fica dentro do
 * <form> do modal: nada aqui é submit (botões type="button" e Enter tratado).
 */
export function UsuarioGovadmSecao({usuarioId, usuarioNome}: { usuarioId: number; usuarioNome: string }) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const {user, empresas: empresasSessao} = useAuth();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const [sujeito, setSujeito] = useState("");
    const [empresaPadrao, setEmpresaPadrao] = useState("");
    const [erroSujeito, setErroSujeito] = useState<string | null>(null);

    const chave = tenantQueryKey("usuario-identidades-externas", usuarioId);

    const {data: identidades = [], isLoading, isError, error} = useQuery({
        queryKey: chave,
        queryFn: () => fetchApiData<IdentidadeExterna[]>(`/usuarios/${usuarioId}/identidades-externas`),
    });

    // As empresas do usuário editado só são consultáveis por superadmin (mesma
    // query do modal "Empresas"). Para os demais o campo de empresa padrão some.
    const podeListarEmpresas = user?.superadmin === true;
    const {data: vinculosEmpresa = []} = useQuery({
        queryKey: tenantQueryKey("usuario-empresas", usuarioId),
        queryFn: () => fetchApiData<VinculoEmpresa[]>(`/usuarios/${usuarioId}/empresas`),
        enabled: podeListarEmpresas,
    });
    const empresasDoUsuario = vinculosEmpresa.filter((v) => v.ativo);

    function nomeDaEmpresa(id: number | null): string {
        if (id === null) return "Escolha no login";
        const doUsuario = vinculosEmpresa.find((v) => v.empresa_id === id);
        if (doUsuario) return nomeEmpresa(doUsuario);
        const daSessao = empresasSessao.find((e) => e.id === id);
        return daSessao ? nomeEmpresa(daSessao) : `Empresa #${id}`;
    }

    const invalidar = () => void queryClient.invalidateQueries({queryKey: chave});

    const adicionar = useMutation({
        mutationFn: (corpo: { sujeito_externo: string; empresa_id_padrao?: number }) =>
            fetchApiData<IdentidadeExterna>(`/usuarios/${usuarioId}/identidades-externas`, {
                method: "POST",
                body: JSON.stringify(corpo),
            }),
        onSuccess: () => {
            invalidar();
            setSujeito("");
            setEmpresaPadrao("");
            setErroSujeito(null);
            toast({title: "Acesso pelo GovADM vinculado."});
        },
        onError: (err: Error) => {
            if (err instanceof ApiError && (err.status === 409 || err.code === "VINCULO_DUPLICADO")) {
                setErroSujeito(MSG_VINCULO_DUPLICADO);
                return;
            }
            toast({title: "Erro ao vincular acesso do GovADM", description: err.message, variant: "destructive"});
        },
    });

    const remover = useMutation({
        mutationFn: (identidadeId: number) =>
            fetchApiData(`/usuarios/${usuarioId}/identidades-externas/${identidadeId}`, {method: "DELETE"}),
        onSuccess: () => {
            invalidar();
            toast({title: "Acesso pelo GovADM removido."});
        },
        onError: (err: Error) =>
            toast({title: "Erro ao remover acesso do GovADM", description: err.message, variant: "destructive"}),
    });

    function handleAdicionar() {
        const valor = sujeito.trim();
        if (!valor) {
            setErroSujeito("Informe o ID do usuário no GovADM.");
            return;
        }
        if (valor.length > 255) {
            setErroSujeito("ID muito longo (máx. 255 caracteres).");
            return;
        }
        setErroSujeito(null);
        adicionar.mutate({
            sujeito_externo: valor,
            ...(empresaPadrao ? {empresa_id_padrao: Number(empresaPadrao)} : {}),
        });
    }

    async function handleRemover(identidade: IdentidadeExterna) {
        const ok = await confirm({
            title: "Remover acesso pelo GovADM?",
            description: `${usuarioNome} não vai mais entrar pelo GovADM com o ID "${identidade.sujeito_externo}". O login com e-mail e senha continua valendo.`,
            confirmLabel: "Remover",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) remover.mutate(identidade.id);
    }

    return (
        <section aria-labelledby="usuario-govadm-titulo" className="mt-6 pt-5 border-t border-white/5 space-y-4">
            <div>
                <h3 id="usuario-govadm-titulo"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Link2 aria-hidden="true" className="w-3.5 h-3.5"/>
                    Acesso pelo GovADM
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                    Libera a entrada no ISM Finance a partir do GovADM, sem pedir senha.
                </p>
            </div>

            {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando vínculos…</p>
            ) : isError ? (
                <p className="text-sm text-destructive" role="alert">
                    {error instanceof Error ? error.message : "Não foi possível carregar os vínculos."}
                </p>
            ) : identidades.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum acesso pelo GovADM vinculado.</p>
            ) : (
                <ul className="space-y-2">
                    {identidades.map((i) => (
                        <li key={i.id}
                            className="flex items-start justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5">
                            <dl className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div className="min-w-0 sm:col-span-2">
                                    <dt className="sr-only">ID do usuário no GovADM</dt>
                                    <dd className="text-sm text-white font-medium break-all">
                                        {i.sujeito_externo}
                                        {!i.ativo && (
                                            <span
                                                className="ml-2 align-middle text-[10px] uppercase tracking-widest text-destructive">
                                                inativo
                                            </span>
                                        )}
                                    </dd>
                                </div>
                                <div className="min-w-0">
                                    <dt className="inline text-muted-foreground">Emissor: </dt>
                                    <dd className="inline text-white/80 break-all">{i.emissor || "-"}</dd>
                                </div>
                                <div className="min-w-0">
                                    <dt className="inline text-muted-foreground">Empresa padrão: </dt>
                                    <dd className="inline text-white/80">{nomeDaEmpresa(i.empresa_id_padrao)}</dd>
                                </div>
                                <div className="min-w-0 sm:col-span-2">
                                    <dt className="inline text-muted-foreground">Último uso: </dt>
                                    <dd className="inline text-white/80">{formatarDataHora(i.ultimo_uso_em)}</dd>
                                </div>
                            </dl>
                            <button
                                type="button"
                                disabled={remover.isPending}
                                onClick={() => void handleRemover(i)}
                                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-40 shrink-0"
                                title="Remover acesso pelo GovADM"
                                aria-label={`Remover acesso pelo GovADM ${i.sujeito_externo}`}
                            >
                                <Trash2 aria-hidden="true" className="w-4 h-4"/>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-[1.8em] gap-y-[1.2em]">
                <div>
                    <label htmlFor="usuario-govadm-sujeito" className={labelCls}>
                        ID do usuário no GovADM <span className="text-destructive">*</span>
                    </label>
                    <input
                        id="usuario-govadm-sujeito"
                        value={sujeito}
                        onChange={(ev) => {
                            setSujeito(ev.target.value);
                            if (erroSujeito) setErroSujeito(null);
                        }}
                        onKeyDown={(ev) => {
                            // Enter aqui não pode salvar o formulário do usuário.
                            if (ev.key === "Enter") {
                                ev.preventDefault();
                                handleAdicionar();
                            }
                        }}
                        aria-invalid={!!erroSujeito || undefined}
                        aria-describedby={erroSujeito ? "usuario-govadm-sujeito-erro" : undefined}
                        maxLength={255}
                        autoComplete="off"
                        className={cn(inputCls, erroSujeito && "border-destructive/60 focus:border-destructive")}
                        placeholder="Ex.: 12345"
                    />
                    {erroSujeito && (
                        <p id="usuario-govadm-sujeito-erro" role="alert" className="mt-1 text-xs text-destructive">
                            {erroSujeito}
                        </p>
                    )}
                </div>

                {podeListarEmpresas && empresasDoUsuario.length > 0 && (
                    <div>
                        <label htmlFor="usuario-govadm-empresa" className={labelCls}>Empresa padrão</label>
                        <SelectCampo
                            id="usuario-govadm-empresa"
                            value={empresaPadrao}
                            onChange={setEmpresaPadrao}
                            permitirVazio
                            placeholder="Escolha no login"
                            opcoes={empresasDoUsuario.map((v) => ({
                                value: String(v.empresa_id),
                                label: nomeEmpresa(v),
                            }))}
                        />
                    </div>
                )}

                <div className="flex items-end">
                    <button
                        type="button"
                        onClick={handleAdicionar}
                        disabled={adicionar.isPending}
                        className={cn(modalBtnPrimaryCls, "w-full")}
                    >
                        {adicionar.isPending ? (
                            <ModalSpinner label="Vinculando..."/>
                        ) : (
                            <Plus aria-hidden="true" className="w-4 h-4"/>
                        )}
                        Vincular acesso
                    </button>
                </div>
            </div>
            <ConfirmDialog {...ConfirmDialogProps} />
        </section>
    );
}
