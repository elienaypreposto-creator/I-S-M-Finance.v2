import {useMemo, useState} from "react";
import {PageHeader} from "@/components/shared/page-header";
import {
    Download,
    FileText,
    Filter,
    Loader2,
    AlertCircle,
    Scale,
    Landmark,
} from "lucide-react";
import {formatCurrency, formatDate, cn} from "@/lib/utils";
import {useQuery} from "@tanstack/react-query";
import {fetchApiData} from "@/lib/api-config";
import {exportToExcel, exportToPDF, fmtBRL, fmtDate} from "@/lib/export";

const MESES_LONGOS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 8}, (_, i) => CURRENT_YEAR + 2 - i);

type ContaOption = { id: number; nome: string };

type RelatorioConciliacao = {
    conta: { id: number; nome: string; banco: string | null };
    periodo: { inicio: string; fim: string };
    saldo_inicial_sistema: number;
    saldo_final_sistema: number;
    movimentacoes: {
        creditos_quitados: number;
        debitos_quitados: number;
        juros: number;
        liquido: number;
    };
    confronto: {
        saldo_sistema: number;
        saldo_banco: number | null;
        diferenca: number | null;
        bate: boolean | null;
    };
    extratos: Array<{
        extrato_id: number;
        arquivo_nome: string | null;
        periodo_inicio: string | null;
        periodo_fim: string | null;
        data_conciliacao: string | null;
        status: string;
        resumo_conciliados: number;
        resumo_ignorados: number;
        resumo_pendentes: number;
        resumo_total: number;
        saldo_sistema: number;
        saldo_banco: number | null;
        diferenca: number | null;
        bate: boolean | null;
    }>;
    totais: {
        extratos: number;
        linhas_total: number;
        vinculadas: number;
        ignoradas: number;
        pendentes: number;
    };
};

function lastDayOfMonth(ano: number, mes: number): string {
    const last = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return `${ano}-${String(mes).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export default function RelatorioConciliacao() {
    const [mesFiltro, setMesFiltro] = useState(new Date().getMonth() + 1);
    const [anoFiltro, setAnoFiltro] = useState(CURRENT_YEAR);
    const [contaId, setContaId] = useState<string>("");

    const dataInicio = `${anoFiltro}-${String(mesFiltro).padStart(2, "0")}-01`;
    const dataFim = lastDayOfMonth(anoFiltro, mesFiltro);

    const {data: contas = []} = useQuery({
        queryKey: ["contas-bancarias-relatorio-conciliacao"],
        queryFn: () => fetchApiData<ContaOption[]>("/contas-bancarias"),
    });

    const enabled = Boolean(contaId);
    const params = new URLSearchParams({
        conta_id: contaId,
        data_inicio: dataInicio,
        data_fim: dataFim,
    });

    const {data, isLoading, isError, refetch} = useQuery({
        queryKey: ["relatorio-conciliacao", contaId, dataInicio, dataFim],
        queryFn: () => fetchApiData<RelatorioConciliacao>(`/relatorios/conciliacao?${params}`),
        enabled,
    });

    const exportRows = useMemo(() => {
        if (!data) return [];
        return data.extratos.map((e) => ({
            arquivo: e.arquivo_nome ?? `#${e.extrato_id}`,
            periodo:
                e.periodo_inicio && e.periodo_fim
                    ? `${fmtDate(e.periodo_inicio)} — ${fmtDate(e.periodo_fim)}`
                    : "—",
            conciliado_em: e.data_conciliacao ? fmtDate(e.data_conciliacao) : "—",
            status: e.status,
            vinculadas: e.resumo_conciliados,
            pendentes: e.resumo_pendentes,
            ignoradas: e.resumo_ignorados,
            saldo_sistema: e.saldo_sistema,
            saldo_banco: e.saldo_banco ?? 0,
            diferenca: e.diferenca ?? 0,
        }));
    }, [data]);

    const EXPORT_COLUMNS = [
        {header: "Arquivo", key: "arquivo", width: 28},
        {header: "Período", key: "periodo", width: 24},
        {header: "Conciliado em", key: "conciliado_em", width: 14},
        {header: "Status", key: "status", width: 12},
        {header: "Vinculadas", key: "vinculadas", width: 12},
        {header: "Pendentes", key: "pendentes", width: 12},
        {header: "Ignoradas", key: "ignoradas", width: 12},
        {header: "Saldo sistema", key: "saldo_sistema", width: 16, formatter: (v: unknown) => fmtBRL(v ?? 0)},
        {header: "Saldo banco", key: "saldo_banco", width: 16, formatter: (v: unknown) => fmtBRL(v ?? 0)},
        {header: "Diferença", key: "diferenca", width: 14, formatter: (v: unknown) => fmtBRL(v ?? 0)},
    ];

    const tituloPeriodo = `${MESES_LONGOS[mesFiltro - 1]} / ${anoFiltro}`;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Relatório de Conciliação"
                description="Saldo inicial, movimentações quitadas, extratos e confronto sistema × banco"
                actions={
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={!data || isLoading}
                            onClick={() =>
                                exportToPDF(`Conciliacao_${contaId}_${dataInicio}_${dataFim}`, exportRows, EXPORT_COLUMNS, {
                                    title: `Conciliação — ${data?.conta.nome ?? ""}`,
                                    subtitle: `${tituloPeriodo} · Sistema: ${fmtBRL(data?.saldo_final_sistema ?? 0)} · Banco: ${fmtBRL(data?.confronto.saldo_banco ?? 0)}`,
                                    orientation: "landscape",
                                })
                            }
                            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-sm font-medium disabled:opacity-40"
                        >
                            <FileText className="w-4 h-4"/> PDF
                        </button>
                        <button
                            type="button"
                            disabled={!data || isLoading}
                            onClick={() =>
                                exportToExcel(`Conciliacao_${contaId}_${dataInicio}_${dataFim}`, exportRows, EXPORT_COLUMNS)
                            }
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium disabled:opacity-40"
                        >
                            <Download className="w-4 h-4"/> XLSX
                        </button>
                    </div>
                }
            />

            <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-wrap gap-3 items-end">
                <Filter className="w-4 h-4 text-muted-foreground mb-2"/>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Conta
                    <select
                        value={contaId}
                        onChange={(e) => setContaId(e.target.value)}
                        className="mt-1 block min-w-[200px] bg-black/40 border border-white/15 rounded-lg px-2 py-2 text-xs text-white"
                    >
                        <option value="">Selecione…</option>
                        {contas.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                                {c.nome}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Mês
                    <select
                        value={mesFiltro}
                        onChange={(e) => setMesFiltro(Number(e.target.value))}
                        className="mt-1 block bg-black/40 border border-white/15 rounded-lg px-2 py-2 text-xs text-white"
                    >
                        {MESES_LONGOS.map((m, i) => (
                            <option key={m} value={i + 1}>
                                {m}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Ano
                    <select
                        value={anoFiltro}
                        onChange={(e) => setAnoFiltro(Number(e.target.value))}
                        className="mt-1 block bg-black/40 border border-white/15 rounded-lg px-2 py-2 text-xs text-white"
                    >
                        {YEARS.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {!enabled && (
                <div
                    className="glass-panel rounded-2xl p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                    <Landmark className="w-8 h-8 text-primary/60"/>
                    Selecione uma conta bancária para gerar o relatório.
                </div>
            )}

            {enabled && isLoading && (
                <div className="flex items-center justify-center h-40 gap-3 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin"/>
                    <span className="text-sm">Gerando relatório…</span>
                </div>
            )}

            {enabled && isError && (
                <div className="glass-panel rounded-2xl p-6 border border-destructive/30 text-center">
                    <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2"/>
                    <p className="text-sm text-white">Não foi possível gerar o relatório.</p>
                    <button type="button" onClick={() => void refetch()}
                            className="mt-3 text-xs text-primary underline">
                        Tentar novamente
                    </button>
                </div>
            )}

            {enabled && data && !isLoading && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="glass-panel rounded-2xl p-4 border border-white/10">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Saldo inicial</p>
                            <p className="text-lg font-black text-white mt-1">
                                {formatCurrency(data.saldo_inicial_sistema)}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">Sistema (abertura do período)</p>
                        </div>
                        <div className="glass-panel rounded-2xl p-4 border border-white/10">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Movimentações</p>
                            <p className="text-sm text-emerald-300 mt-1">
                                + {formatCurrency(data.movimentacoes.creditos_quitados)}
                            </p>
                            <p className="text-sm text-red-300">
                                − {formatCurrency(data.movimentacoes.debitos_quitados)}
                            </p>
                            <p className="text-[10px] text-amber-300/80 mt-1">
                                Juros (fora): {formatCurrency(data.movimentacoes.juros)}
                            </p>
                        </div>
                        <div className="glass-panel rounded-2xl p-4 border border-white/10">
                            <p className="text-[10px] uppercase text-muted-foreground font-bold">Saldo final sistema</p>
                            <p className="text-lg font-black text-white mt-1">
                                {formatCurrency(data.saldo_final_sistema)}
                            </p>
                        </div>
                        <div
                            className={cn(
                                "glass-panel rounded-2xl p-4 border",
                                data.confronto.bate
                                    ? "border-emerald-500/30 bg-emerald-500/5"
                                    : "border-amber-500/30 bg-amber-500/5",
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Scale className="w-4 h-4 text-primary"/>
                                <p className="text-[10px] uppercase text-muted-foreground font-bold">Confronto</p>
                            </div>
                            <p className="text-sm text-white/80 mt-2">
                                Banco:{" "}
                                {data.confronto.saldo_banco != null
                                    ? formatCurrency(data.confronto.saldo_banco)
                                    : "—"}
                            </p>
                            <p
                                className={cn(
                                    "text-lg font-black mt-1",
                                    data.confronto.bate ? "text-emerald-300" : "text-amber-200",
                                )}
                            >
                                Δ{" "}
                                {data.confronto.diferenca != null
                                    ? formatCurrency(data.confronto.diferenca)
                                    : "—"}
                            </p>
                        </div>
                    </div>

                    <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/5 bg-black/20">
                            <h3 className="text-sm font-bold text-white">
                                Extratos — {data.conta.nome} · {tituloPeriodo}
                            </h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                {data.totais.extratos} extrato(s) · {data.totais.vinculadas} vinculadas ·{" "}
                                {data.totais.pendentes} pendentes · {data.totais.ignoradas} ignoradas
                            </p>
                        </div>
                        {data.extratos.length === 0 ? (
                            <p className="p-8 text-center text-xs text-muted-foreground">
                                Nenhum extrato no período selecionado.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-black/25 text-muted-foreground border-b border-white/5">
                                    <tr>
                                        <th className="px-4 py-3">Arquivo</th>
                                        <th className="px-4 py-3">Período</th>
                                        <th className="px-4 py-3">Conciliado em</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Progresso</th>
                                        <th className="px-4 py-3">Sistema</th>
                                        <th className="px-4 py-3">Banco</th>
                                        <th className="px-4 py-3">Δ</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                    {data.extratos.map((e) => (
                                        <tr key={e.extrato_id} className="hover:bg-white/[0.02]">
                                            <td className="px-4 py-3 text-white font-medium max-w-[180px] truncate">
                                                {e.arquivo_nome ?? `#${e.extrato_id}`}
                                            </td>
                                            <td className="px-4 py-3 text-white/70 whitespace-nowrap">
                                                {e.periodo_inicio && e.periodo_fim
                                                    ? `${formatDate(e.periodo_inicio)} — ${formatDate(e.periodo_fim)}`
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-white/60">
                                                {e.data_conciliacao ? formatDate(e.data_conciliacao) : "—"}
                                            </td>
                                            <td className="px-4 py-3 uppercase text-[10px] font-bold text-white/80">
                                                {e.status}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {e.resumo_conciliados}/{e.resumo_total}
                                                {e.resumo_pendentes > 0 && (
                                                    <span
                                                        className="text-amber-300"> · {e.resumo_pendentes} pend.</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-white/80">
                                                {formatCurrency(e.saldo_sistema)}
                                            </td>
                                            <td className="px-4 py-3 text-white/80">
                                                {e.saldo_banco != null ? formatCurrency(e.saldo_banco) : "—"}
                                            </td>
                                            <td
                                                className={cn(
                                                    "px-4 py-3 font-semibold",
                                                    e.bate ? "text-emerald-300" : "text-amber-200",
                                                )}
                                            >
                                                {e.diferenca != null ? formatCurrency(e.diferenca) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}