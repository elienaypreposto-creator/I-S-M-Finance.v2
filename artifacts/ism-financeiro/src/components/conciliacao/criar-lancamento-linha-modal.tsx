import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {formatCurrency} from "@/lib/utils";
import {Loader2, X, Plus} from "lucide-react";
import {invalidateRelated} from "@/App";

type ParceiroOption = { id: number; nome: string };
type PlanoContaOption = { id: number; categoria: string; subcategoria: string | null };
type DepartamentoOption = { id: number; nome: string };
type CentroCustoOption = { id: number; nome: string; departamento_id: number | null };

type CriarLancamentoLinhaModalProps = {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    extratoId: string;
    linha: {
        id: number;
        tipoMovimento: "credito" | "debito";
        dataMovimento: string | null;
        valorAbs: string | number;
        descricao: string | null;
    };
};

/**
 * RN-D3 (Card [+]): cria um lançamento a partir de uma linha do extrato sem
 * lançamento correspondente (ex.: antecipação de lucro do sócio). Vem
 * pré-preenchido com data/valor/natureza/descrição da linha; ao salvar, já
 * nasce vinculado e quitado por ela - sem passo extra de vincular.
 */
export function CriarLancamentoLinhaModal({open, onClose, onSuccess, extratoId, linha}: CriarLancamentoLinhaModalProps) {
    const {toast} = useToast();
    const queryClient = useQueryClient();

    const tipo = linha.tipoMovimento === "credito" ? "CR" : "CP";

    const [vencimento, setVencimento] = useState(linha.dataMovimento ?? new Date().toISOString().slice(0, 10));
    const [descricao, setDescricao] = useState(linha.descricao ?? "");
    const [parceiroId, setParceiroId] = useState<string>("");
    const [planoContaId, setPlanoContaId] = useState<string>("");
    const [departamentoId, setDepartamentoId] = useState<string>("");
    const [centroCustoId, setCentroCustoId] = useState<string>("");
    const [formaPagamento, setFormaPagamento] = useState<string>("");

    useEffect(() => {
        if (!open) return;
        setVencimento(linha.dataMovimento ?? new Date().toISOString().slice(0, 10));
        setDescricao(linha.descricao ?? "");
        setParceiroId("");
        setPlanoContaId("");
        setDepartamentoId("");
        setCentroCustoId("");
        setFormaPagamento("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, linha.id]);

    const {data: parceiros = []} = useQuery<ParceiroOption[]>({
        queryKey: ["parceiros-criar-lancamento-linha"],
        queryFn: () => fetchApiData<ParceiroOption[]>("/parceiros?limit=200"),
        enabled: open,
    });

    const {data: planoContas = []} = useQuery<PlanoContaOption[]>({
        queryKey: ["plano-contas-criar-lancamento-linha"],
        queryFn: () => fetchApiData<PlanoContaOption[]>("/plano-contas"),
        enabled: open,
    });

    const {data: departamentos = []} = useQuery<DepartamentoOption[]>({
        queryKey: ["departamentos-criar-lancamento-linha"],
        queryFn: () => fetchApiData<DepartamentoOption[]>("/departamentos"),
        enabled: open,
    });

    const {data: centrosCusto = []} = useQuery<CentroCustoOption[]>({
        queryKey: ["centros-custo-criar-lancamento-linha"],
        queryFn: () => fetchApiData<CentroCustoOption[]>("/centros-custos"),
        enabled: open,
        retry: false,
    });

    const centrosCustoFiltrados = departamentoId
        ? centrosCusto.filter((cc) => cc.departamento_id === Number(departamentoId))
        : centrosCusto;

    const mutation = useMutation({
        mutationFn: () =>
            fetchApiData(`/conciliacoes/linhas/${linha.id}/criar-lancamento`, {
                method: "POST",
                body: JSON.stringify({
                    tipo,
                    vencimento,
                    valor: Number(linha.valorAbs),
                    descricao: descricao.trim() || null,
                    parceiro_id: parceiroId ? Number(parceiroId) : null,
                    plano_conta_id: planoContaId ? Number(planoContaId) : null,
                    departamento_id: departamentoId ? Number(departamentoId) : null,
                    centro_custo_id: centroCustoId ? Number(centroCustoId) : null,
                    forma_pagamento: formaPagamento || null,
                }),
            }),
        onSuccess: () => {
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            toast({
                title: "Lançamento criado",
                description: "A linha foi conciliada automaticamente com o novo lançamento.",
            });
            onSuccess();
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro ao criar lançamento",
                description: e instanceof Error ? e.message : "Não foi possível criar o lançamento.",
            });
        },
    });

    if (!open) return null;

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary/50";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block";

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                            <Plus className="w-5 h-5 text-emerald-400"/>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Criar lançamento</h2>
                            <p className="text-xs text-muted-foreground">
                                A partir da linha #{linha.id} - fica conciliada ao salvar
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose}
                            className="p-2 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        mutation.mutate();
                    }}
                    className="p-5 space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <span className={labelCls}>Natureza</span>
                            <div
                                className={`px-3 py-2 rounded-xl text-sm font-black border ${
                                    tipo === "CR"
                                        ? "bg-teal-500/15 text-teal-300 border-teal-500/25"
                                        : "bg-orange-500/15 text-orange-300 border-orange-500/25"
                                }`}>
                                {tipo === "CR" ? "Entrada (CR)" : "Saída (CP)"}
                            </div>
                        </div>
                        <div>
                            <span className={labelCls}>Valor</span>
                            <div className="px-3 py-2 rounded-xl text-sm font-bold text-white bg-white/5 border border-white/10">
                                {formatCurrency(Number(linha.valorAbs))}
                            </div>
                        </div>
                    </div>

                    <div>
                        <span className={labelCls}>Vencimento</span>
                        <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)}
                               className={inputCls} required/>
                    </div>

                    <div>
                        <span className={labelCls}>Descrição</span>
                        <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                               className={inputCls} placeholder="Ex: Antecipação de lucro - sócio"/>
                    </div>

                    <div>
                        <span className={labelCls}>Cliente/Fornecedor (opcional)</span>
                        <select value={parceiroId} onChange={(e) => setParceiroId(e.target.value)} className={inputCls}>
                            <option value="">Nenhum</option>
                            {parceiros.map((p) => (
                                <option key={p.id} value={p.id}>{p.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <span className={labelCls}>Classificação (opcional)</span>
                        <select value={planoContaId} onChange={(e) => setPlanoContaId(e.target.value)} className={inputCls}>
                            <option value="">Sem classificação</option>
                            {planoContas.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.categoria}{p.subcategoria ? ` - ${p.subcategoria}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <span className={labelCls}>Departamento (opcional)</span>
                            <select value={departamentoId}
                                    onChange={(e) => {
                                        setDepartamentoId(e.target.value);
                                        setCentroCustoId("");
                                    }}
                                    className={inputCls}>
                                <option value="">Nenhum</option>
                                {departamentos.map((d) => (
                                    <option key={d.id} value={d.id}>{d.nome}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <span className={labelCls}>Centro de custo (opcional)</span>
                            <select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)} className={inputCls}>
                                <option value="">Nenhum</option>
                                {centrosCustoFiltrados.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <span className={labelCls}>Forma de pagamento (opcional)</span>
                        <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className={inputCls}>
                            <option value="">Não informar</option>
                            <option value="PIX">PIX</option>
                            <option value="TED">TED</option>
                            <option value="Boleto">Boleto</option>
                        </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5">
                            Cancelar
                        </button>
                        <button type="submit" disabled={mutation.isPending}
                                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
                            Criar e conciliar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}