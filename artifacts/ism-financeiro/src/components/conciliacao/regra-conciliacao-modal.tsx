import {useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {cn} from "@/lib/utils";
import {Loader2, X, Pencil, Trash2} from "lucide-react";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {RequiresPermission} from "@/components/auth/requires-permission";
import {PERM} from "@/lib/permissoes";
import {ParceiroCombobox} from "@/components/shared/parceiro-combobox";
import {PlanoContaCombobox, type PlanoContaOption} from "@/components/shared/plano-conta-combobox";
import {NovoParceiroModal, type ParceiroRow} from "@/pages/cadastros/parceiros";

type DepartamentoOption = { id: number; nome: string };
type ParceiroSubModal = { mode: "create" } | { mode: "edit"; data: ParceiroRow };

export type TipoMatchRegra = "contem" | "inicia" | "regex" | "exato";

export type RegraConciliacaoItem = {
    id: number;
    conta_id: number | null;
    texto_gatilho: string;
    tipo_match: TipoMatchRegra;
    natureza: "entrada" | "saida";
    plano_conta_id: number | null;
    plano_conta_categoria?: string | null;
    plano_conta_subcategoria?: string | null;
    parceiro_id: number | null;
    parceiro_nome?: string | null;
    departamento_id: number | null;
    departamento_nome?: string | null;
    centro_custo_id: number | null;
    forma_pagamento: string | null;
    criar_lancamento_automatico: boolean;
    prioridade: number;
    ativo: boolean;
};

type RegraConciliacaoModalProps = {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    prefill?: {
        texto_gatilho?: string;
        natureza?: "entrada" | "saida";
        conta_id?: number | null;
    };
};

function labelTipo(natureza: string): string {
    return natureza === "entrada" ? "Receita" : "Despesa";
}

function labelCategoria(row: RegraConciliacaoItem): string {
    if (!row.plano_conta_categoria) return "-";
    return row.plano_conta_subcategoria
        ? `${row.plano_conta_categoria} - ${row.plano_conta_subcategoria}`
        : row.plano_conta_categoria;
}

function TextoExatoSwitch({
                              checked,
                              onChange,
                          }: {
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-9 w-[84px] shrink-0 items-center rounded-full px-1.5 gap-1 transition-colors",
                checked ? "bg-emerald-500" : "bg-white/10",
            )}
        >
            {checked ? (
                <>
                    <span className="flex-1 text-[11px] font-black uppercase tracking-wide text-white pl-0.5">Sim</span>
                    <span className="h-6 w-6 rounded-full bg-white shadow-md shrink-0"/>
                </>
            ) : (
                <>
                    <span className="h-6 w-6 rounded-full bg-white/80 shadow-md shrink-0"/>
                    <span
                        className="flex-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">Não</span>
                </>
            )}
        </button>
    );
}

const EMPTY_FORM = {
    textoGatilho: "",
    textoExato: false,
    natureza: "saida" as "entrada" | "saida",
    planoContaId: "",
    parceiroId: "",
    departamentoId: "",
    formaPagamento: "",
};

export function RegraConciliacaoModal({open, onClose, onSuccess, prefill}: RegraConciliacaoModalProps) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const {confirm, ConfirmDialogProps} = useConfirm();

    const [editItem, setEditItem] = useState<RegraConciliacaoItem | null>(null);
    const [textoGatilho, setTextoGatilho] = useState("");
    const [textoExato, setTextoExato] = useState(false);
    const [natureza, setNatureza] = useState<"entrada" | "saida">("saida");
    const [planoContaId, setPlanoContaId] = useState("");
    const [parceiroId, setParceiroId] = useState("");
    const [departamentoId, setDepartamentoId] = useState("");
    const [formaPagamento, setFormaPagamento] = useState("");
    const [searchParceiro, setSearchParceiro] = useState("");
    const [parceiroSubModal, setParceiroSubModal] = useState<ParceiroSubModal | null>(null);

    function applyPrefill() {
        setEditItem(null);
        setTextoGatilho(prefill?.texto_gatilho ?? EMPTY_FORM.textoGatilho);
        setTextoExato(EMPTY_FORM.textoExato);
        setNatureza(prefill?.natureza ?? EMPTY_FORM.natureza);
        setPlanoContaId(EMPTY_FORM.planoContaId);
        setParceiroId(EMPTY_FORM.parceiroId);
        setDepartamentoId(EMPTY_FORM.departamentoId);
        setFormaPagamento(EMPTY_FORM.formaPagamento);
    }

    function fillFromRow(row: RegraConciliacaoItem) {
        setEditItem(row);
        setTextoGatilho(row.texto_gatilho);
        setTextoExato(row.tipo_match === "exato");
        setNatureza(row.natureza);
        setPlanoContaId(row.plano_conta_id != null ? String(row.plano_conta_id) : "");
        setParceiroId(row.parceiro_id != null ? String(row.parceiro_id) : "");
        setDepartamentoId(row.departamento_id != null ? String(row.departamento_id) : "");
        setFormaPagamento(row.forma_pagamento ?? "");
    }

    useEffect(() => {
        if (!open) return;
        applyPrefill();
    }, [open, prefill?.texto_gatilho, prefill?.natureza, prefill?.conta_id]);

    const {data: regras = [], isLoading: loadingRegras} = useQuery<RegraConciliacaoItem[]>({
        queryKey: ["regras-conciliacao"],
        queryFn: () => fetchApiData<RegraConciliacaoItem[]>("/regras-conciliacao"),
        enabled: open,
    });
    const {data: parceiros = [], isFetching: isFetchingParceiros} = useQuery<ParceiroRow[]>({
        queryKey: ["parceiros-modal", searchParceiro],
        queryFn: () => {
            const qs = new URLSearchParams({page: "1", limit: "20"});
            if (searchParceiro.trim()) qs.set("search", searchParceiro.trim());
            return fetchApiData<ParceiroRow[]>(`/parceiros?${qs.toString()}`);
        },
        enabled: open,
    });
    const {data: planoContas = []} = useQuery<PlanoContaOption[]>({
        queryKey: ["plano-contas-modal"],
        queryFn: () => fetchApiData<PlanoContaOption[]>("/plano-contas"),
        enabled: open,
    });
    const {data: departamentos = []} = useQuery<DepartamentoOption[]>({
        queryKey: ["departamentos-modal"],
        queryFn: () => fetchApiData<DepartamentoOption[]>("/departamentos"),
        enabled: open,
    });

    const listaPlanoContas = useMemo(() => {
        const list = Array.isArray(planoContas) ? planoContas : [];
        if (!planoContaId) return list;
        if (list.some((p) => String(p.id) === planoContaId)) return list;
        if (editItem?.plano_conta_id != null && String(editItem.plano_conta_id) === planoContaId) {
            return [
                {
                    id: editItem.plano_conta_id,
                    categoria: editItem.plano_conta_categoria ?? "Categoria",
                    subcategoria: editItem.plano_conta_subcategoria ?? null,
                },
                ...list,
            ];
        }
        return list;
    }, [planoContas, planoContaId, editItem]);

    const listaParceiros = useMemo(() => {
        const list = Array.isArray(parceiros) ? parceiros : [];
        if (!parceiroId) return list;
        if (list.some((p) => String(p.id) === parceiroId)) return list;
        if (editItem?.parceiro_id != null && String(editItem.parceiro_id) === parceiroId) {
            return [
                {
                    id: editItem.parceiro_id,
                    tipo_pessoa: "PJ",
                    cpf_cnpj: null,
                    nome: editItem.parceiro_nome ?? `#${editItem.parceiro_id}`,
                    nome_fantasia: null,
                    email: null,
                    telefone: null,
                    forma_pagamento_preferencial: null,
                    tipos: [],
                    departamento_id: null,
                    centro_custo_id: null,
                    status: "ativo",
                    ativo: true,
                    bloqueado: false,
                    chaves_pix: null,
                    dados_bancarios: null,
                } satisfies ParceiroRow,
                ...list,
            ];
        }
        return list;
    }, [parceiros, parceiroId, editItem]);

    const saveMutation = useMutation({
        mutationFn: () => {
            const payload = {
                conta_id: editItem?.conta_id ?? prefill?.conta_id ?? null,
                texto_gatilho: textoGatilho.trim(),
                tipo_match: textoExato ? "exato" : "contem",
                natureza,
                plano_conta_id: planoContaId ? Number(planoContaId) : null,
                parceiro_id: parceiroId ? Number(parceiroId) : null,
                departamento_id: departamentoId ? Number(departamentoId) : null,
                centro_custo_id: editItem?.centro_custo_id ?? null,
                forma_pagamento: formaPagamento || null,
                criar_lancamento_automatico: editItem?.criar_lancamento_automatico ?? true,
                prioridade: editItem?.prioridade ?? 0,
                ativo: editItem?.ativo ?? true,
            };
            return editItem
                ? fetchApiData(`/regras-conciliacao/${editItem.id}`, {method: "PUT", body: JSON.stringify(payload)})
                : fetchApiData("/regras-conciliacao", {method: "POST", body: JSON.stringify(payload)});
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["regras-conciliacao"]});
            toast({
                title: editItem ? "Regra atualizada" : "Regra criada",
                description: editItem
                    ? "As alterações foram salvas."
                    : "Nas próximas importações, linhas com esse texto serão classificadas automaticamente.",
            });
            applyPrefill();
            onSuccess?.();
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro ao salvar regra",
                description: e instanceof Error ? e.message : "Não foi possível salvar a regra.",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => fetchApiData(`/regras-conciliacao/${id}`, {method: "DELETE"}),
        onSuccess: (_data, id) => {
            void queryClient.invalidateQueries({queryKey: ["regras-conciliacao"]});
            if (editItem?.id === id) applyPrefill();
            toast({title: "Regra excluída", description: "A regra não será mais aplicada nas próximas importações."});
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Não foi possível excluir",
                description: e instanceof Error ? e.message : String(e),
            });
        },
    });

    async function askDelete(row: RegraConciliacaoItem) {
        const ok = await confirm({
            title: "Excluir regra?",
            description: `Remover a regra "${row.texto_gatilho}"? Esta ação não pode ser desfeita.`,
            confirmLabel: "Excluir",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(row.id);
    }

    if (!open) return null;

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
    const selectCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer [&>option]:bg-[#1a1c23]";
    const podeSalvar = textoGatilho.trim().length > 0 && !saveMutation.isPending;

    return createPortal(
        <div className="fixed inset-0 z-[60]">
            <div className="fixed inset-0 bg-black/75 backdrop-blur-md"/>
            <div
                className="fixed left-[50%] top-[4%] -translate-x-[50%] translate-y-0 bg-[#121417] border border-white/10 rounded-2xl w-[calc(100%-2rem)] max-w-6xl shadow-2xl flex flex-col max-h-[92vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                    <h2 className="text-base font-bold text-white">Cadastro Texto Conciliação</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (podeSalvar) saveMutation.mutate();
                    }}
                    className="flex flex-col flex-1 min-h-0"
                >
                    <div className="px-6 pt-5 pb-4 space-y-4 shrink-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                                <span className={labelCls}>Tipo</span>
                                <select
                                    value={natureza}
                                    onChange={(e) => setNatureza(e.target.value as "entrada" | "saida")}
                                    className={selectCls}
                                >
                                    <option value="entrada">Receita</option>
                                    <option value="saida">Despesa</option>
                                </select>
                            </div>
                            <div>
                                <span className={labelCls}>Texto Conciliação</span>
                                <input
                                    type="text"
                                    value={textoGatilho}
                                    onChange={(e) => setTextoGatilho(e.target.value)}
                                    className={inputCls}
                                    placeholder="Ex: TARIFA PIX"
                                    required
                                />
                            </div>
                            <div>
                                <span className={labelCls}>Categoria Financeira</span>
                                <PlanoContaCombobox
                                    value={planoContaId}
                                    onChange={setPlanoContaId}
                                    planoContas={listaPlanoContas}
                                />
                            </div>
                            <div>
                                <span className={labelCls}>Texto Exato</span>
                                <div className="h-[42px] flex items-center">
                                    <TextoExatoSwitch checked={textoExato} onChange={setTextoExato}/>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <span className={labelCls}>Cliente</span>
                                <ParceiroCombobox
                                    value={parceiroId}
                                    onChange={setParceiroId}
                                    parceiros={listaParceiros}
                                    search={searchParceiro}
                                    onSearchChange={setSearchParceiro}
                                    isLoading={isFetchingParceiros}
                                    onEdit={(p) => setParceiroSubModal({mode: "edit", data: p})}
                                    onCreateNew={() => setParceiroSubModal({mode: "create"})}
                                />
                            </div>
                            <div>
                                <span className={labelCls}>Departamento</span>
                                <select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}
                                        className={selectCls}>
                                    <option value="">Selecione o departamento...</option>
                                    {departamentos.map((d) => (
                                        <option key={d.id} value={d.id}>{d.nome}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <span className={labelCls}>Forma de Pagamento</span>
                                <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}
                                        className={selectCls}>
                                    <option value="">Selecione...</option>
                                    <option value="PIX">PIX</option>
                                    <option value="TED">TED</option>
                                    <option value="Boleto">Boleto</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div
                        className="flex-1 min-h-0 overflow-y-auto border-t border-white/5 mx-6 mb-4 rounded-xl bg-black/20">
                        <table className="w-full text-left text-xs">
                            <thead
                                className="sticky top-0 bg-[#1a1c23] text-muted-foreground border-b border-white/5 z-10">
                            <tr>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Tipo</th>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Texto Conciliação</th>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Exato</th>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Categoria</th>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Cliente/Fornecedor</th>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Departamento</th>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide">Forma de Pagamento
                                </th>
                                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-right w-20">Ações</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                            {loadingRegras ? (
                                <tr>
                                    <td colSpan={8} className="py-10 text-center text-muted-foreground">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary"/>
                                    </td>
                                </tr>
                            ) : regras.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-10 text-center text-muted-foreground">
                                        Nenhuma regra cadastrada.
                                    </td>
                                </tr>
                            ) : (
                                regras.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={cn(
                                            "hover:bg-white/[0.04] transition-colors",
                                            editItem?.id === row.id && "bg-primary/10",
                                        )}
                                    >
                                        <td className="px-3 py-2.5 text-white whitespace-nowrap">{labelTipo(row.natureza)}</td>
                                        <td className="px-3 py-2.5 text-white font-medium max-w-[200px] truncate"
                                            title={row.texto_gatilho}>
                                            {row.texto_gatilho}
                                        </td>
                                        <td className="px-3 py-2.5 text-white/80 uppercase">{row.tipo_match === "exato" ? "Sim" : "Não"}</td>
                                        <td className="px-3 py-2.5 text-white/80 max-w-[180px] truncate">{labelCategoria(row)}</td>
                                        <td className="px-3 py-2.5 text-white/80 max-w-[180px] truncate">{row.parceiro_nome ?? "-"}</td>
                                        <td className="px-3 py-2.5 text-white/80">{row.departamento_nome ?? "-"}</td>
                                        <td className="px-3 py-2.5 text-white/80">{row.forma_pagamento ?? "-"}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center justify-end gap-1">
                                                <RequiresPermission permission={PERM.REGRAS_CONCILIACAO_EDITAR}>
                                                    <button
                                                        type="button"
                                                        onClick={() => fillFromRow(row)}
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10"
                                                        title="Editar"
                                                    >
                                                        <Pencil className="w-4 h-4"/>
                                                    </button>
                                                </RequiresPermission>
                                                <RequiresPermission permission={PERM.REGRAS_CONCILIACAO_DELETAR}>
                                                    <button
                                                        type="button"
                                                        onClick={() => void askDelete(row)}
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        title="Excluir"
                                                    >
                                                        <Trash2 className="w-4 h-4"/>
                                                    </button>
                                                </RequiresPermission>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5"
                        >
                            Cancelar
                        </button>
                        <RequiresPermission
                            permission={editItem ? PERM.REGRAS_CONCILIACAO_EDITAR : PERM.REGRAS_CONCILIACAO_CRIAR}>
                            <button
                                type="submit"
                                disabled={!podeSalvar}
                                className="px-8 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 min-w-[120px]"
                            >
                                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin"/>}
                                Salvar
                            </button>
                        </RequiresPermission>
                    </div>
                </form>
            </div>
            <ConfirmDialog {...ConfirmDialogProps} />
            {parceiroSubModal && (
                <NovoParceiroModal
                    key={parceiroSubModal.mode === "edit" ? parceiroSubModal.data.id : "new-parceiro"}
                    initialData={parceiroSubModal.mode === "edit" ? parceiroSubModal.data : null}
                    onClose={() => setParceiroSubModal(null)}
                    onSaved={() => {
                        void queryClient.invalidateQueries({queryKey: ["parceiros-modal"]});
                    }}
                />
            )}
        </div>,
        document.body,
    );
}
