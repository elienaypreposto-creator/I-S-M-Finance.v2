import {useMemo, useState} from "react";
import {useLocation} from "wouter";
import {useQuery} from "@tanstack/react-query";
import {PageHeader} from "@/components/shared/page-header";
import {ApiEnvelope, fetchApi, fetchApiData} from "@/lib/api-config";
import {formatDate, formatCurrency, cn} from "@/lib/utils";
import {ImportExtratoModal} from "@/components/conciliacao/import-extrato-modal";
import {
    Loader2,
    AlertCircle,
    Plus,
    FileStack,
    ChevronLeft,
    ChevronRight,
    Landmark,
    AlertTriangle,
} from "lucide-react";

export type ConciliacaoListItem = {
    conciliacao_id: number;
    extrato_id: number;
    conta_id: number;
    conta_nome: string | null;
    arquivo_nome: string | null;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    data_conciliacao: string | null;
    status: string;
    resumo_conciliados: number | null;
    resumo_ignorados: number | null;
    resumo_pendentes: number | null;
    resumo_total: number | null;
    created_at: string;
};

type ContaBancariaSaldo = {
    id: number;
    nome: string;
    banco?: string | null;
    status?: string | null;
    cor?: string | null;
    saldo_atual: string | number;
};

type PendenciasMesResponse = {
    meses: Array<{
        mes: number;
        ano: number;
        extratos_pendentes: number;
        linhas_pendentes: number;
        contas: Array<{
            conta_id: number;
            conta_nome: string | null;
            extratos_pendentes: number;
            linhas_pendentes: number;
            dias_sem_extrato: string[];
        }>;
    }>;
};

const MESES_PT = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
];

function num(v: number | null | undefined) {
    return Number(v ?? 0);
}

function statusStyles(status: string) {
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

function nomeMes(mes: number, ano: number) {
    return `${MESES_PT[mes - 1] ?? mes} de ${ano}`;
}

/** Widget de saldo por conta (Card 42, item 4) - a empresa tem 10 contas. */
function WidgetContasBancarias() {
    const {data, isLoading, isError} = useQuery({
        queryKey: ["contas-bancarias-widget"],
        queryFn: () => fetchApiData<ContaBancariaSaldo[]>("/contas-bancarias"),
    });

    const contas = data ?? [];

    if (isLoading) {
        return (
            <div
                className="glass-panel rounded-2xl border border-white/10 p-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary"/>
                Carregando saldo das contas…
            </div>
        );
    }

    if (isError || contas.length === 0) {
        return null;
    }

    return (
        <div className="glass-panel rounded-2xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-3">
                <Landmark className="w-4 h-4 text-primary"/>
                <h2 className="text-xs font-bold text-white uppercase tracking-wide">Saldo por conta</h2>
                <span className="text-[10px] text-muted-foreground">
                    · {contas.length} conta{contas.length !== 1 ? "s" : ""}
                </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
                {contas.map((conta) => {
                    const saldo = Number(conta.saldo_atual);
                    const positivo = saldo >= 0;
                    return (
                        <div
                            key={conta.id}
                            className="shrink-0 min-w-[180px] rounded-xl bg-black/30 border border-white/10 p-3"
                            style={conta.cor ? {borderLeftColor: conta.cor, borderLeftWidth: 3} : undefined}
                        >
                            <p className="text-xs font-semibold text-white truncate" title={conta.nome}>
                                {conta.nome}
                            </p>
                            {conta.banco && (
                                <p className="text-[10px] text-muted-foreground truncate">{conta.banco}</p>
                            )}
                            <p
                                className={cn(
                                    "text-sm font-black mt-1",
                                    positivo ? "text-emerald-300" : "text-red-300",
                                )}
                            >
                                {formatCurrency(saldo)}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** FEAT-07: alerta informativo de meses com extratos pendentes. */
function AlertaPendenciasMes() {
    const {data} = useQuery({
        queryKey: ["conciliacoes-pendencias-mes"],
        queryFn: () => fetchApiData<PendenciasMesResponse>("/conciliacoes/pendencias-mes"),
        staleTime: 60_000,
    });

    const alertas = data?.meses ?? [];
    if (alertas.length === 0) return null;

    return (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 flex flex-col gap-2">
            <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5"/>
                <div className="flex flex-col gap-1.5 text-xs">
                    {alertas.map((m) => {
                        const buracos = m.contas.reduce((s, c) => s + (c.dias_sem_extrato?.length ?? 0), 0);
                        return (
                            <p key={`${m.ano}-${m.mes}`} className="text-amber-100/95">
                                <span className="font-semibold capitalize">{nomeMes(m.mes, m.ano)}</span>
                                {" "}tem{" "}
                                <span className="font-bold text-amber-200">{m.extratos_pendentes}</span>
                                {" "}extrato{m.extratos_pendentes !== 1 ? "s" : ""} pendente
                                {m.extratos_pendentes !== 1 ? "s" : ""}
                                {m.linhas_pendentes > 0 ? (
                                    <>
                                        {" "}({m.linhas_pendentes} linha
                                        {m.linhas_pendentes !== 1 ? "s" : ""} ainda sem vínculo)
                                    </>
                                ) : null}
                                {buracos > 0 ? (
                                    <span className="text-amber-200/70">
                                        {" "}· {buracos} dia{buracos !== 1 ? "s" : ""} sem extrato no período
                                        coberto
                                    </span>
                                ) : null}
                            </p>
                        );
                    })}
                    <p className="text-[10px] text-amber-200/60">
                        Alerta informativo — não bloqueia operações. Desaparece quando o mês fecha.
                    </p>
                </div>
            </div>
        </div>
    );
}

function buildMesOptions(qtd = 18) {
    const agora = new Date();
    const opts: { value: string; label: string; mes: number; ano: number }[] = [];
    for (let i = 0; i < qtd; i++) {
        const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        const mes = d.getMonth() + 1;
        const ano = d.getFullYear();
        opts.push({
            value: `${ano}-${String(mes).padStart(2, "0")}`,
            label: `${MESES_PT[mes - 1]} / ${ano}`,
            mes,
            ano,
        });
    }
    return opts;
}

export default function ConciliacaoList() {
    const [, setLocation] = useLocation();
    const agora = new Date();
    const [page, setPage] = useState(1);
    const [importOpen, setImportOpen] = useState(false);
    const [mesAno, setMesAno] = useState(
        () => `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`,
    );
    const [contaId, setContaId] = useState<string>("");
    const limit = 15;

    const mesOptions = useMemo(() => buildMesOptions(18), []);
    const [anoFiltro, mesFiltro] = mesAno.split("-").map(Number);

    const {data: contas} = useQuery({
        queryKey: ["contas-bancarias-filtro"],
        queryFn: () => fetchApiData<ContaBancariaSaldo[]>("/contas-bancarias"),
    });

    const {data, isLoading, isError, refetch} = useQuery({
        queryKey: ["conciliacoes", page, limit, mesAno, contaId],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("limit", String(limit));
            if (mesFiltro && anoFiltro) {
                params.set("mes", String(mesFiltro));
                params.set("ano", String(anoFiltro));
            }
            if (contaId) params.set("conta_id", contaId);
            const envelope = await fetchApi<ApiEnvelope<ConciliacaoListItem[]>>(
                `/conciliacoes?${params.toString()}`,
            );
            const meta = envelope.meta as { total?: number } | null;
            return {
                items: envelope.data,
                total: meta?.total ?? 0,
            };
        },
    });

    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return (
        <div className="flex flex-col gap-4 h-full">
            <PageHeader
                title="Conciliação Bancária"
                description="Extratos importados e progresso de vínculo com lançamentos"
                actions={
                    <button
                        type="button"
                        onClick={() => setImportOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 transition-colors"
                    >
                        <Plus className="w-4 h-4"/>
                        Importar extrato
                    </button>
                }
            />

            <ImportExtratoModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
                onImported={(extratoId) => {
                    setImportOpen(false);
                    setLocation(`/conciliacao/extrato/${extratoId}`);
                }}
            />

            <AlertaPendenciasMes/>
            <WidgetContasBancarias/>

            <div
                className="glass-panel rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0 border border-white/10">
                <div
                    className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center gap-3 justify-between bg-black/20">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileStack className="w-4 h-4"/>
                        <span>{total.toLocaleString("pt-BR")} extrato(s) no filtro</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Mês
                            <select
                                value={mesAno}
                                onChange={(e) => {
                                    setMesAno(e.target.value);
                                    setPage(1);
                                }}
                                className="ml-1.5 bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white capitalize"
                            >
                                {mesOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Conta
                            <select
                                value={contaId}
                                onChange={(e) => {
                                    setContaId(e.target.value);
                                    setPage(1);
                                }}
                                className="ml-1.5 bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white min-w-[160px]"
                            >
                                <option value="">Todas</option>
                                {(contas ?? []).map((c) => (
                                    <option key={c.id} value={String(c.id)}>
                                        {c.nome}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>

                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-black/25 text-muted-foreground border-b border-white/5">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Conta</th>
                            <th className="px-4 py-3 font-semibold">Arquivo</th>
                            <th className="px-4 py-3 font-semibold">Período</th>
                            <th className="px-4 py-3 font-semibold">Conciliado em</th>
                            <th className="px-4 py-3 font-semibold">Progresso</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                            <th className="px-4 py-3 font-semibold">Importado em</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                        {isLoading ? (
                            <tr>
                                <td colSpan={7} className="py-16 text-center text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary"/>
                                    <p className="mt-2 text-xs">Carregando extratos…</p>
                                </td>
                            </tr>
                        ) : isError ? (
                            <tr>
                                <td colSpan={7} className="py-16 text-center">
                                    <div className="flex flex-col items-center gap-2 text-destructive">
                                        <AlertCircle className="w-7 h-7"/>
                                        <span className="text-xs">Não foi possível carregar as conciliações.</span>
                                        <button
                                            type="button"
                                            onClick={() => void refetch()}
                                            className="mt-2 text-xs underline text-white/70 hover:text-white"
                                        >
                                            Tentar novamente
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-16 text-center text-muted-foreground text-xs">
                                    Nenhum extrato neste período. Ajuste o mês/conta ou importe um OFX/CSV.
                                </td>
                            </tr>
                        ) : (
                            items.map((row) => {
                                const totalLinhas = num(row.resumo_total);
                                const conc = num(row.resumo_conciliados);
                                const ign = num(row.resumo_ignorados);
                                const pend = num(row.resumo_pendentes);
                                const tratadas = conc + ign;
                                const pct =
                                    totalLinhas > 0 ? Math.round((tratadas / totalLinhas) * 100) : 0;

                                return (
                                    <tr
                                        key={row.conciliacao_id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setLocation(`/conciliacao/extrato/${row.extrato_id}`)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setLocation(`/conciliacao/extrato/${row.extrato_id}`);
                                            }
                                        }}
                                        className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                                    >
                                        <td className="px-4 py-3 text-white font-medium">
                                            {row.conta_nome ?? "—"}
                                        </td>
                                        <td
                                            className="px-4 py-3 text-white/80 max-w-[200px] truncate"
                                            title={row.arquivo_nome ?? ""}
                                        >
                                            {row.arquivo_nome ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">
                                            {row.periodo_inicio && row.periodo_fim
                                                ? `${formatDate(row.periodo_inicio)} — ${formatDate(row.periodo_fim)}`
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">
                                            {row.data_conciliacao ? formatDate(row.data_conciliacao) : "—"}
                                        </td>
                                        <td className="px-4 py-3 min-w-[200px]">
                                            <div className="flex flex-col gap-1">
                                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-all"
                                                        style={{width: `${pct}%`}}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground leading-tight">
                                                        Vinculados:{" "}
                                                    <span className="text-emerald-400 font-semibold">{conc}</span>
                                                    {" · "}
                                                    Pendentes:{" "}
                                                    <span className="text-amber-300 font-semibold">{pend}</span>
                                                    {ign > 0 ? (
                                                        <>
                                                            {" · "}
                                                            Ignorados:{" "}
                                                            <span className="text-white/50 font-semibold">{ign}</span>
                                                        </>
                                                    ) : null}
                                                    {" · "}
                                                    Total: {totalLinhas}
                                                    </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusStyles(row.status)}`}
                                                >
                                                    {row.status}
                                                </span>
                                        </td>
                                        <td className="px-4 py-3 text-white/60 whitespace-nowrap">
                                            {formatDate(row.created_at)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                        </tbody>
                    </table>
                </div>

                <div
                    className="px-4 py-3 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground bg-black/15">
                    <span>
                        Página {page} de {totalPages}
                    </span>
                    <div className="flex gap-1">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 inline-flex items-center gap-1"
                        >
                            <ChevronLeft className="w-3.5 h-3.5"/>
                            Anterior
                        </button>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 inline-flex items-center gap-1"
                        >
                            Próxima
                            <ChevronRight className="w-3.5 h-3.5"/>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
