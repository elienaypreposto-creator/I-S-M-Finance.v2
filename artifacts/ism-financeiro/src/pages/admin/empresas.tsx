import {useEffect, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Building2, Loader2, Pencil, Plus, Power, Save, ShieldAlert} from "lucide-react";
import {PageHeader} from "@/components/shared/page-header";
import {fetchApiData} from "@/lib/api-config";
import {tenantQueryKey, nomeEmpresa} from "@/lib/tenant-query";
import {useToast} from "@/hooks/use-toast";
import {TableSkeleton} from "@/components/shared/table-skeleton";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useAuth} from "@/hooks/use-auth";
import {useConfirm} from "@/hooks/use-confirm";
import {DISCARD_PROMPT} from "@/hooks/use-escape-close";
import {PERM} from "@/lib/permissoes";
import {formatarData} from "@/lib/datas";
import {erroDocumento, mascararCnpj, normalizarCnpj} from "@/lib/documento";
import {
    Modal,
    ModalBody,
    ModalFooter,
    ModalForm,
    ModalHeader,
    ModalSpinner,
    modalBtnPrimaryCls,
    modalBtnSecondaryCls,
    modalGridCls,
} from "@/components/ui/modal-responsivo";
import {CampoBusca, contemBusca, useParametrosUrl} from "@/components/shared/filtros";

type EmpresaRow = {
    id: number;
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string | null;
    slug: string;
    ativa: boolean;
    dpa_representante?: string | null;
    dpa_assinado_em?: string | null;
    created_at: string;
};

const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 disabled:opacity-60";

/** CNPJ é opcional; se preenchido (numérico ou alfanumérico), precisa estar completo e com DV válido. */
function erroCnpj(cnpj: string): string | null {
    return normalizarCnpj(cnpj) ? erroDocumento(cnpj, "PJ") : null;
}

/**
 * Admin com admin:empresas:editar: só a empresa da sessão, só dados cadastrais (ISMF-16).
 * Ativar/desativar, slug e DPA seguem com o superadmin (a API recusa).
 */
function MinhaEmpresa() {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const {data: empresa, isLoading} = useQuery({
        queryKey: tenantQueryKey("empresa-atual"),
        queryFn: () => fetchApiData<EmpresaRow>("/empresas/atual"),
    });
    const [razao, setRazao] = useState("");
    const [fantasia, setFantasia] = useState("");
    const [cnpj, setCnpj] = useState("");

    useEffect(() => {
        if (!empresa) return;
        setRazao(empresa.razao_social);
        setFantasia(empresa.nome_fantasia ?? "");
        setCnpj(mascararCnpj(empresa.cnpj ?? ""));
    }, [empresa]);

    const cnpjErro = erroCnpj(cnpj);

    const salvar = useMutation({
        mutationFn: () =>
            fetchApiData<EmpresaRow>(`/empresas/${empresa!.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    razao_social: razao.trim(),
                    nome_fantasia: fantasia.trim() || null,
                    cnpj: normalizarCnpj(cnpj) || null,
                }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("empresa-atual")});
            toast({title: "Dados da empresa salvos."});
        },
        onError: (err: Error) => toast({title: "Erro ao salvar", description: err.message, variant: "destructive"}),
    });

    return (
        <div className="space-y-6">
            <PageHeader title="Minha empresa" description="Dados cadastrais da empresa em uso nesta sessão"/>
            {isLoading || !empresa ? (
                <TableSkeleton rows={3} columns={2}/>
            ) : (
                <form
                    className="glass-panel rounded-2xl p-6 space-y-4 max-w-xl"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (cnpjErro) return;
                        salvar.mutate();
                    }}
                >
                    <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Razão social</span>
                        <input value={razao} onChange={(e) => setRazao(e.target.value)} className={inputCls}/>
                    </label>
                    <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Nome fantasia</span>
                        <input value={fantasia} onChange={(e) => setFantasia(e.target.value)} className={inputCls}/>
                    </label>
                    <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">CNPJ</span>
                        <input
                            value={cnpj}
                            onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                            maxLength={18}
                            placeholder="00.000.000/0000-00"
                            aria-invalid={!!cnpjErro}
                            className={inputCls}
                        />
                        {cnpjErro && <span className="block text-xs text-destructive">{cnpjErro}</span>}
                    </label>
                    <p className="text-xs text-muted-foreground">
                        Identificador: <span className="font-mono">{empresa.slug}</span> · {empresa.ativa ? "Ativa" : "Inativa"}.
                        Ativação e aceite do DPA são feitos pelo ISM.
                    </p>
                    <button
                        type="submit"
                        disabled={razao.trim().length < 2 || !!cnpjErro || salvar.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-primary text-white disabled:opacity-50"
                    >
                        {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                        Salvar
                    </button>
                </form>
            )}
        </div>
    );
}

export default function AdminEmpresas() {
    const {user, hasPermission} = useAuth();
    // Listar todas e criar: operação do ISM, só superadmin (ISMF-16).
    const isSuperadmin = user?.superadmin === true;
    if (!isSuperadmin && hasPermission(PERM.ADMIN_EMPRESAS_EDITAR)) return <MinhaEmpresa/>;
    return <TodasEmpresas isSuperadmin={isSuperadmin}/>;
}

/** Modal da empresa: criar, editar ou informar o representante do DPA para ativar. */
type ModoModal = {tipo: "criar"} | {tipo: "editar"; empresa: EmpresaRow; ativar?: boolean};

function EmpresaModal({modo, onClose}: {modo: ModoModal; onClose: () => void}) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const empresa = modo.tipo === "editar" ? modo.empresa : null;
    const ativar = modo.tipo === "editar" && !!modo.ativar;

    const inicial = useMemo(
        () => ({
            razao: empresa?.razao_social ?? "",
            fantasia: empresa?.nome_fantasia ?? "",
            cnpj: mascararCnpj(empresa?.cnpj ?? ""),
            dpa: empresa?.dpa_representante ?? "",
        }),
        [empresa],
    );
    const [razao, setRazao] = useState(inicial.razao);
    const [fantasia, setFantasia] = useState(inicial.fantasia);
    const [cnpj, setCnpj] = useState(inicial.cnpj);
    const [dpa, setDpa] = useState(inicial.dpa);

    const alterado =
        razao !== inicial.razao || fantasia !== inicial.fantasia || cnpj !== inicial.cnpj || dpa !== inicial.dpa;
    const cnpjErro = erroCnpj(cnpj);
    const dpaMudou = dpa.trim() !== (empresa?.dpa_representante ?? "").trim();
    // Obrigatório ao criar, ao ativar e quando já existe (não dá para apagar o aceite).
    const dpaObrigatorio = !empresa || ativar || !!empresa.dpa_representante;

    const salvar = useMutation({
        mutationFn: () => {
            if (!empresa) {
                return fetchApiData<EmpresaRow>("/empresas", {
                    method: "POST",
                    body: JSON.stringify({
                        razao_social: razao.trim(),
                        nome_fantasia: fantasia.trim() || null,
                        cnpj: normalizarCnpj(cnpj) || null,
                        dpa_representante: dpa.trim(),
                    }),
                });
            }
            // O representante só vai quando muda: reenviar registra um novo aceite do DPA.
            return fetchApiData<EmpresaRow>(`/empresas/${empresa.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    razao_social: razao.trim(),
                    nome_fantasia: fantasia.trim() || null,
                    cnpj: normalizarCnpj(cnpj) || null,
                    ...(ativar || (dpaMudou && dpa.trim()) ? {dpa_representante: dpa.trim()} : {}),
                    ...(ativar ? {ativa: true} : {}),
                }),
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("admin-empresas")});
            toast({title: !empresa ? "Empresa criada." : ativar ? "Empresa ativada." : "Empresa atualizada."});
            onClose();
        },
        onError: (err: Error) =>
            toast({title: empresa ? "Erro ao salvar" : "Erro ao criar", description: err.message, variant: "destructive"}),
    });

    const dpaOk = dpaObrigatorio ? dpa.trim().length >= 2 : dpa.trim().length !== 1;
    const podeSalvar = razao.trim().length >= 2 && dpaOk && !cnpjErro && !salvar.isPending;

    async function fechar() {
        if (alterado && !salvar.isPending) {
            const ok = await confirm(DISCARD_PROMPT);
            if (!ok) return;
        }
        onClose();
    }

    const labelCls = "text-xs uppercase tracking-widest text-muted-foreground font-bold mb-1.5 block";
    const titulo = !empresa ? "Nova empresa" : ativar ? `Ativar ${nomeEmpresa(empresa)}` : `Editar ${nomeEmpresa(empresa)}`;

    return (
        <Modal onClose={() => void fechar()}>
            <ModalHeader title={titulo}/>
            <ModalForm
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    if (podeSalvar) salvar.mutate();
                }}
            >
                <ModalBody>
                    {ativar && (
                        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                            <ShieldAlert aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5"/>
                            A empresa só fica ativa com o representante que aceitou o DPA. Informe o nome para ativar.
                        </p>
                    )}
                    <div className={modalGridCls}>
                        <div>
                            <label htmlFor="empresa-razao-social" className={labelCls}>Razão social *</label>
                            <input
                                id="empresa-razao-social"
                                value={razao}
                                onChange={(e) => setRazao(e.target.value)}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label htmlFor="empresa-nome-fantasia" className={labelCls}>Nome fantasia</label>
                            <input
                                id="empresa-nome-fantasia"
                                value={fantasia}
                                onChange={(e) => setFantasia(e.target.value)}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label htmlFor="empresa-cnpj" className={labelCls}>CNPJ (opcional)</label>
                            <input
                                id="empresa-cnpj"
                                value={cnpj}
                                onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                                maxLength={18}
                                placeholder="00.000.000/0000-00"
                                aria-invalid={!!cnpjErro}
                                aria-describedby={cnpjErro ? "empresa-cnpj-erro" : undefined}
                                className={inputCls}
                            />
                            {cnpjErro && <p id="empresa-cnpj-erro" className="text-xs text-destructive mt-1">{cnpjErro}</p>}
                        </div>
                        <div>
                            <label htmlFor="empresa-dpa-representante" className={labelCls}>
                                Representante que aceita o DPA{dpaObrigatorio ? " *" : ""}
                            </label>
                            <input
                                id="empresa-dpa-representante"
                                value={dpa}
                                onChange={(e) => setDpa(e.target.value)}
                                autoFocus={ativar}
                                aria-describedby="empresa-dpa-ajuda"
                                className={inputCls}
                            />
                            <p id="empresa-dpa-ajuda" className="text-xs text-muted-foreground/70 mt-1.5">
                                {empresa?.dpa_assinado_em
                                    ? `Aceite registrado em ${formatarData(empresa.dpa_assinado_em)}. Trocar o nome registra um novo aceite.`
                                    : "O aceite é registrado com a data de hoje ao salvar."}
                            </p>
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter hint="* Campos obrigatórios · Esc fecha">
                    <button type="button" onClick={() => void fechar()} className={modalBtnSecondaryCls}>
                        Cancelar
                    </button>
                    <button type="submit" disabled={!podeSalvar} className={modalBtnPrimaryCls}>
                        {salvar.isPending ? <ModalSpinner/> : !empresa ? "Criar" : ativar ? "Salvar e ativar" : "Salvar"}
                    </button>
                </ModalFooter>
            </ModalForm>
            <ConfirmDialog {...ConfirmDialogProps}/>
        </Modal>
    );
}

function TodasEmpresas({isSuperadmin}: {isSuperadmin: boolean}) {
    const canCriar = isSuperadmin;
    const canEditar = isSuperadmin;
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [modal, setModal] = useState<ModoModal | null>(null);

    const {data: empresas = [], isLoading} = useQuery({
        queryKey: tenantQueryKey("admin-empresas"),
        queryFn: () => fetchApiData<EmpresaRow[]>("/empresas"),
        enabled: isSuperadmin,
    });

    // Busca por nome (?q=) filtrada no navegador: nome fantasia ou razão social.
    const {ler, atualizar} = useParametrosUrl();
    const busca = ler("q");
    const empresasFiltradas = useMemo(
        () => empresas.filter((e) => contemBusca(busca, e.nome_fantasia, e.razao_social)),
        [empresas, busca],
    );
    const anuncio = isLoading || !busca
        ? ""
        : `${empresasFiltradas.length} ${empresasFiltradas.length === 1 ? "empresa encontrada" : "empresas encontradas"}`;

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

    const {confirm, ConfirmDialogProps} = useConfirm();

    // Sem aceite do DPA a API não ativa: abre o modal para informar o representante.
    // Desativar tira o acesso de todos os usuários da empresa: pede confirmação.
    const alternarAtiva = async (e: EmpresaRow) => {
        if (!e.ativa && !e.dpa_assinado_em) {
            setModal({tipo: "editar", empresa: e, ativar: true});
            return;
        }
        if (e.ativa) {
            const ok = await confirm({
                title: `Desativar ${nomeEmpresa(e)}?`,
                description: "Os usuários desta empresa deixam de acessar o sistema até ela ser ativada de novo. Os dados são mantidos.",
                confirmLabel: "Desativar",
                variant: "destructive",
            });
            if (!ok) return;
        }
        toggleMutation.mutate({id: e.id, ativa: !e.ativa});
    };

    if (!isSuperadmin) {
        return <p className="text-sm text-destructive">Cadastro de empresas exige acesso de superadmin.</p>;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Empresas"
                description="Cadastro multiempresa — criar, editar, ativar e desativar empresas"
                actions={
                    canCriar ? (
                    <button
                        type="button"
                        onClick={() => setModal({tipo: "criar"})}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium shadow-lg shadow-primary/25"
                    >
                        <Plus aria-hidden="true" className="w-4 h-4"/>
                        Nova empresa
                    </button>
                    ) : undefined
                }
            />

            {isLoading ? (
                <TableSkeleton rows={4} columns={5}/>
            ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                    {/* Barra padrão: resumo à esquerda, busca à direita */}
                    <div className="px-4 py-2.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
                        <p className="text-xs text-muted-foreground">
                            {busca
                                ? `${empresasFiltradas.length} de ${empresas.length} ${empresas.length === 1 ? "empresa" : "empresas"}`
                                : `${empresas.length} ${empresas.length === 1 ? "empresa" : "empresas"}`}
                        </p>
                        <CampoBusca
                            valor={busca}
                            onBuscar={(termo) => atualizar({q: termo || null})}
                            placeholder="Buscar por nome…"
                            rotulo="Buscar empresas por nome"
                        />
                    </div>
                    <p className="sr-only" aria-live="polite" aria-atomic="true">{anuncio}</p>
                    <div className="overflow-x-auto">
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
                            {empresasFiltradas.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                                        {busca
                                            ? <>Nenhuma empresa encontrada para a busca “{busca}”.</>
                                            : "Nenhuma empresa cadastrada."}
                                    </td>
                                </tr>
                            )}
                            {empresasFiltradas.map((e) => (
                                <tr key={e.id} className="border-b border-white/5 last:border-0">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <span className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                                                <Building2 aria-hidden="true" className="w-4 h-4 text-primary"/>
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
                                    <td className="px-5 py-4 text-muted-foreground font-mono text-xs whitespace-nowrap">
                                        {e.cnpj ? mascararCnpj(e.cnpj) : "—"}
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={e.ativa ? "text-success text-xs font-medium" : "text-destructive text-xs font-medium"}>
                                            {e.ativa ? "Ativa" : "Inativa"}
                                        </span>
                                        {!e.dpa_assinado_em && (
                                            <span className="block text-[11px] text-amber-300/90 mt-0.5">Sem aceite do DPA</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        {canEditar ? (
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setModal({tipo: "editar", empresa: e})}
                                                title={`Editar ${nomeEmpresa(e)}`}
                                                aria-label={`Editar ${nomeEmpresa(e)}`}
                                                className="p-2 rounded-lg text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
                                            >
                                                <Pencil aria-hidden="true" className="w-3.5 h-3.5"/>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={toggleMutation.isPending}
                                                onClick={() => void alternarAtiva(e)}
                                                aria-label={`${e.ativa ? "Desativar" : "Ativar"} ${nomeEmpresa(e)}`}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs hover:bg-white/10 text-muted-foreground"
                                            >
                                                <Power aria-hidden="true" className="w-3.5 h-3.5"/>
                                                {e.ativa ? "Desativar" : "Ativar"}
                                            </button>
                                        </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            {modal && (
                <EmpresaModal
                    key={modal.tipo === "editar" ? `${modal.empresa.id}-${modal.ativar ? "ativar" : "editar"}` : "nova"}
                    modo={modal}
                    onClose={() => setModal(null)}
                />
            )}
            <ConfirmDialog {...ConfirmDialogProps}/>
        </div>
    );
}
