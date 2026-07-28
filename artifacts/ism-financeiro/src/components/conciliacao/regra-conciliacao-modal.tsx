import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {Loader2, X, Sparkles} from "lucide-react";

type ContaOption = { id: number; nome: string };
type ParceiroOption = { id: number; nome: string };
type PlanoContaOption = { id: number; categoria: string; subcategoria: string | null };
type DepartamentoOption = { id: number; nome: string };
type CentroCustoOption = { id: number; nome: string; departamento_id: number | null };

export type RegraConciliacaoItem = {
    id: number;
    conta_id: number | null;
    texto_gatilho: string;
    tipo_match: "contem" | "inicia" | "regex";
    natureza: "entrada" | "saida";
    plano_conta_id: number | null;
    parceiro_id: number | null;
    departamento_id: number | null;
    centro_custo_id: number | null;
    forma_pagamento: string | null;
    criar_lancamento_automatico: boolean;
    prioridade: number;
    ativo: boolean;
};

type RegraConciliacaoModalProps = {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editItem?: RegraConciliacaoItem | null;
    /**
     * RN-D3/Card 48: atalho "cadastrar regra de repetição a partir desta
     * linha" - abre já com texto_gatilho, natureza e conta preenchidos a
     * partir da linha do extrato de origem.
     */
    prefill?: {
        texto_gatilho?: string;
        natureza?: "entrada" | "saida";
        conta_id?: number | null;
    };
};

export function RegraConciliacaoModal({open, onClose, onSuccess, editItem, prefill}: RegraConciliacaoModalProps) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const isEdit = Boolean(editItem);

    const [contaId, setContaId] = useState<string>("");
    const [textoGatilho, setTextoGatilho] = useState("");
    const [tipoMatch, setTipoMatch] = useState<"contem" | "inicia" | "regex">("contem");
    const [natureza, setNatureza] = useState<"entrada" | "saida">("saida");
    const [planoContaId, setPlanoContaId] = useState<string>("");
    const [parceiroId, setParceiroId] = useState<string>("");
    const [departamentoId, setDepartamentoId] = useState<string>("");
    const [centroCustoId, setCentroCustoId] = useState<string>("");
    const [formaPagamento, setFormaPagamento] = useState<string>("");
    const [criarLancamentoAutomatico, setCriarLancamentoAutomatico] = useState(true);
    const [prioridade, setPrioridade] = useState("0");
    const [ativo, setAtivo] = useState(true);
    const [regexError, setRegexError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (editItem) {
            setContaId(editItem.conta_id != null ? String(editItem.conta_id) : "");
            setTextoGatilho(editItem.texto_gatilho);
            setTipoMatch(editItem.tipo_match);
            setNatureza(editItem.natureza);
            setPlanoContaId(editItem.plano_conta_id != null ? String(editItem.plano_conta_id) : "");
            setParceiroId(editItem.parceiro_id != null ? String(editItem.parceiro_id) : "");
            setDepartamentoId(editItem.departamento_id != null ? String(editItem.departamento_id) : "");
            setCentroCustoId(editItem.centro_custo_id != null ? String(editItem.centro_custo_id) : "");
            setFormaPagamento(editItem.forma_pagamento ?? "");
            setCriarLancamentoAutomatico(editItem.criar_lancamento_automatico);
            setPrioridade(String(editItem.prioridade));
            setAtivo(editItem.ativo);
        } else {
            setContaId(prefill?.conta_id != null ? String(prefill.conta_id) : "");
            setTextoGatilho(prefill?.texto_gatilho ?? "");
            setTipoMatch("contem");
            setNatureza(prefill?.natureza ?? "saida");
            setPlanoContaId("");
            setParceiroId("");
            setDepartamentoId("");
            setCentroCustoId("");
            setFormaPagamento("");
            setCriarLancamentoAutomatico(true);
            setPrioridade("0");
            setAtivo(true);
        }
        setRegexError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editItem?.id]);

    const {data: contas = []} = useQuery<ContaOption[]>({
        queryKey: ["contas-bancarias-regra-conciliacao"],
        queryFn: () => fetchApiData<ContaOption[]>("/contas-bancarias"),
        enabled: open,
    });
    const {data: parceiros = []} = useQuery<ParceiroOption[]>({
        queryKey: ["parceiros-regra-conciliacao"],
        queryFn: () => fetchApiData<ParceiroOption[]>("/parceiros?limit=200"),
        enabled: open,
    });
    const {data: planoContas = []} = useQuery<PlanoContaOption[]>({
        queryKey: ["plano-contas-regra-conciliacao"],
        queryFn: () => fetchApiData<PlanoContaOption[]>("/plano-contas"),
        enabled: open,
    });
    const {data: departamentos = []} = useQuery<DepartamentoOption[]>({
        queryKey: ["departamentos-regra-conciliacao"],
        queryFn: () => fetchApiData<DepartamentoOption[]>("/departamentos"),
        enabled: open,
    });
    const {data: centrosCusto = []} = useQuery<CentroCustoOption[]>({
        queryKey: ["centros-custo-regra-conciliacao"],
        queryFn: () => fetchApiData<CentroCustoOption[]>("/centros-custos"),
        enabled: open,
        retry: false,
    });

    const centrosCustoFiltrados = departamentoId
        ? centrosCusto.filter((cc) => cc.departamento_id === Number(departamentoId))
        : centrosCusto;

    // RN-C: regex inválida não pode ser salva (evita descartar a regra em
    // silêncio no motor de matching).
    useEffect(() => {
        if (tipoMatch !== "regex" || !textoGatilho) {
            setRegexError(null);
            return;
        }
        try {
            new RegExp(textoGatilho);
            setRegexError(null);
        } catch {
            setRegexError("Expressão regular inválida.");
        }
    }, [tipoMatch, textoGatilho]);

    const mutation = useMutation({
        mutationFn: () => {
            const payload = {
                conta_id: contaId ? Number(contaId) : null,
                texto_gatilho: textoGatilho.trim(),
                tipo_match: tipoMatch,
                natureza,
                plano_conta_id: planoContaId ? Number(planoContaId) : null,
                parceiro_id: parceiroId ? Number(parceiroId) : null,
                departamento_id: departamentoId ? Number(departamentoId) : null,
                centro_custo_id: centroCustoId ? Number(centroCustoId) : null,
                forma_pagamento: formaPagamento || null,
                criar_lancamento_automatico: criarLancamentoAutomatico,
                prioridade: Number(prioridade) || 0,
                ativo,
            };
            return isEdit
                ? fetchApiData(`/regras-conciliacao/${editItem!.id}`, {method: "PUT", body: JSON.stringify(payload)})
                : fetchApiData("/regras-conciliacao", {method: "POST", body: JSON.stringify(payload)});
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["regras-conciliacao"]});
            toast({
                title: isEdit ? "Regra atualizada" : "Regra criada",
                description: isEdit
                    ? "As alterações foram salvas."
                    : "A regra passa a valer nas próximas importações.",
            });
            onSuccess();
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro ao salvar regra",
                description: e instanceof Error ? e.message : "Não foi possível salvar a regra.",
            });
        },
    });

    if (!open) return null;

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary/50";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block";
    const podeSalvar = textoGatilho.trim().length > 0 && !regexError;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-sky-300"/>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">{isEdit ? "Editar regra" : "Nova regra de conciliação"}</h2>
                            <p className="text-xs text-muted-foreground">
                                Classifica (e opcionalmente cria) lançamentos repetitivos automaticamente
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
                        if (podeSalvar) mutation.mutate();
                    }}
                    className="p-5 space-y-4 overflow-y-auto">
                    <div>
                        <span className={labelCls}>Texto gatilho</span>
                        <input type="text" value={textoGatilho} onChange={(e) => setTextoGatilho(e.target.value)}
                               className={inputCls} placeholder="Ex: TARIFA PACOTE DE SERVICOS" required/>
                        {regexError && <p className="text-[10px] text-destructive mt-1">{regexError}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <span className={labelCls}>Tipo de correspondência</span>
                            <select value={tipoMatch} onChange={(e) => setTipoMatch(e.target.value as typeof tipoMatch)}
                                    className={inputCls}>
                                <option value="contem">Contém</option>
                                <option value="inicia">Inicia com</option>
                                <option value="regex">Expressão regular</option>
                            </select>
                        </div>
                        <div>
                            <span className={labelCls}>Natureza</span>
                            <select value={natureza} onChange={(e) => setNatureza(e.target.value as typeof natureza)}
                                    className={inputCls}>
                                <option value="entrada">Entrada (crédito)</option>
                                <option value="saida">Saída (débito)</option>
                            </select>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Regras de entrada e saída são independentes - nunca se misturam.
                            </p>
                        </div>
                    </div>

                    <div>
                        <span className={labelCls}>Conta bancária</span>
                        <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={inputCls}>
                            <option value="">Todas as contas</option>
                            {contas.map((c) => (
                                <option key={c.id} value={c.id}>{c.nome}</option>
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

                    <div>
                        <span className={labelCls}>Cliente/Fornecedor (opcional)</span>
                        <select value={parceiroId} onChange={(e) => setParceiroId(e.target.value)} className={inputCls}>
                            <option value="">Nenhum</option>
                            {parceiros.map((p) => (
                                <option key={p.id} value={p.id}>{p.nome}</option>
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

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <span className={labelCls}>Forma de pagamento (opcional)</span>
                            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className={inputCls}>
                                <option value="">Não informar</option>
                                <option value="PIX">PIX</option>
                                <option value="TED">TED</option>
                                <option value="Boleto">Boleto</option>
                            </select>
                        </div>
                        <div>
                            <span className={labelCls}>Prioridade</span>
                            <input type="number" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}
                                   className={inputCls} min={0}/>
                            <p className="text-[10px] text-muted-foreground mt-1">Maior número = mais prioridade.</p>
                        </div>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={criarLancamentoAutomatico}
                               onChange={(e) => setCriarLancamentoAutomatico(e.target.checked)}
                               className="mt-1"/>
                        <div>
                            <span className="text-sm font-medium text-white">Criar lançamento automaticamente</span>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                Quando casar, a linha já nasce vinculada e quitada (sugestão revisável - pode ser
                                desfeita por linha antes de concluir a conciliação). Se desmarcado, a regra só
                                classifica, sem criar/vincular nada.
                            </p>
                        </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)}/>
                        <span className="text-sm font-medium text-white">Regra ativa</span>
                    </label>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5">
                            Cancelar
                        </button>
                        <button type="submit" disabled={mutation.isPending || !podeSalvar}
                                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin"/>}
                            {isEdit ? "Salvar alterações" : "Criar regra"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}