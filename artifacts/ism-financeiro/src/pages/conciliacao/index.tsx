import {useState, type MouseEvent} from "react";
import {useLocation} from "wouter";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {PageHeader} from "@/components/shared/page-header";
import {ApiEnvelope, fetchApi, fetchApiData} from "@/lib/api-config";
import {cn} from "@/lib/utils";
import {ImportExtratoModal} from "@/components/conciliacao/import-extrato-modal";
import {DateRangePicker} from "@/components/shared/date-range-picker";
import {RequiresPermission} from "@/components/auth/requires-permission";
import {PERM} from "@/lib/permissoes";
import {useAuth} from "@/hooks/use-auth";
import {useToast} from "@/hooks/use-toast";
import {useConfirm} from "@/hooks/use-confirm";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {
    Loader2,
    AlertCircle,
    Plus,
    FileStack,
    ChevronLeft,
    ChevronRight,
    Trash2,
} from "lucide-react";

export type ConciliacaoListItem = {
    conciliacao_id: number;
    extrato_id: number;
    conta_id: number;
    conta_nome: string | null;
    conta_agencia?: string | null;
    conta_digito_agencia?: string | null;
    conta_numero?: string | null;
    conta_digito?: string | null;
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

/** Opções do filtro de conta (só id + nome). */
type ContaFiltro = {
    id: number;
    nome: string;
};

function num(v: number | null | undefined) {
    return Number(v ?? 0);
}

/** DD/MM/YYYY */
function formatDatePt(dateString: string | null | undefined): string {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Sao_Paulo",
    }).format(date);
}

/** DD/MM/YYYY HH:mm */
function formatDateTimePt(dateString: string | null | undefined): string {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    const parts = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Sao_Paulo",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? "";
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function statusStyles(status: string) {
    switch (status) {
        case "conciliado":
            return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
        case "parcial":
            return "bg-amber-500/15 text-amber-300 border-amber-500/30";
        case "cancelado":
            return "bg-white/10 text-muted-foreground border-white/15";
        case "pendente":
            return "bg-amber-500/15 text-amber-300 border-amber-500/30";
        default:
            return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    }
}

/** Enquanto o extrato não estiver 100% conciliado, o rótulo exibido é sempre
 *  "pendente" - não expomos o estado intermediário "parcial" na listagem
 *  (ver print: só existem os badges PENDENTE e CONCILIADO). A cor já é a
 *  mesma para os dois em statusStyles, então só precisamos normalizar o
 *  texto mostrado. */
function statusLabel(status: string): string {
    return status === "parcial" ? "pendente" : status;
}

function formatAgenciaConta(row: ConciliacaoListItem): string {
    const agencia = [row.conta_agencia, row.conta_digito_agencia].filter(Boolean).join("") || "-";
    const contaBase = row.conta_numero ?? "-";
    const conta = row.conta_digito ? `${contaBase}-${row.conta_digito}` : contaBase;
    return `Agência:${agencia} | Conta:${conta}`;
}

export default function ConciliacaoList() {
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {hasPermission} = useAuth();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const canDelete = hasPermission(PERM.CONCILIACAO_IMPORTAR);

    const [page, setPage] = useState(1);
    const [importOpen, setImportOpen] = useState(false);
    /** "" = sem filtro de período (histórico completo, mais recente primeiro). */
    const [dataInicio, setDataInicio] = useState("");
    const [dataFim, setDataFim] = useState("");
    const [contaId, setContaId] = useState<string>("");
    const limit = 15;

    const {data: contas} = useQuery({
        queryKey: ["contas-bancarias-filtro"],
        queryFn: () => fetchApiData<ContaFiltro[]>("/contas-bancarias"),
    });

    const {data, isLoading, isError, refetch} = useQuery({
        queryKey: ["conciliacoes", page, limit, dataInicio, dataFim, contaId],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("limit", String(limit));
            if (dataInicio) params.set("data_inicio", dataInicio);
            if (dataFim) params.set("data_fim", dataFim);
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

    const deleteMutation = useMutation({
        mutationFn: (extratoId: number) =>
            fetchApiData<{ deleted: boolean }>(`/conciliacoes/${extratoId}`, {method: "DELETE"}),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["conciliacoes"]});
            toast({
                title: "Extrato excluído",
                description: "O extrato e a conciliação associada foram removidos.",
            });
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Não foi possível excluir",
                description: e instanceof Error ? e.message : "Tente novamente.",
            });
        },
    });

    const handleDelete = async (row: ConciliacaoListItem, e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const ok = await confirm({
            title: "Excluir extrato?",
            description: `Remover "${row.arquivo_nome ?? `extrato #${row.extrato_id}`}" e a conciliação associada? Esta ação não pode ser desfeita.`,
            confirmLabel: "Excluir",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(row.extrato_id);
    };

    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const openExtrato = (extratoId: number) => {
        setLocation(`/conciliacao/extrato/${extratoId}`);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <PageHeader
                title="Conciliação Bancária"
                description="Extratos importados e progresso de vínculo com lançamentos"
                actions={
                    <RequiresPermission permission={PERM.CONCILIACAO_IMPORTAR}>
                        <button
                            type="button"
                            onClick={() => setImportOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 transition-colors"
                        >
                            <Plus className="w-4 h-4"/>
                            Importar extrato
                        </button>
                    </RequiresPermission>
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

            <div
                className="glass-panel rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0 border border-white/10">
                <div
                    className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center gap-3 bg-black/20">
                    {/* mesmo componente usado em Lançamentos */}
                    <div className="flex flex-wrap items-center gap-2">
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

                        <DateRangePicker
                            startDate={dataInicio}
                            endDate={dataFim}
                            onChange={(start, end) => {
                                setDataInicio(start);
                                setDataFim(end);
                                setPage(1);
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                        <FileStack className="w-4 h-4"/>
                        <span>{total.toLocaleString("pt-BR")} extrato(s) no filtro</span>
                    </div>
                </div>

                <div className="overflow-x-auto flex-1 min-h-0">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-black/25 text-muted-foreground border-b border-white/5 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 font-semibold">STATUS</th>
                            <th className="px-4 py-3 font-semibold">IMPORTADO EM</th>
                            <th className="px-4 py-3 font-semibold">BANCO</th>
                            <th className="px-4 py-3 font-semibold">PERÍODO</th>
                            <th className="px-4 py-3 font-semibold text-right">CONCILIADOS</th>
                            <th className="px-4 py-3 font-semibold text-right">IGNORADOS</th>
                            <th className="px-4 py-3 font-semibold text-right">PENDENTES</th>
                            <th className="px-4 py-3 font-semibold text-right">TOTAL</th>
                            <th className="px-3 py-3 font-semibold w-12" aria-label="Ações"/>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                        {isLoading ? (
                            <tr>
                                <td colSpan={9} className="py-16 text-center text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary"/>
                                    <p className="mt-2 text-xs">Carregando extratos…</p>
                                </td>
                            </tr>
                        ) : isError ? (
                            <tr>
                                <td colSpan={9} className="py-16 text-center">
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
                                <td colSpan={9} className="py-16 text-center text-muted-foreground text-xs">
                                    Nenhum extrato encontrado. Ajuste o mês/conta ou importe um OFX.
                                </td>
                            </tr>
                        ) : (
                            items.map((row) => (
                                <tr
                                    key={row.conciliacao_id}
                                    role="link"
                                    tabIndex={0}
                                    onClick={() => openExtrato(row.extrato_id)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            openExtrato(row.extrato_id);
                                        }
                                    }}
                                    className="hover:bg-white/[0.06] cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-white/[0.06]"
                                >
                                    <td className="px-4 py-3">
                                        <span
                                            className={cn(
                                                "inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border",
                                                statusStyles(row.status),
                                            )}
                                        >
                                            {statusLabel(row.status)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-white/80 whitespace-nowrap tabular-nums">
                                        {formatDateTimePt(row.created_at)}
                                    </td>
                                    <td className="px-4 py-3 min-w-[180px]">
                                        <p className="text-white font-semibold truncate" title={row.conta_nome ?? ""}>
                                            {row.conta_nome ?? "-"}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                            {formatAgenciaConta(row)}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-white/70 whitespace-nowrap">
                                        {row.periodo_inicio && row.periodo_fim
                                            ? `De ${formatDatePt(row.periodo_inicio)} à ${formatDatePt(row.periodo_fim)}`
                                            : "-"}
                                    </td>
                                    <td className="px-4 py-3 text-right text-emerald-300/90 font-semibold tabular-nums">
                                        {num(row.resumo_conciliados)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-white/60 font-semibold tabular-nums">
                                        {num(row.resumo_ignorados)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-amber-300/90 font-semibold tabular-nums">
                                        {num(row.resumo_pendentes)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-white font-bold tabular-nums">
                                        {num(row.resumo_total)}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        {canDelete && row.status !== "conciliado" ? (
                                            <button
                                                type="button"
                                                title="Excluir extrato"
                                                disabled={deleteMutation.isPending}
                                                onClick={(e) => void handleDelete(row, e)}
                                                className="inline-flex p-1.5 rounded-lg text-muted-foreground hover:text-red-300 hover:bg-red-500/15 transition-colors disabled:opacity-40"
                                            >
                                                {deleteMutation.isPending ? (
                                                    <Loader2 className="w-4 h-4 animate-spin"/>
                                                ) : (
                                                    <Trash2 className="w-4 h-4"/>
                                                )}
                                            </button>
                                        ) : null}
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>

                <div
                    className="px-4 py-3 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground bg-black/15 shrink-0">
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

            <ConfirmDialog {...ConfirmDialogProps} />
        </div>
    );
}