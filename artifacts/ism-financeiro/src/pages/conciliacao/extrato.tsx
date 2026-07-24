import {useState} from "react";
import {useLocation} from "wouter";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {formatCurrency, formatDate, cn} from "@/lib/utils";
import {VincularModal} from "@/components/conciliacao/vincular-modal";
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    FileText,
    Link2,
    Ban,
    CheckCircle2,
    Flag,
    Scale,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
} from "lucide-react";
import {invalidateRelated} from "@/App";

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
};

type VinculacaoDetalhe = {
    lancamento_id: number;
    descricao: string | null;
    tipo: string;
    status: string;
    valor_vinculado: string | number;
    desconto: string | number;
    acrescimo?: string | number;
    juros_multa?: string | number;
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
                    ? "text-orange-300"
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

export default function ConciliacaoExtratoDetalhe({extratoId}: { extratoId: string }) {
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const {toast} = useToast();

    const [vincularLinha, setVincularLinha] = useState<{ id: number; valorAbs: string | number } | null>(null);

    const {data, isLoading, isError, refetch} = useQuery({
        queryKey: ["conciliacao-extrato", extratoId],
        queryFn: () => fetchApiData<ExtratoDetalheResponse>(`/conciliacoes/${extratoId}`),
        enabled: !!extratoId,
    });

    const ignorarMutation = useMutation({
        mutationFn: (linhaId: number) =>
            fetchApiData<{ linha_id: number; status: string }>(`/conciliacoes/linhas/${linhaId}/ignorar`, {
                method: "POST",
                body: JSON.stringify({}),
            }),
        onSuccess: () => {
            invalidateRelated(queryClient, "conciliacao");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
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
    const linhas = data?.linhas ?? [];
    const diagnostico = data?.diagnostico ?? null;
    const podeFinalizar = (conc?.resumo_pendentes ?? 1) === 0;

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

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto lg:min-w-[420px]">
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
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
                            <div className="text-xs text-muted-foreground flex items-center gap-4">
                <span>
                  Créditos: <strong className="text-teal-400">{formatCurrency(Number(extrato.total_creditos))}</strong>
                </span>
                                <span>
                  Débitos: <strong className="text-orange-300">{formatCurrency(Number(extrato.total_debitos))}</strong>
                </span>
                                <span>
                  Linhas no arquivo: <strong className="text-white">{extrato.total_linhas}</strong>
                </span>
                            </div>
                            <div className="flex-1"/>
                            <button
                                type="button"
                                disabled={!podeFinalizar || finalizarMutation.isPending || extrato.status === "conciliado"}
                                onClick={() => {
                                    if (!podeFinalizar) return;
                                    if (confirm("Finalizar conciliação deste extrato? Não poderá haver linhas pendentes.")) {
                                        finalizarMutation.mutate();
                                    }
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-white text-xs font-bold disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-success/20">
                                {finalizarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> :
                                    <CheckCircle2 className="w-4 h-4"/>}
                                Finalizar conciliação
                            </button>
                        </div>
                    </div>

                    <PainelDiagnostico diagnostico={diagnostico}/>

                    <div
                        className="glass-panel rounded-2xl border border-white/10 overflow-hidden flex flex-col flex-1 min-h-0">
                        <div className="px-4 py-3 border-b border-white/5 bg-black/20">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Movimentações do
                                extrato</h2>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Linhas importadas e vínculos com o
                                financeiro</p>
                        </div>

                        <div className="divide-y divide-white/5 overflow-y-auto max-h-[calc(100vh-22rem)]">
                            {linhas.map((linha) => {
                                const valorAbs = Math.abs(Number(linha.valor));
                                const isPendente = linha.status === "pendente";
                                const isVinculado = linha.status === "vinculado";
                                const isIgnorado = linha.status === "ignorado";

                                return (
                                    <div key={linha.linha_id} className="p-4 hover:bg-white/[0.02] transition-colors">
                                        <div className="flex flex-col xl:flex-row xl:items-stretch gap-4">
                                            <div className="flex-1 min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                          <span
                              className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded border uppercase",
                                  linha.tipo_movimento === "credito"
                                      ? "bg-teal-500/15 text-teal-300 border-teal-500/25"
                                      : "bg-orange-500/15 text-orange-300 border-orange-500/25",
                              )}>
                            {linha.tipo_movimento}
                          </span>
                                                    <span
                                                        className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", statusLinhaBadge(linha.status))}>
                            {linha.status}
                          </span>
                                                    {linha.data_movimento && (
                                                        <span
                                                            className="text-[10px] text-muted-foreground">{formatDate(linha.data_movimento)}</span>
                                                    )}
                                                    {linha.documento && (
                                                        <span
                                                            className="text-[10px] text-muted-foreground font-mono">Doc. {linha.documento}</span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-white font-medium leading-snug">{linha.descricao ?? "—"}</p>
                                                <p className="text-base font-black text-primary">{formatCurrency(Number(linha.valor))}</p>
                                                {!isPendente && (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Vinculado: {formatCurrency(Number(linha.valor_vinculado_total))} ·
                                                        Saldo linha:{" "}
                                                        {formatCurrency(Number(linha.valor_saldo))}
                                                    </p>
                                                )}
                                                {linha.saldo_pos_linha != null && (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Saldo pós-linha: {formatCurrency(Number(linha.saldo_pos_linha))}
                                                    </p>
                                                )}
                                            </div>

                                            <div
                                                className="flex flex-col sm:flex-row xl:flex-col gap-2 shrink-0 xl:w-56">
                                                {isPendente && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => setVincularLinha({
                                                                id: linha.linha_id,
                                                                valorAbs
                                                            })}
                                                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                                                            <Link2 className="w-3.5 h-3.5"/>
                                                            Vincular
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={ignorarMutation.isPending}
                                                            onClick={() => {
                                                                if (confirm("Ignorar esta linha? Ela não será conciliada.")) {
                                                                    ignorarMutation.mutate(linha.linha_id);
                                                                }
                                                            }}
                                                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/90">
                                                            <Ban className="w-3.5 h-3.5"/>
                                                            Ignorar
                                                        </button>
                                                    </>
                                                )}
                                                {isIgnorado && (
                                                    <button
                                                        type="button"
                                                        disabled={reverterIgnorarMutation.isPending}
                                                        onClick={() => {
                                                            if (confirm("Reverter ignorar? A linha voltará a pendente.")) {
                                                                reverterIgnorarMutation.mutate(linha.linha_id);
                                                            }
                                                        }}
                                                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-200">
                                                        ↺ Reverter
                                                    </button>
                                                )}
                                                {isVinculado && (
                                                    <button
                                                        type="button"
                                                        disabled={desfazerVinculosMutation.isPending}
                                                        onClick={() => {
                                                            if (confirm("Desfazer vínculos desta linha? Lançamentos voltarão ao status anterior.")) {
                                                                desfazerVinculosMutation.mutate(linha.linha_id);
                                                            }
                                                        }}
                                                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-200">
                                                        🗑 Desfazer vínculos
                                                    </button>
                                                )}
                                            </div>

                                            {isVinculado && linha.vinculacoes.length > 0 && (
                                                <div
                                                    className="xl:flex-1 xl:min-w-[280px] rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                                                    <p className="text-[10px] font-black text-emerald-400/90 uppercase tracking-wider flex items-center gap-1">
                                                        <Flag className="w-3 h-3"/>
                                                        Lançamentos vinculados
                                                    </p>
                                                    <ul className="space-y-2">
                                                        {linha.vinculacoes.map((v) => (
                                                            <li
                                                                key={v.lancamento_id}
                                                                className="text-[11px] rounded-lg bg-black/30 border border-white/10 px-2 py-2">
                                                                <div
                                                                    className="flex items-center justify-between gap-2">
                                  <span className="text-white/90 font-medium truncate" title={v.descricao ?? ""}>
                                    #{v.lancamento_id} · {v.descricao ?? "—"}
                                  </span>
                                                                    <span
                                                                        className={cn(
                                                                            "text-[9px] font-bold px-1 rounded shrink-0",
                                                                            v.tipo === "CR" ? "text-teal-300" : "text-orange-300",
                                                                        )}>
                                    {v.tipo}
                                  </span>
                                                                </div>
                                                                <div
                                                                    className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-muted-foreground">
                                                                    <span>Vinc.: {formatCurrency(Number(v.valor_vinculado))}</span>
                                                                    {(Number(v.desconto) > 0 || Number(v.juros_multa ?? v.acrescimo) > 0) && (
                                                                        <span>
                                      Desc./Juros/Multa: {formatCurrency(Number(v.desconto))} /{" "}
                                                                            {formatCurrency(Number(v.juros_multa ?? v.acrescimo))}
                                    </span>
                                                                    )}
                                                                    <span
                                                                        className="uppercase text-[9px]">{v.status}</span>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}