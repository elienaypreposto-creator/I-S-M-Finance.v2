import {useMemo, useState} from "react";
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
    Scale,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
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
    Repeat,
    Sparkles,
} from "lucide-react";
import {invalidateRelated} from "@/App";
import {formatValorBrInput, brMoneyDisplayToApiString} from "@/validations/lancamentos.schema";

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
    /** Flag do título residual (DEF-08) - não inferir por status pendente. */
    is_residuo_parcial?: boolean;
    valor_vinculado: string | number;
    desconto: string | number;
    acrescimo?: string | number;
    juros_multa?: string | number;
    /** Vencimento do residual = origem (imutável - Decisão nº 3). */
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
 * RN-D2: cor semântica por natureza - crédito/entrada = VERDE, débito/saída
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

function corNaturezaRegua(isCredito: boolean) {
    return isCredito ? "border-l-emerald-500/70" : "border-l-red-500/70";
}

/** Painel de conciliação: saldo do sistema × saldo do extrato × diferença (Card 42). */
function PainelDiagnostico({diagnostico}: { diagnostico: DiagnosticoSaldo }) {
    if (!diagnostico) return null;

    const {
        data_referencia,
        saldo_sistema,
        saldo_banco,
        diferenca,
        bate,
        diagnostico: mensagem,
        linhas_ignoradas_valor,
        linhas_ignoradas_explicam,
        saldo_inicial,
    } = diagnostico;

    const diferencaColor =
        bate === true
            ? "text-emerald-300"
            : bate === false
                ? diferenca !== null && diferenca > 0
                    ? "text-amber-300"
                    : "text-sky-300"
                : "text-muted-foreground";

    return (
        <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary"/>
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Diagnóstico de saldo</h2>
                <span className="text-[10px] text-muted-foreground">· comparado em {formatDate(data_referencia)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-black/30 border border-white/10 p-4">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saldo do
                        sistema</p>
                    <p className="text-xl font-black text-white mt-1">{formatCurrency(saldo_sistema)}</p>
                </div>
                <div className="rounded-xl bg-black/30 border border-white/10 p-4">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saldo do
                        extrato (banco)</p>
                    <p className="text-xl font-black text-white mt-1">
                        {saldo_banco !== null ? formatCurrency(saldo_banco) : "—"}
                    </p>
                </div>
                <div
                    className={cn(
                        "rounded-xl border p-4",
                        bate === true
                            ? "bg-emerald-500/10 border-emerald-500/25"
                            : bate === false
                                ? "bg-amber-500/10 border-amber-500/25"
                                : "bg-black/30 border-white/10",
                    )}>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        {bate === false && diferenca !== null && diferenca > 0 && <TrendingUp className="w-3 h-3"/>}
                        {bate === false && diferenca !== null && diferenca < 0 && <TrendingDown className="w-3 h-3"/>}
                        Diferença
                    </p>
                    <p className={cn("text-xl font-black mt-1", diferencaColor)}>
                        {diferenca !== null ? formatCurrency(diferenca) : "—"}
                    </p>
                </div>
            </div>

            <p className={cn("text-xs", bate === true ? "text-emerald-300" : "text-white/80")}>{mensagem}</p>

            {linhas_ignoradas_explicam && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5"/>
                    <p className="text-xs text-amber-200">
                        Linhas ignoradas somam <strong>{formatCurrency(linhas_ignoradas_valor)}</strong>, na mesma
                        direção da diferença encontrada. Isso pode indicar que uma ou mais dessas linhas foram
                        ignoradas indevidamente — revise antes de finalizar.
                    </p>
                </div>
            )}

            {saldo_inicial && (
                <div
                    className={cn(
                        "rounded-xl border p-3 flex items-start gap-2",
                        saldo_inicial.bate
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : "border-red-500/25 bg-red-500/10",
                    )}>
                    {saldo_inicial.bate ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5"/>
                    ) : (
                        <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 mt-0.5"/>
                    )}
                    <p className={cn("text-xs", saldo_inicial.bate ? "text-emerald-200" : "text-red-200")}>
                        Fechamento de período: o saldo de abertura ({formatDate(saldo_inicial.data_referencia)})
                        {saldo_inicial.bate ? " bate " : " NÃO bate "}
                        com o fechamento do extrato anterior (#{saldo_inicial.extrato_anterior_id}). Sistema:{" "}
                        {formatCurrency(saldo_inicial.saldo_sistema)} · Extrato
                        anterior: {formatCurrency(saldo_inicial.saldo_extrato_anterior)}
                        {!saldo_inicial.bate && ` · Diferença: ${formatCurrency(saldo_inicial.diferenca)}`}
                    </p>
                </div>
            )}
        </div>
    );
}

/**
 * RN-D3 - `[+]` verde: cria um lançamento que não existia, pré-preenchido com
 * data/valor/natureza/descrição da linha (ex.: antecipação de lucro do sócio).
 * Ao salvar, a linha já nasce vinculada e quitada - sem passo extra de vincular.
 * Payload alinhado ao schema real do backend (tipo/vencimento/valor obrigatórios).
 */
function NovoLancamentoModal({
                                 linha,
                                 extratoId,
                                 onClose,
                                 onCriado,
                             }: {
    linha: LinhaDetalhe;
    extratoId: string;
    onClose: () => void;
    onCriado: (lancamentoId: number) => void;
}) {
    const {toast} = useToast();
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const [descricao, setDescricao] = useState(linha.descricao ?? "");
    const isCredito = linha.tipo_movimento === "credito";

    const criarMutation = useMutation({
        mutationFn: () =>
            fetchApiData<{ lancamento: { id: number } }>(`/conciliacoes/linhas/${linha.linha_id}/criar-lancamento`, {
                method: "POST",
                body: JSON.stringify({
                    tipo: isCredito ? "CR" : "CP",
                    vencimento: linha.data_movimento,
                    valor: Math.abs(Number(linha.valor)),
                    descricao: descricao.trim() || linha.descricao || null,
                }),
            }),
        onSuccess: (resp) => {
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            toast({title: "Lançamento criado", description: "A linha já foi conciliada, sem passos extras."});
            onCriado(resp.lancamento.id);
        },
        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Erro ao criar lançamento",
                description: e instanceof Error ? e.message : String(e),
            }),
    });

    function irParaCadastroDeRegra() {
        try {
            sessionStorage.setItem("regra_conciliacao_texto_sugerido", descricao || linha.descricao || "");
        } catch {
            /* sessionStorage indisponível - segue sem pré-preenchimento */
        }
        onClose();
        setLocation("/cadastros/regras-conciliacao");
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Plus className="w-4 h-4 text-emerald-400"/>
                        Novo lançamento a partir da linha
                    </h2>
                    <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
                        <X className="w-4 h-4"/>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="rounded-xl bg-black/30 border border-white/10 p-3 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Dados da linha (não
                            editáveis)</p>
                        <div className="flex items-center justify-between text-sm">
                            <span
                                className="text-white/80">{linha.data_movimento ? formatDate(linha.data_movimento) : "—"}</span>
                            <span className={cn("font-black", corNaturezaTexto(isCredito))}>
                                {formatCurrency(Math.abs(Number(linha.valor)))}
                            </span>
                        </div>
                        <span
                            className={cn("inline-block text-[10px] font-black px-2 py-0.5 rounded border uppercase", corNaturezaBadge(isCredito))}>
                            {linha.tipo_movimento} → {isCredito ? "CR" : "CP"}
                        </span>
                    </div>

                    <div>
                        <label
                            className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                            Descrição do lançamento
                        </label>
                        <input
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Ex: Antecipação de lucro do sócio"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50"
                        />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={criarMutation.isPending}
                            onClick={() => criarMutation.mutate()}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                            {criarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> :
                                <Plus className="w-4 h-4"/>}
                            Criar e conciliar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Card de lançamento (coluna direita): Desconto / Juros-Multa editáveis (RN-G7).
 * Residual parcial: vencimento = origem, **não editável** (Decisão nº 3).
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
        <li className="rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 space-y-1.5">
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
                        onClick={() =>
                            toast({title: "Em breve", description: "Duplicar lançamento ainda não está disponível."})
                        }
                        className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white">
                        <Copy className="w-3.5 h-3.5"/>
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

            {!isResidual && (
                <p className="hidden">{/* descrição já exibida no header acima para não-residuais */}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
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
    // RN-D3 - [+] verde: criar lançamento a partir da linha.
    const [novoLancamentoLinha, setNovoLancamentoLinha] = useState<LinhaDetalhe | null>(null);
    // RN-D5 - navegação ‹ › entre as linhas, sem sair da tela.
    const [pagina, setPagina] = useState(0);

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

    const extrato = data?.extrato;
    const conc = data?.conciliacao;
    const linhas = useMemo(() => {
        const list = data?.linhas ?? [];
        return [...list].sort((a, b) => a.linha_id - b.linha_id);
    }, [data?.linhas]);
    const diagnostico = data?.diagnostico ?? null;
    const podeFinalizar = (conc?.resumo_pendentes ?? 1) === 0;
    /** FEAT-05 / Card 57: rótulo dinâmico Salvar / Concluir (nunca "Finalizar/Conciliar"). */
    const rotuloAcaoConciliacao = podeFinalizar ? "Concluir" : "Salvar";

    // RN-D5: navegação ‹ › entre as linhas, sem sair da tela.
    const totalPaginas = Math.max(1, Math.ceil(linhas.length / LINHAS_POR_PAGINA));
    const paginaAtual = Math.min(pagina, totalPaginas - 1);
    const linhasDaPagina = useMemo(
        () => linhas.slice(paginaAtual * LINHAS_POR_PAGINA, paginaAtual * LINHAS_POR_PAGINA + LINHAS_POR_PAGINA),
        [linhas, paginaAtual],
    );

    return (
        <div className="flex flex-col gap-4 h-full min-h-0 max-w-6xl mx-auto py-2">
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

            {novoLancamentoLinha && (
                <NovoLancamentoModal
                    linha={novoLancamentoLinha}
                    extratoId={extratoId}
                    onClose={() => setNovoLancamentoLinha(null)}
                    onCriado={() => setNovoLancamentoLinha(null)}
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
                    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-6">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                            <div className="space-y-2 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary shrink-0"/>
                                    <h1 className="text-xl font-bold text-white truncate">{extrato.arquivo_nome ?? `Extrato #${extrato.id}`}</h1>
                                    <span
                                        className={cn(
                                            "text-[10px] font-black uppercase px-2 py-0.5 rounded-md border shrink-0",
                                            statusExtratoBadge(extrato.status),
                                        )}>
                    {extrato.status}
                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Conta: <span
                                    className="text-white/90 font-medium">{extrato.conta_nome ?? "—"}</span>
                                    {extrato.periodo_inicio && extrato.periodo_fim && (
                                        <>
                                            {" "}
                                            ·
                                            Período {formatDate(extrato.periodo_inicio)} — {formatDate(extrato.periodo_fim)}
                                        </>
                                    )}
                                </p>
                                <p className="text-xs text-muted-foreground">Importado
                                    em {formatDate(extrato.created_at)}</p>
                            </div>

                            <div
                                className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 w-full lg:w-auto lg:min-w-[420px]">
                                <div className="rounded-xl bg-black/30 border border-white/10 p-3 text-center">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total</p>
                                    <p className="text-lg font-black text-white mt-1">{conc.resumo_total}</p>
                                </div>
                                <div
                                    className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                                    <p className="text-[10px] font-bold text-emerald-400/90 uppercase tracking-wider">Vinculados</p>
                                    <p className="text-lg font-black text-emerald-300 mt-1">{conc.resumo_conciliados}</p>
                                </div>
                                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-center">
                                    <p className="text-[10px] font-bold text-amber-300/90 uppercase tracking-wider">Pendentes</p>
                                    <p className="text-lg font-black text-amber-200 mt-1">{conc.resumo_pendentes}</p>
                                </div>
                                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ignorados</p>
                                    <p className="text-lg font-black text-white/80 mt-1">{conc.resumo_ignorados}</p>
                                </div>
                                {(conc.resumo_classificadas_automaticamente ?? 0) > 0 && (
                                    <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-center">
                                        <p className="text-[10px] font-bold text-sky-300/90 uppercase tracking-wider">Auto</p>
                                        <p className="text-lg font-black text-sky-200 mt-1">
                                            {conc.resumo_classificadas_automaticamente}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
                            <div className="text-xs text-muted-foreground flex items-center gap-4">
                <span>
                  Créditos: <strong
                    className="text-emerald-400">{formatCurrency(Number(extrato.total_creditos))}</strong>
                </span>
                                <span>
                  Débitos: <strong className="text-red-300">{formatCurrency(Number(extrato.total_debitos))}</strong>
                </span>
                                <span>
                  Linhas no arquivo: <strong className="text-white">{extrato.total_linhas}</strong>
                </span>
                            </div>
                            <div className="flex-1"/>
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

                    <PainelDiagnostico diagnostico={diagnostico}/>

                    <div
                        className="glass-panel rounded-2xl border border-white/10 overflow-hidden flex flex-col flex-1 min-h-0">
                        <div className="px-4 py-3 border-b border-white/5 bg-black/20 shrink-0">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Movimentações do
                                extrato</h2>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Linhas importadas e vínculos com o
                                financeiro</p>
                        </div>

                        {/*
                          RN-D1: duas colunas - esquerda a linha do extrato, direita o(s)
                          lançamento(s) - com o conector central de estado (RN-D4).
                          Card 64: flex-1 + min-h-0 + overflow-y-auto para scroll vertical real.
                        */}
                        <div className="divide-y divide-white/5 overflow-y-auto flex-1 min-h-0">
                            {linhasDaPagina.map((linha) => {
                                const isPendente = linha.status === "pendente";
                                const isVinculado = linha.status === "vinculado";
                                const isIgnorado = linha.status === "ignorado";
                                const isCredito = linha.tipo_movimento === "credito";
                                const valorAbs = Math.abs(Number(linha.valor));
                                const saldoAbertoCents = Math.round(Number(linha.valor_saldo ?? 0) * 100);
                                const coberturaCompleta = !isVinculado || saldoAbertoCents <= 0;

                                return (
                                    <div
                                        key={linha.linha_id}
                                        className={cn(
                                            "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] divide-y xl:divide-y-0 xl:divide-x divide-white/5",
                                            isIgnorado && "opacity-45 grayscale-[0.35] bg-white/[0.015]",
                                        )}
                                    >
                                        {/* ── COLUNA ESQUERDA: linha do extrato (RN-D2 régua vermelho/verde) ── */}
                                        <div
                                            className={cn(
                                                "border-l-4 p-4 space-y-2 min-w-0",
                                                corNaturezaRegua(isCredito),
                                            )}>
                                            {/* Cabeçalho: badge + data à esquerda, [+] e [⊘ Ignorar]/[↺ Reverter]
                                                juntos à direita, na mesma linha (layout do protótipo). */}
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-2 min-w-0">
                          <span
                              className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded border uppercase shrink-0",
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
                                                    {/* RN-D3: [+] verde - cria lançamento pré-preenchido a partir da linha */}
                                                    {isPendente && canVincular && (
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

                                            <p className="text-sm text-white font-medium leading-snug">{linha.descricao ?? "—"}</p>

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

                                            <span
                                                className={cn("inline-block text-base font-black border-b-2 pb-0.5", corNaturezaTexto(isCredito), corNaturezaRegua(isCredito))}>
                          {formatCurrency(valorAbs)}
                        </span>

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
                                        <div className="flex items-center justify-center py-2 xl:py-4">
                                            {!isIgnorado && (
                                                <div
                                                    className={cn(
                                                        "w-8 h-8 rounded-full flex items-center justify-center border shrink-0",
                                                        coberturaCompleta && isVinculado
                                                            ? "bg-white/5 border-white/15 text-muted-foreground"
                                                            : "bg-amber-500/15 border-amber-500/40 text-amber-300",
                                                    )}
                                                    title={
                                                        coberturaCompleta && isVinculado
                                                            ? "Os valores batem"
                                                            : "Ainda falta cobrir o valor do extrato"
                                                    }>
                                                    {coberturaCompleta && isVinculado ? (
                                                        <Link2 className="w-4 h-4"/>
                                                    ) : (
                                                        <span className="text-sm font-black">≠</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* ── COLUNA DIREITA: lançamento(s) ── */}
                                        <div className="p-4 min-w-0 space-y-2">
                                            {/* [🔍 Vincular]: 1º vínculo enquanto pendente */}
                                            {isPendente && canVincular && (
                                                <button
                                                    type="button"
                                                    onClick={() => setVincularLinha({id: linha.linha_id, valorAbs})}
                                                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                                                    <Search className="w-3.5 h-3.5"/>
                                                    Vincular
                                                </button>
                                            )}

                                            {isVinculado &&
                                                ((canVincular && saldoAbertoCents > 0) || canDesfazer) && (
                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        {canVincular && saldoAbertoCents > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setVincularLinha({
                                                                        id: linha.linha_id,
                                                                        valorAbs: Number(linha.valor_saldo),
                                                                    })
                                                                }
                                                                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-primary/40 bg-primary/15 hover:bg-primary/25 text-primary text-xs font-bold">
                                                                <Link2 className="w-3.5 h-3.5"/>
                                                                Vincular outro lançamento
                                                                <span className="font-normal text-muted-foreground">
                                                                    (falta{" "}
                                                                    {formatCurrency(Number(linha.valor_saldo))})
                                                                </span>
                                                            </button>
                                                        )}
                                                        {canDesfazer && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setDesfazerLinhaId(linha.linha_id)}
                                                                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold">
                                                                <Trash2 className="w-3.5 h-3.5"/>
                                                                Desfazer
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                            {isVinculado && linha.vinculacoes.length > 0 && (
                                                <ul className="space-y-2">
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

                        {/* RN-D5: navegação < > entre as linhas, sem sair da tela */}
                        {linhas.length > LINHAS_POR_PAGINA && (
                            <div
                                className="flex items-center justify-center gap-4 py-3 border-t border-white/5 bg-black/20 shrink-0">
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
                    </div>
                </>
            )}
        </div>
    );
}