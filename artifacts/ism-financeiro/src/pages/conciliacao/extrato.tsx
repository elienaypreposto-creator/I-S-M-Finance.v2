import {useMemo, useState, useEffect} from "react";
import {useLocation} from "wouter";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {formatCurrency, formatDate, cn} from "@/lib/utils";
import {VincularModal} from "@/components/conciliacao/vincular-modal";
import {IgnorarLinhaModal, type MotivoIgnorarPayload} from "@/components/conciliacao/ignorar-linha-modal";
import {EditarLancamentoConciliacaoModal} from "@/components/conciliacao/editar-lancamento-modal";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {RequiresPermission} from "@/components/auth/requires-permission";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    FileText,
    Link2,
    Ban,
    CheckCircle2,
    RotateCcw,
    Unlink,
    Pencil,
    Plus,
    X,
    Search,
    Copy,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    RefreshCw,
    Filter,
    Download,
} from "lucide-react";
import {invalidateRelated} from "@/App";
import {formatValorBrInput, brMoneyDisplayToApiString} from "@/validations/lancamentos.schema";
// AJUSTAR este caminho: aponte para onde você salvou o novo arquivo
// lancamento-modal.tsx — o mais simples é colocá-lo na MESMA PASTA do seu
// Lancamentos.tsx (ex.: src/pages/lancamentos/lancamento-modal.tsx) e usar
// o alias correspondente, ex.: "@/pages/lancamentos/lancamento-modal".
import { LancamentoModal } from "@/components/lancamentos/lancamento-modal";

type ExtratoDetalheExtrato = {
    id: number;
    conta_id: number;
    conta_nome: string | null;
    status: string;
    arquivo_nome: string | null;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    total_linhas: number;
    total_creditos: string | number;
    total_debitos: string | number;
    saldo_final_banco: string | number | null;
    saldo_banco_data: string | null;
    created_at: string;
};

type ConciliacaoResumo = {
    id: number;
    status: string;
    resumo_conciliados: number;
    resumo_ignorados: number;
    resumo_pendentes: number;
    resumo_total: number;
    resumo_classificadas_automaticamente?: number;
};

type VinculacaoDetalhe = {
    /** id da linha em itens_conciliacao_lancamentos - necessário pra editar/remover o vínculo individualmente (RN-G7/RN-I7). Opcional: se o backend ainda não devolver isso, os botões caem no fallback "desfazer todos". */
    vinculo_id?: number;
    lancamento_id: number;
    descricao: string | null;
    tipo: string;
    status: string;
    /** Flag do título residual (DEF-08) — não inferir por status pendente. */
    is_residuo_parcial?: boolean;
    valor_vinculado: string | number;
    desconto: string | number;
    acrescimo?: string | number;
    juros_multa?: string | number;
    /** Vencimento do residual = origem (imutável — Decisão nº 3). */
    vencimento?: string | null;
};

export type LinhaDetalhe = {
    linha_id: number;
    tipo_movimento: string;
    descricao: string | null;
    valor: string | number;
    data_movimento: string | null;
    documento: string | null;
    status: string;
    valor_vinculado_total: string | number;
    valor_saldo: string | number;
    saldo_pos_linha: string | number | null;
    vinculacoes: VinculacaoDetalhe[];
    /** Card 48 / FEAT-03 */
    regra_id?: number | null;
    classificacao_automatica?: boolean;
    regra_texto_gatilho?: string | null;
    regra_criar_lancamento?: boolean | null;
};

type DiagnosticoSaldoInicial = {
    data_referencia: string;
    extrato_anterior_id: number;
    saldo_sistema: number;
    saldo_extrato_anterior: number;
    diferenca: number;
    bate: boolean;
};

type DiagnosticoSaldo = {
    data_referencia: string;
    saldo_sistema: number;
    saldo_banco: number | null;
    diferenca: number | null;
    bate: boolean | null;
    diagnostico: string;
    linhas_ignoradas_valor: number;
    linhas_ignoradas_explicam: boolean;
    saldo_inicial: DiagnosticoSaldoInicial | null;
} | null;

type ExtratoDetalheResponse = {
    extrato: ExtratoDetalheExtrato;
    conciliacao: ConciliacaoResumo;
    linhas: LinhaDetalhe[];
    // OBS: o diagnóstico de saldo continua vindo nesta resposta, mas deixou
    // de ser exibido aqui — a exibição foi movida para a tela Home/Dashboard
    // (ver Dashboard.tsx). Mantido no tipo para não quebrar o contrato com o
    // backend; se a Home passar a ter um endpoint próprio, este campo pode
    // ser removido daqui.
    diagnostico: DiagnosticoSaldo;
};

function statusExtratoBadge(status: string) {
    switch (status) {
        case "conciliado":
            return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
        case "parcial":
            return "bg-amber-500/15 text-amber-300 border-amber-500/30";
        case "cancelado":
            return "bg-white/10 text-muted-foreground border-white/15";
        default:
            return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    }
}

function statusLinhaBadge(status: string) {
    switch (status) {
        case "vinculado":
            return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
        case "ignorado":
            return "bg-white/10 text-muted-foreground border-white/15";
        default:
            return "bg-amber-500/15 text-amber-200 border-amber-500/25";
    }
}

/**
 * RN-D2: cor semântica por natureza — crédito/entrada = VERDE, débito/saída
 * = VERMELHO. O código anterior usava teal/orange; o card pede explicitamente
 * vermelho/verde, então padronizei aqui (não em todo o app, só neste módulo).
 */
function corNaturezaBadge(isCredito: boolean) {
    return isCredito
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
        : "bg-red-500/15 text-red-300 border-red-500/25";
}

function corNaturezaTexto(isCredito: boolean) {
    return isCredito ? "text-emerald-300" : "text-red-300";
}

/**
 * Card de lançamento (coluna direita): Desconto / Juros-Multa editáveis (RN-G7).
 * Residual parcial: vencimento = origem, **não editável** (Decisão nº 3).
 * Padding/gaps reduzidos para acompanhar a densidade do protótipo (imagem 2).
 */
function CardLancamento({
                            v,
                            extratoId,
                            linhaId,
                            canEditarLancamento,
                            canDesfazer,
                            onEditarLancamento,
                            onRemoverVinculo,
                        }: {
    v: VinculacaoDetalhe;
    extratoId: string;
    linhaId: number;
    canEditarLancamento: boolean;
    canDesfazer: boolean;
    onEditarLancamento: () => void;
    onRemoverVinculo: () => void;
}) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [editando, setEditando] = useState<null | "desconto" | "juros_multa">(null);
    const [valorEdicao, setValorEdicao] = useState("");

    const jurosOuAcrescimo = v.juros_multa ?? v.acrescimo ?? 0;
    const isCredito = v.tipo === "CR";
    const isResidual = Boolean(v.is_residuo_parcial);

    const duplicarMutation = useMutation({
        mutationFn: async () => {
            const original = await fetchApiData<Record<string, unknown>>(`/lancamentos/${v.lancamento_id}`);
            return fetchApiData("/lancamentos", {
                method: "POST",
                body: JSON.stringify({
                    tipo: original.tipo,
                    vencimento: original.vencimento,
                    competencia: original.competencia ?? null,
                    conta_id: original.conta_id ?? null,
                    parceiro_id: original.parceiro_id ?? null,
                    descricao: original.descricao ?? null,
                    valor: original.valor,
                    plano_conta_id: original.plano_conta_id ?? null,
                    departamento_id: original.departamento_id ?? null,
                    centro_custo_id: original.centro_custo_id ?? null,
                    forma_pagamento: original.forma_pagamento ?? null,
                    dados_pagamento: original.dados_pagamento ?? null,
                    // Cópia nasce solta (pendente, sem vínculo) - o usuário decide
                    // depois com qual linha do extrato ela vai conciliar.
                    status: "pendente",
                }),
            });
        },
        onSuccess: () => {
            invalidateRelated(queryClient, "lancamentos");
            toast({
                title: "Lançamento duplicado",
                description: "Uma cópia pendente foi criada, sem vínculo com esta linha.",
            });
        },
        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Não foi possível duplicar",
                description: e instanceof Error ? e.message : String(e),
            }),
    });

    const atualizarValorMutation = useMutation({
        mutationFn: (payload: { campo: "desconto" | "juros_multa"; valor: string }) => {
            if (!v.vinculo_id) {
                throw new Error("Sem vinculo_id - backend precisa expor esse campo em GET /conciliacoes/:id.");
            }
            const body = {[payload.campo]: brMoneyDisplayToApiString(payload.valor) || "0.00"};
            return fetchApiData(`/conciliacoes/vinculos/${v.vinculo_id}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            setEditando(null);
        },
        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Não foi possível atualizar",
                description: e instanceof Error ? e.message : String(e),
            }),
    });

    function iniciarEdicao(campo: "desconto" | "juros_multa") {
        if (!canEditarLancamento) return;
        const atual = campo === "desconto" ? v.desconto : jurosOuAcrescimo;
        setValorEdicao(formatValorBrInput(String(Number(atual) || 0).replace(".", ",")));
        setEditando(campo);
    }

    return (
        <li className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
                {isResidual ? (
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-300 shrink-0"/>
                        Gerar movimentação residual
                    </label>
                ) : (
                    <span className="text-white/90 font-medium text-[12px] truncate min-w-0" title={v.descricao ?? ""}>
                        #{v.lancamento_id} · {v.descricao ?? "—"}
                    </span>
                )}
                <span className={cn("text-[9px] font-bold px-1 rounded shrink-0", corNaturezaTexto(isCredito))}>
                    {v.tipo}
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                    {/* RN-I7: 📄 detalhar - reaproveita o modal "Editar lançamento" já existente */}
                    {canEditarLancamento && (
                        <button
                            type="button"
                            title="Detalhar / editar lançamento"
                            onClick={onEditarLancamento}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white">
                            <FileText className="w-3.5 h-3.5"/>
                        </button>
                    )}
                    <button
                        type="button"
                        title="Duplicar lançamento"
                        disabled={duplicarMutation.isPending}
                        onClick={() => duplicarMutation.mutate()}
                        className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white disabled:opacity-40">
                        {duplicarMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                        ) : (
                            <Copy className="w-3.5 h-3.5"/>
                        )}
                    </button>
                    {canDesfazer && (
                        <button
                            type="button"
                            title="Remover vínculo"
                            onClick={onRemoverVinculo}
                            className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-300">
                            <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
                <div>
                    <span
                        className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Desconto</span>
                    {editando === "desconto" ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={valorEdicao}
                                onChange={(e) => setValorEdicao(formatValorBrInput(e.target.value))}
                                onKeyDown={(e) => e.key === "Enter" && atualizarValorMutation.mutate({
                                    campo: "desconto",
                                    valor: valorEdicao
                                })}
                                className="w-full bg-[#1a1c23] border border-primary/40 rounded px-1.5 py-1 text-xs text-white outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => atualizarValorMutation.mutate({campo: "desconto", valor: valorEdicao})}
                                title="Confirmar"
                                className="p-1 rounded hover:bg-primary/20 text-primary shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={!canEditarLancamento}
                            onClick={() => iniciarEdicao("desconto")}
                            className="flex items-center gap-1 text-xs text-white/90 mt-0.5 group disabled:opacity-60">
                            {formatCurrency(Number(v.desconto) || 0)}
                            {canEditarLancamento && (
                                <Pencil className="w-3 h-3 text-muted-foreground group-hover:text-primary"/>
                            )}
                        </button>
                    )}
                </div>
                <div>
                    <span
                        className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Juros/Multa</span>
                    {editando === "juros_multa" ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={valorEdicao}
                                onChange={(e) => setValorEdicao(formatValorBrInput(e.target.value))}
                                onKeyDown={(e) => e.key === "Enter" && atualizarValorMutation.mutate({
                                    campo: "juros_multa",
                                    valor: valorEdicao
                                })}
                                className="w-full bg-[#1a1c23] border border-primary/40 rounded px-1.5 py-1 text-xs text-white outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => atualizarValorMutation.mutate({
                                    campo: "juros_multa",
                                    valor: valorEdicao
                                })}
                                title="Confirmar"
                                className="p-1 rounded hover:bg-primary/20 text-primary shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={!canEditarLancamento}
                            onClick={() => iniciarEdicao("juros_multa")}
                            className="flex items-center gap-1 text-xs text-white/90 mt-0.5 group disabled:opacity-60">
                            {formatCurrency(Number(jurosOuAcrescimo) || 0)}
                            {canEditarLancamento && (
                                <Pencil className="w-3 h-3 text-muted-foreground group-hover:text-primary"/>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                {/* Decisão nº 3: vencimento do residual = origem, somente leitura. */}
                {isResidual ? (
                    <span title="Vencimento herdado da origem (não editável)">
                        {v.vencimento ? formatDate(v.vencimento) : "vencimento da origem"}
                    </span>
                ) : (
                    <span className="uppercase text-[9px]">{v.status}</span>
                )}
                <span className={cn("font-bold", corNaturezaTexto(isCredito))}>
                    {formatCurrency(Number(v.valor_vinculado))}
                </span>
            </div>
        </li>
    );
}

const LINHAS_POR_PAGINA = 6;
/** Tolerância em reais para considerar o saldo da linha "zerado" (evita
 *  ruído de arredondamento de ponto flutuante). */
const TOLERANCIA_SALDO = 0.005;
/** Busca automática por descrição: quantidade mínima de caracteres para
 *  disparar o filtro sozinho, e tempo de debounce (ms) para não refiltrar
 *  a cada tecla digitada. */
const BUSCA_MIN_CHARS = 3;
const BUSCA_DEBOUNCE_MS = 350;

export default function ConciliacaoExtratoDetalhe({extratoId}: { extratoId: string }) {
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {hasPermission} = useAuth();

    const canVincular = hasPermission(PERM.CONCILIACAO_VINCULAR);
    const canIgnorar = hasPermission(PERM.CONCILIACAO_IGNORAR);
    const canDesfazer = hasPermission(PERM.CONCILIACAO_DESFAZER);
    const canEditarLancamento = hasPermission(PERM.LANCAMENTOS_EDITAR);

    const [vincularLinha, setVincularLinha] = useState<{ id: number; valorAbs: string | number } | null>(null);
    const [ignorarLinhaId, setIgnorarLinhaId] = useState<number | null>(null);
    const [reverterLinhaId, setReverterLinhaId] = useState<number | null>(null);
    const [desfazerLinhaId, setDesfazerLinhaId] = useState<number | null>(null);
    const [finalizarOpen, setFinalizarOpen] = useState(false);
    const [editarLancamentoId, setEditarLancamentoId] = useState<number | null>(null);
    // RN-D3 - [+] verde: criar lançamento a partir da linha (agora usando o
    // formulário completo de Novo Lançamento, igual à tela de Lançamentos).
    const [novoLancamentoLinha, setNovoLancamentoLinha] = useState<LinhaDetalhe | null>(null);
    // RN-D5 - navegação ‹ › entre as linhas, sem sair da tela.
    const [pagina, setPagina] = useState(0);

    // Barra de filtros (Tipo / Status / Pesquisar / Aplicar) - igual ao protótipo.
    // Tipo e Status só afetam a lista quando o usuário clica em "Aplicar"
    // (filtrosAplicados). A Pesquisa (por descrição) é diferente: ela é
    // aplicada sozinha assim que o usuário digita pelo menos
    // BUSCA_MIN_CHARS caracteres, com um pequeno debounce (ver useEffect
    // abaixo) — "Aplicar" e Enter continuam funcionando como atalho manual.
    const [filtroTipo, setFiltroTipo] = useState<"todos" | "credito" | "debito">("todos");
    const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendente" | "vinculado" | "ignorado">("todos");
    const [buscaTexto, setBuscaTexto] = useState("");
    const [filtrosAplicados, setFiltrosAplicados] = useState<{
        tipo: "todos" | "credito" | "debito";
        status: "todos" | "pendente" | "vinculado" | "ignorado";
        busca: string;
    }>({tipo: "todos", status: "todos", busca: ""});

    // Busca automática por nome/descrição: dispara sozinha a partir de
    // BUSCA_MIN_CHARS caracteres digitados. Se o campo for esvaziado, o
    // filtro de busca é limpo na hora (sem esperar debounce).
    useEffect(() => {
        const termo = buscaTexto.trim();

        if (termo.length === 0) {
            setFiltrosAplicados((prev) => (prev.busca === "" ? prev : {...prev, busca: ""}));
            return;
        }

        if (termo.length < BUSCA_MIN_CHARS) return;

        const timeoutId = setTimeout(() => {
            setFiltrosAplicados((prev) => (prev.busca === termo ? prev : {...prev, busca: termo}));
            setPagina(0);
        }, BUSCA_DEBOUNCE_MS);

        return () => clearTimeout(timeoutId);
    }, [buscaTexto]);

    function aplicarFiltros() {
        setFiltrosAplicados({tipo: filtroTipo, status: filtroStatus, busca: buscaTexto.trim()});
        setPagina(0);
    }

    function limparFiltros() {
        setFiltroTipo("todos");
        setFiltroStatus("todos");
        setBuscaTexto("");
        setFiltrosAplicados({tipo: "todos", status: "todos", busca: ""});
        setPagina(0);
    }

    const {data, isLoading, isError, refetch} = useQuery({
        queryKey: ["conciliacao-extrato", extratoId],
        queryFn: () => fetchApiData<ExtratoDetalheResponse>(`/conciliacoes/${extratoId}`),
        enabled: !!extratoId,
    });

    const {data: parametros} = useQuery({
        queryKey: ["conciliacoes-parametros"],
        queryFn: () =>
            fetchApiData<{
                motivo_ignorar_obrigatorio: boolean;
                motivos_predefinidos: string[];
            }>("/conciliacoes/parametros"),
        staleTime: 5 * 60_000,
    });
    const motivoObrigatorio = parametros?.motivo_ignorar_obrigatorio ?? false;

    const ignorarMutation = useMutation({
        mutationFn: ({linhaId, payload}: { linhaId: number; payload: MotivoIgnorarPayload }) =>
            fetchApiData<{ linha_id: number; status: string }>(`/conciliacoes/linhas/${linhaId}/ignorar`, {
                method: "POST",
                body: JSON.stringify(payload),
            }),
        onSuccess: () => {
            setIgnorarLinhaId(null);
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            void queryClient.invalidateQueries({queryKey: ["conciliacoes-pendencias-mes"]});
            toast({title: "Linha ignorada", description: "Esta movimentação foi marcada como ignorada."});
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível ignorar.";
            toast({variant: "destructive", title: "Erro", description: msg});
        },
    });

    const reverterIgnorarMutation = useMutation({
        mutationFn: (linhaId: number) =>
            fetchApiData<{ linha_id: number; status: string }>(
                `/conciliacoes/linhas/${linhaId}/reverter-ignorar`,
                {method: "POST", body: JSON.stringify({})},
            ),
        onSuccess: () => {
            setReverterLinhaId(null);
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            toast({title: "Ignorar revertido", description: "A linha voltou a pendente."});
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível reverter.";
            toast({variant: "destructive", title: "Erro", description: msg});
        },
    });

    const desfazerVinculosMutation = useMutation({
        mutationFn: (linhaId: number) =>
            fetchApiData<{ linha_id: number; status: string }>(`/conciliacoes/linhas/${linhaId}/vinculos`, {
                method: "DELETE",
            }),
        onSuccess: () => {
            setDesfazerLinhaId(null);
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            toast({title: "Vínculos desfeitos", description: "A linha voltou a pendente."});
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível desfazer.";
            toast({variant: "destructive", title: "Erro", description: msg});
        },
    });

    const finalizarMutation = useMutation({
        mutationFn: () =>
            fetchApiData<{ extrato_id: number; status: string }>(`/conciliacoes/${extratoId}/finalizar`, {
                method: "POST",
                body: JSON.stringify({}),
            }),
        onSuccess: () => {
            setFinalizarOpen(false);
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            toast({title: "Extrato finalizado", description: "Conciliação concluída com sucesso."});
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível finalizar.";
            toast({variant: "destructive", title: "Erro ao finalizar", description: msg});
        },
    });

    /**
     * Chamado depois que o LancamentoModal cria o lançamento a partir da linha
     * (RN-D3). Vincula automaticamente à linha de origem, sem juros/desconto e
     * sem gerar residual — igual ao comportamento antigo do botão [+], mas
     * agora usando o formulário completo de lançamento. Reaproveita o mesmo
     * endpoint do VincularModal (POST /conciliacoes/linhas/:id/vincular).
     */
    const vincularAutoMutation = useMutation({
        mutationFn: ({linhaId, lancamentoId}: { linhaId: number; lancamentoId: number }) =>
            fetchApiData(`/conciliacoes/linhas/${linhaId}/vincular`, {
                method: "POST",
                body: JSON.stringify({
                    lancamentos: [{lancamento_id: lancamentoId, desconto: "0.00", juros_multa: "0.00"}],
                    gerar_parcial: false,
                }),
            }),
        onSuccess: () => {
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            void queryClient.invalidateQueries({queryKey: ["conciliacoes-pendencias-mes"]});
            toast({title: "Lançamento criado e vinculado", description: "A linha já foi conciliada."});
        },
        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Lançamento criado, mas não foi possível vincular",
                description: e instanceof Error
                    ? `${e.message} — vincule manualmente pelo botão "Vincular".`
                    : "Vincule manualmente pelo botão \"Vincular\".",
            }),
    });

    const extrato = data?.extrato;
    const conc = data?.conciliacao;
    const linhas = data?.linhas ?? [];
    const podeFinalizar = (conc?.resumo_pendentes ?? 1) === 0;
    /** FEAT-05 / Card 57: rótulo dinâmico Salvar / Concluir (nunca "Finalizar/Conciliar"). */
    const rotuloAcaoConciliacao = podeFinalizar ? "Concluir" : "Salvar";

    // Aplica Tipo / Status / Pesquisar sobre a lista antes de paginar.
    const linhasFiltradas = useMemo(() => {
        return linhas.filter((linha) => {
            if (filtrosAplicados.tipo !== "todos" && linha.tipo_movimento !== filtrosAplicados.tipo) return false;
            if (filtrosAplicados.status !== "todos" && linha.status !== filtrosAplicados.status) return false;
            if (filtrosAplicados.busca) {
                const alvo = (linha.descricao ?? "").toLowerCase();
                if (!alvo.includes(filtrosAplicados.busca.toLowerCase())) return false;
            }
            return true;
        });
    }, [linhas, filtrosAplicados]);

    // RN-D5: navegação ‹ › entre as linhas, sem sair da tela.
    const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / LINHAS_POR_PAGINA));
    const paginaAtual = Math.min(pagina, totalPaginas - 1);
    const linhasDaPagina = useMemo(
        () => linhasFiltradas.slice(paginaAtual * LINHAS_POR_PAGINA, paginaAtual * LINHAS_POR_PAGINA + LINHAS_POR_PAGINA),
        [linhasFiltradas, paginaAtual],
    );

    return (
        <div className="flex flex-col gap-4 h-full max-w-6xl mx-auto py-2">
            <button
                type="button"
                onClick={() => setLocation("/conciliacao")}
                className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors w-fit">
                <ArrowLeft className="w-3.5 h-3.5"/>
                Voltar para conciliações
            </button>

            {vincularLinha && (
                <VincularModal
                    open
                    extratoId={extratoId}
                    linhaId={vincularLinha.id}
                    valorExtratoAbs={vincularLinha.valorAbs}
                    onClose={() => setVincularLinha(null)}
                    onSuccess={() => setVincularLinha(null)}
                />
            )}

            {/*
              RN-D3: [+] verde - abre o MESMO formulário completo de "Novo
              Lançamento" usado na tela de Lançamentos, pré-preenchido com
              tipo/vencimento/valor/descrição vindos da linha do extrato. Ao
              salvar, o lançamento é criado e automaticamente vinculado a
              esta linha (vincularAutoMutation) - sem passo extra manual.
            */}
            {novoLancamentoLinha && (
                <LancamentoModal
                    prefill={{
                        tipo: novoLancamentoLinha.tipo_movimento === "credito" ? "CR" : "CP",
                        vencimento: novoLancamentoLinha.data_movimento ?? "",
                        valor: Math.abs(Number(novoLancamentoLinha.valor)),
                        descricao: novoLancamentoLinha.descricao,
                    } satisfies LancamentoPrefill}
                    onClose={() => setNovoLancamentoLinha(null)}
                    onSaved={(created) => {
                        const linhaId = novoLancamentoLinha.linha_id;
                        setNovoLancamentoLinha(null);
                        invalidateRelated(queryClient, "lancamentos");
                        void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
                        if (created?.id) {
                            vincularAutoMutation.mutate({linhaId, lancamentoId: created.id});
                        }
                    }}
                />
            )}

            <IgnorarLinhaModal
                open={ignorarLinhaId != null}
                obrigatorio={motivoObrigatorio}
                pending={ignorarMutation.isPending}
                onClose={() => setIgnorarLinhaId(null)}
                onConfirm={(payload) => {
                    if (ignorarLinhaId == null) return;
                    ignorarMutation.mutate({linhaId: ignorarLinhaId, payload});
                }}
            />

            <ConfirmDialog
                open={reverterLinhaId != null}
                title="Reverter ignorar?"
                description="A linha voltará ao status pendente e poderá ser vinculada novamente. Nenhum motivo é exigido."
                confirmLabel="Reverter"
                variant="warning"
                icon={RotateCcw}
                onCancel={() => setReverterLinhaId(null)}
                onConfirm={() => {
                    if (reverterLinhaId == null) return;
                    reverterIgnorarMutation.mutate(reverterLinhaId);
                }}
            />

            <ConfirmDialog
                open={desfazerLinhaId != null}
                title="Desfazer vínculos?"
                description="Os lançamentos vinculados voltarão ao status anterior e a linha do extrato ficará pendente novamente."
                confirmLabel="Desfazer vínculos"
                variant="destructive"
                icon={Unlink}
                onCancel={() => setDesfazerLinhaId(null)}
                onConfirm={() => {
                    if (desfazerLinhaId == null) return;
                    desfazerVinculosMutation.mutate(desfazerLinhaId);
                }}
            />

            <ConfirmDialog
                open={finalizarOpen}
                title="Concluir conciliação?"
                description="Não pode haver linhas pendentes. Após concluir, o extrato será marcado como conciliado."
                confirmLabel="Concluir"
                variant="default"
                icon={CheckCircle2}
                onCancel={() => setFinalizarOpen(false)}
                onConfirm={() => finalizarMutation.mutate()}
            />

            <EditarLancamentoConciliacaoModal
                open={editarLancamentoId != null}
                lancamentoId={editarLancamentoId}
                onClose={() => setEditarLancamentoId(null)}
                onSaved={() => {
                    void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
                }}
            />

            {isLoading ? (
                <div className="glass-panel rounded-2xl p-16 flex flex-col items-center gap-3 border border-white/10">
                    <Loader2 className="w-10 h-10 animate-spin text-primary"/>
                    <p className="text-sm text-muted-foreground">Carregando extrato…</p>
                </div>
            ) : isError || !extrato || !conc ? (
                <div className="glass-panel rounded-2xl p-10 border border-destructive/30 text-center">
                    <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3"/>
                    <p className="text-sm text-white font-medium">Não foi possível carregar este extrato.</p>
                    <button type="button" onClick={() => void refetch()}
                            className="mt-4 text-xs text-primary underline">
                        Tentar novamente
                    </button>
                </div>
            ) : (
                <>


                    <div
                        className="glass-panel rounded-2xl border border-white/10 overflow-hidden flex flex-col flex-1 min-h-0">
                        {/* Barra de filtros: Tipo, Status, Aplicar, Atualizar, Limpar e Pesquisar (igual ao protótipo) */}
                        <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-white/5 bg-black/10">
                            <select
                                value={filtroTipo}
                                onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                                className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 outline-none focus:border-primary/40">
                                <option value="todos">Tipo</option>
                                <option value="credito">Crédito</option>
                                <option value="debito">Débito</option>
                            </select>

                            <select
                                value={filtroStatus}
                                onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
                                className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 outline-none focus:border-primary/40">
                                <option value="todos">Status</option>
                                <option value="pendente">Pendente</option>
                                <option value="vinculado">Vinculado</option>
                                <option value="ignorado">Ignorado</option>
                            </select>

                            <button
                                type="button"
                                onClick={aplicarFiltros}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold">
                                <Filter className="w-3.5 h-3.5"/>
                                Aplicar
                            </button>

                            <button
                                type="button"
                                title="Atualizar"
                                onClick={() => void refetch()}
                                className="p-1.5 rounded-lg border border-white/10 text-white/80 hover:bg-white/5 hover:text-white">
                                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}/>
                            </button>

                            <button
                                type="button"
                                title="Limpar filtros"
                                onClick={limparFiltros}
                                className="p-1.5 rounded-lg border border-white/10 text-white/80 hover:bg-white/5 hover:text-white">
                                <X className="w-3.5 h-3.5"/>
                            </button>

                            <div className="flex-1"/>

                            <div className="relative w-full sm:w-64">
                                <Search
                                    className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"/>
                                <input
                                    type="text"
                                    value={buscaTexto}
                                    onChange={(e) => setBuscaTexto(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
                                    placeholder="Pesquisar (mín. 3 letras)"
                                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs text-white placeholder:text-muted-foreground outline-none focus:border-primary/40"
                                />
                            </div>
                        </div>

                        {/* Cabeçalho de duas colunas - "Extrato" à esquerda (com o período do
                            extrato ao lado do título) - "Movimentações não conciliadas" à
                            direita - ícones e títulos centralizados. */}
                        <div
                            className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] border-b border-white/5 bg-black/20">
                            <div className="px-3.5 py-2.5 flex items-center justify-center gap-2 flex-wrap">
                                <Download className="w-3.5 h-3.5 text-primary shrink-0"/>
                                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Extrato</h2>
                                {extrato.periodo_inicio && extrato.periodo_fim && (
                                    <span className="text-[10px] font-normal normal-case text-muted-foreground">
                                        · Período {formatDate(extrato.periodo_inicio)} — {formatDate(extrato.periodo_fim)}
                                    </span>
                                )}
                            </div>
                            <div className="hidden xl:block"/>
                            <div className="px-3.5 py-2.5 flex items-center justify-center gap-2 border-t xl:border-t-0 border-white/5">
                                <Unlink className="w-3.5 h-3.5 text-primary shrink-0"/>
                                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Movimentações
                                    não conciliadas</h2>
                            </div>
                        </div>

                        {/*
                          RN-D1: duas colunas - esquerda a linha do extrato, direita o(s)
                          lançamento(s) - com o conector central de estado (RN-D4).
                          Sem barra colorida lateral: a cor semântica agora aparece como
                          sublinhado sob o título e no valor, igual ao protótipo.
                        */}
                        {linhasFiltradas.length === 0 ? (
                            <div className="py-16 text-center text-xs text-muted-foreground">
                                Nenhuma linha encontrada com os filtros aplicados.
                            </div>
                        ) : (
                        <div className="divide-y divide-white/5 overflow-y-auto max-h-[calc(100vh-28rem)]">
                            {linhasDaPagina.map((linha) => {
                                const isPendente = linha.status === "pendente";
                                const isVinculado = linha.status === "vinculado";
                                const isIgnorado = linha.status === "ignorado";
                                const isCredito = linha.tipo_movimento === "credito";
                                const valorAbs = Math.abs(Number(linha.valor));

                                // FIX: o status "vinculado" só indica que existe pelo menos 1
                                // vínculo — não que o valor da linha já foi totalmente coberto.
                                // Antes disso era ignorado e a UI escondia o botão "Vincular"
                                // (e o "+") assim que o primeiro lançamento parcial entrava,
                                // impedindo completar o valor com mais lançamentos.
                                const saldoAbs = Math.abs(Number(linha.valor_saldo));
                                const faltaFechar = saldoAbs > TOLERANCIA_SALDO;
                                const podeVincularMais = !isIgnorado && (isPendente || faltaFechar);

                                return (
                                    <div
                                        key={linha.linha_id}
                                        className={cn(
                                            "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] divide-y xl:divide-y-0 xl:divide-x divide-white/5",
                                            isIgnorado && "opacity-45 grayscale-[0.35] bg-white/[0.015]",
                                        )}
                                    >
                                        {/* ── COLUNA ESQUERDA: linha do extrato ── */}
                                        <div className="p-3 space-y-1.5 min-w-0">
                                            {/* Cabeçalho: badge + data à esquerda, [+] e [⊘ Ignorar]/[↺ Reverter]
                                                juntos à direita, na mesma linha (layout do protótipo). */}
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-2 min-w-0">
                          <span
                              className={cn(
                                  "text-[10px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0",
                                  corNaturezaBadge(isCredito),
                              )}>
                            {linha.tipo_movimento}
                          </span>
                                                    {linha.data_movimento && (
                                                        <span className="text-xs text-muted-foreground truncate">
                                                            {formatDate(linha.data_movimento)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {/* RN-D3: [+] verde - abre o formulário completo de Novo Lançamento.
                                                        Agora fica visível enquanto ainda faltar saldo a fechar, mesmo
                                                        que já exista algum vínculo parcial na linha. */}
                                                    {podeVincularMais && canVincular && (
                                                        <button
                                                            type="button"
                                                            title="Criar lançamento a partir desta linha"
                                                            onClick={() => setNovoLancamentoLinha(linha)}
                                                            className="w-6 h-6 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0">
                                                            <Plus className="w-3.5 h-3.5"/>
                                                        </button>
                                                    )}
                                                    {/* [⊘ Ignorar] ⇄ [↺ Reverter] - ao lado do [+], como no protótipo */}
                                                    {isPendente && canIgnorar && (
                                                        <button
                                                            type="button"
                                                            disabled={ignorarMutation.isPending}
                                                            onClick={() => setIgnorarLinhaId(linha.linha_id)}
                                                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/90 whitespace-nowrap">
                                                            <Ban className="w-3 h-3"/>
                                                            Ignorar
                                                        </button>
                                                    )}
                                                    {isIgnorado && canDesfazer && (
                                                        <button
                                                            type="button"
                                                            disabled={reverterIgnorarMutation.isPending}
                                                            onClick={() => setReverterLinhaId(linha.linha_id)}
                                                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[11px] font-semibold text-amber-200 whitespace-nowrap">
                                                            <RotateCcw className="w-3 h-3"/>
                                                            Reverter
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="text-sm text-white font-medium leading-snug">
                                                {linha.descricao ?? "—"}
                                            </p>

                                            <span className={cn("block text-lg font-black", corNaturezaTexto(isCredito))}>
                          {formatCurrency(valorAbs)}
                        </span>

                                            {/* Quando já existe vínculo parcial, mostra quanto ainda falta —
                                                senão o usuário não entende por que o botão "Vincular" voltou
                                                a aparecer numa linha que já tem lançamento associado. */}
                                            {isVinculado && faltaFechar && (
                                                <p className="text-[11px] text-amber-300/90">
                                                    Falta vincular {formatCurrency(saldoAbs)}
                                                </p>
                                            )}

                                            {linha.classificacao_automatica && (
                                                <p className="text-[11px] text-sky-300/90 bg-sky-500/10 border border-sky-500/25 rounded-lg px-2 py-1 inline-flex items-center gap-1.5">
                                                    <Sparkles className="w-3 h-3 shrink-0"/>
                                                    {linha.status === "pendente" && linha.regra_criar_lancamento
                                                        ? "Essa movimentação será criada"
                                                        : linha.status === "pendente"
                                                            ? "Classificação sugerida pela regra — revise"
                                                            : "Classificada automaticamente pela regra"}
                                                    {linha.regra_texto_gatilho
                                                        ? ` (“${linha.regra_texto_gatilho}”)`
                                                        : ""}
                                                </p>
                                            )}

                                            {linha.documento && (
                                                <p className="text-[10px] text-muted-foreground font-mono">Doc.
                                                    {" "}{linha.documento}</p>
                                            )}
                                            {linha.saldo_pos_linha != null && (
                                                <p className="text-[11px] text-muted-foreground">
                                                    Saldo pós-linha: {formatCurrency(Number(linha.saldo_pos_linha))}
                                                </p>
                                            )}
                                        </div>

                                        {/* ── COLUNA CENTRAL: conector (RN-D4) ── */}
                                        <div className="flex items-center justify-center py-1.5 xl:py-2">
                                            {!isIgnorado && (
                                                <div
                                                    className={cn(
                                                        "w-7 h-7 rounded-full flex items-center justify-center border shrink-0",
                                                        !faltaFechar
                                                            ? "bg-white/5 border-white/15 text-muted-foreground"
                                                            : "bg-amber-500/15 border-amber-500/40 text-amber-300",
                                                    )}
                                                    title={!faltaFechar ? "Os valores batem" : "Os valores divergem"}>
                                                    {!faltaFechar ? (
                                                        <Link2 className="w-3.5 h-3.5"/>
                                                    ) : (
                                                        <span className="text-xs font-black">≠</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* ── COLUNA DIREITA: lançamento(s) ── */}
                                        <div className="p-3 min-w-0 space-y-1.5">
                                            {/* Lista dos lançamentos já vinculados (se houver) — antes isso
                                                era "ou" com o botão Vincular; agora os dois podem coexistir
                                                enquanto sobrar saldo a fechar na linha. */}
                                            {isVinculado && linha.vinculacoes.length > 0 && (
                                                <ul className="space-y-1.5">
                                                    {linha.vinculacoes.map((v) => (
                                                        <CardLancamento
                                                            key={v.vinculo_id ?? v.lancamento_id}
                                                            v={v}
                                                            extratoId={extratoId}
                                                            linhaId={linha.linha_id}
                                                            canEditarLancamento={canEditarLancamento}
                                                            canDesfazer={canDesfazer}
                                                            onEditarLancamento={() => setEditarLancamentoId(v.lancamento_id)}
                                                            onRemoverVinculo={() => setDesfazerLinhaId(linha.linha_id)}
                                                        />
                                                    ))}
                                                </ul>
                                            )}

                                            {/* [🔍 Vincular]: visível enquanto sobrar saldo a fechar (linha
                                                pendente OU vinculada parcialmente); some no valor exato.
                                                IMPORTANTE: passa o SALDO restante da linha (linha.valor_saldo),
                                                não o valor cheio da linha — senão o modal calcula o "restante"
                                                contra o valor total, ignorando o que já foi vinculado antes. */}
                                            {podeVincularMais && canVincular && (
                                                <button
                                                    type="button"
                                                    onClick={() => setVincularLinha({
                                                        id: linha.linha_id,
                                                        valorAbs: saldoAbs,
                                                    })}
                                                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                                                    <Search className="w-3.5 h-3.5"/>
                                                    Vincular
                                                </button>
                                            )}

                                            {isIgnorado && (
                                                <p className="text-[11px] text-muted-foreground italic py-2">
                                                    Linha ignorada — sem lançamento vinculado.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        )}

                        {/* RN-D5: navegação ‹ › entre as linhas, sem sair da tela */}
                        {linhasFiltradas.length > LINHAS_POR_PAGINA && (
                            <div
                                className="flex items-center justify-center gap-4 py-3 border-t border-white/5 bg-black/20">
                                <button
                                    type="button"
                                    disabled={paginaAtual === 0}
                                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                                    className="p-1.5 rounded-lg border border-white/10 text-white disabled:opacity-30 hover:bg-white/5">
                                    <ChevronLeft className="w-4 h-4"/>
                                </button>
                                <span className="text-xs text-muted-foreground">
                                    {paginaAtual + 1} / {totalPaginas}
                                </span>
                                <button
                                    type="button"
                                    disabled={paginaAtual >= totalPaginas - 1}
                                    onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                                    className="p-1.5 rounded-lg border border-white/10 text-white disabled:opacity-30 hover:bg-white/5">
                                    <ChevronRight className="w-4 h-4"/>
                                </button>
                            </div>
                        )}

                        {/*
                          Rodapé de ação: o botão Salvar/Concluir saiu do cabeçalho e
                          agora fica aqui embaixo, alinhado à direita, após a lista de
                          linhas / paginação.
                        */}
                        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-white/5 bg-black/25">
                            <RequiresPermission permission={PERM.CONCILIACAO_CONCLUIR}>
                                <button
                                    type="button"
                                    disabled={!podeFinalizar || finalizarMutation.isPending || extrato.status === "conciliado"}
                                    onClick={() => {
                                        if (!podeFinalizar) return;
                                        setFinalizarOpen(true);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-white text-xs font-bold disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-success/20">
                                    {finalizarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> :
                                        <CheckCircle2 className="w-4 h-4"/>}
                                    {rotuloAcaoConciliacao}
                                </button>
                            </RequiresPermission>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}