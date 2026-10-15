import {tenantQueryKey} from "@/lib/tenant-query";
import {useMemo, useState} from "react";
import {StatusBadge} from "@/components/shared/status-badge";
import {cn, formatCurrency, formatDate} from "@/lib/utils";
import {DateRangePicker} from "@/components/shared/date-range-picker";
import {keepPreviousData, useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {Plus, Download, Loader2, AlertCircle, Calendar} from "lucide-react";
import {
    CampoBusca,
    FiltrosAtivos,
    FiltrosPopover,
    FOCO_VISIVEL,
    separarMulti,
    useFiltrosNaUrl,
    type DefinicaoFiltro,
    type OpcaoFiltro,
} from "@/components/shared/filtros";
import {BotaoEditar, BotaoExcluir} from "@/components/shared/botoes-acao";
import {ApiEnvelope, fetchApi, fetchApiData} from "@/lib/api-config";
import {LancamentoModal} from "@/components/lancamentos/lancamento-modal";
import {exportToExcel, fmtBRL, fmtDate as fmtDateExport} from "@/lib/export";
import {prefixoDescricaoLista, rotuloTipoDocumento, type TipoDocumentoLancamento} from "@/lib/lancamento-documento";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {invalidateRelated} from "@/App";
import {RequiresPermission} from "@/components/auth/requires-permission";
import {PERM} from "@/lib/permissoes";

type Lancamento = {
    id: number;
    tipo: string;
    vencimento: string;
    competencia: string | null;
    conta_id: number | null;
    conta_nome: string | null;
    parceiro_id: number | null;
    parceiro_nome: string | null;
    descricao: string | null;
    tipo_documento?: TipoDocumentoLancamento | null;
    numero_documento?: string | null;
    observacao?: string | null;
    valor: string | number;
    status: string;
    plano_conta_id: number | null;
    plano_conta_nome: string | null;
    riscos?: string[];
};

type LancamentosListResult = { items: Lancamento[]; total: number };

const BANK_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
    "itaú": {abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)"},
    "itau": {abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)"},
    "bradesco": {abbr: "BRA", color: "#CC0000", bg: "rgba(204,0,0,0.15)"},
    "santander": {abbr: "SAN", color: "#E50001", bg: "rgba(229,0,1,0.15)"},
    "banco do brasil": {abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)"},
    "bb rende": {abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)"},
    "caixa economica": {abbr: "CEF", color: "#1E78C8", bg: "rgba(30,120,200,0.18)"},
    "nubank": {abbr: "NU", color: "#820AD1", bg: "rgba(130,10,209,0.18)"},
    "inter": {abbr: "INT", color: "#FF6600", bg: "rgba(255,102,0,0.15)"},
    "sicoob": {abbr: "SCB", color: "#00703C", bg: "rgba(0,112,60,0.15)"},
    "sicredi": {abbr: "SIC", color: "#009D4F", bg: "rgba(0,157,79,0.15)"},
    "banpará": {abbr: "BNP", color: "#0055A6", bg: "rgba(0,85,166,0.15)"},
    "brb": {abbr: "BRB", color: "#1A6B3A", bg: "rgba(26,107,58,0.18)"},
    "c6": {abbr: "C6", color: "#272D3B", bg: "rgba(120,125,135,0.3)"},
    "mercado pago": {abbr: "MP", color: "#00BCFF", bg: "rgba(0,188,255,0.15)"},
    "pagseguro": {abbr: "PAG", color: "#009B3A", bg: "rgba(0,155,58,0.15)"},
    "stone": {abbr: "STN", color: "#00A868", bg: "rgba(0,168,104,0.15)"},
    "conta empréstimo": {abbr: "EMPR", color: "#F59E0B", bg: "rgba(245,158,11,0.15)"},
    "conta aplicação": {abbr: "APLI", color: "#6366F1", bg: "rgba(99,102,241,0.15)"},
    "a identificar": {abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)"},
    "--": {abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)"},
};

// ── Tags de risco: paleta semântica por nível de severidade ─────────────────
const RISCO_OPTIONS: Record<string, { label: string; color: string; bg: string; border: string }> = {
    "em_cartorio": {
        label: "Em Cartório",
        color: "#F87171",
        bg: "rgba(248,113,113,0.15)",
        border: "rgba(248,113,113,0.35)"
    },
    "serasa": {label: "Serasa/SPC", color: "#FB923C", bg: "rgba(251,146,60,0.15)", border: "rgba(251,146,60,0.35)"},
    "inadimplente": {
        label: "Inadimplente",
        color: "#FBBF24",
        bg: "rgba(251,191,36,0.15)",
        border: "rgba(251,191,36,0.35)"
    },
    "em_negociacao": {
        label: "Em Negociação",
        color: "#60A5FA",
        bg: "rgba(96,165,250,0.15)",
        border: "rgba(96,165,250,0.35)"
    },
    "acordo_firmado": {
        label: "Acordo Firmado",
        color: "#34D399",
        bg: "rgba(52,211,153,0.15)",
        border: "rgba(52,211,153,0.35)"
    },
    "boleto_vencido": {
        label: "Boleto Vencido",
        color: "#F472B6",
        bg: "rgba(244,114,182,0.15)",
        border: "rgba(244,114,182,0.35)"
    },
    "acao_judicial": {
        label: "Ação Judicial",
        color: "#C084FC",
        bg: "rgba(192,132,252,0.15)",
        border: "rgba(192,132,252,0.35)"
    },
};

function getRiscoStyle(key: string) {
    return RISCO_OPTIONS[key] ?? {
        label: key,
        color: "#94A3B8",
        bg: "rgba(148,163,184,0.15)",
        border: "rgba(148,163,184,0.3)"
    };
}

function getBankBadge(contaNome: string | null) {
    if (!contaNome) return BANK_MAP["a identificar"];
    const lower = contaNome.toLowerCase();
    for (const [key, val] of Object.entries(BANK_MAP)) {
        if (lower.includes(key)) return val;
    }
    const firstWord = contaNome.trim().split(" ")[0].toUpperCase().slice(0, 3);
    return {abbr: firstWord, color: "#94A3B8", bg: "rgba(148,163,184,0.15)"};
}

function podeExcluirLancamento(status: string): boolean {
    return status === "pendente" || status === "atrasado";
}

/** "Pago/Recebido" é uma opção só na tela; na API vira os dois status. */
const STATUS_QUITADO = "quitado";

const STATUS_OPCOES: OpcaoFiltro[] = [
    {valor: "pendente", rotulo: "Pendente"},
    {valor: "atrasado", rotulo: "Atrasado"},
    {valor: STATUS_QUITADO, rotulo: "Pago/Recebido"},
    {valor: "pago_parcial", rotulo: "Pago parcial"},
    {valor: "cancelado", rotulo: "Cancelado"},
];

function statusFiltroParaApi(valor: string): string {
    return separarMulti(valor)
        .flatMap((s) => (s === STATUS_QUITADO ? ["pago", "recebido"] : [s]))
        .join(",");
}

type ContaOpcao = { id: number; nome: string };
type ParceiroOpcao = { id: number; nome: string; tipo_pessoa?: string | null };
type PlanoContaOpcao = { id: number; categoria: string; subcategoria: string | null };
type DepartamentoOpcao = { id: number; nome: string };
type CentroCustoOpcao = { id: number; nome: string; departamento_id: number | null };

type LancamentosMeta = { total?: number; totais?: { receber: number; pagar: number } };
type ExportMeta = { total: number; exportados: number; truncado: boolean; limite: number };

const TABS = [
    {key: "todos", label: "Todos"},
    {key: "cr", label: "C.R"},
    {key: "cp", label: "C.P"},
];

export default function Lancamentos() {
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Lancamento | null>(null);
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const limit = 25;

    // ── Opções dos filtros ──────────────────────────────────────────────────────
    const {data: contas = []} = useQuery({
        queryKey: tenantQueryKey("contas-bancarias-filtro"),
        queryFn: () => fetchApiData<ContaOpcao[]>("/contas-bancarias"),
        staleTime: 60_000,
    });
    const {data: parceiros = []} = useQuery({
        queryKey: tenantQueryKey("parceiros-filtro"),
        queryFn: () => fetchApiData<ParceiroOpcao[]>("/parceiros?limit=200&page=1"),
        staleTime: 60_000,
    });
    const {data: planoContas = []} = useQuery({
        queryKey: tenantQueryKey("plano-contas-filtro"),
        queryFn: () => fetchApiData<PlanoContaOpcao[]>("/plano-contas"),
        staleTime: 60_000,
    });
    const {data: departamentos = []} = useQuery({
        queryKey: tenantQueryKey("departamentos-filtro"),
        queryFn: () => fetchApiData<DepartamentoOpcao[]>("/departamentos"),
        staleTime: 60_000,
    });
    const {data: centrosCusto = []} = useQuery({
        queryKey: tenantQueryKey("centros-custos-filtro"),
        queryFn: () => fetchApiData<CentroCustoOpcao[]>("/centros-custos"),
        staleTime: 60_000,
    });

    const definicoes: DefinicaoFiltro[] = useMemo(() => [
        {chave: "status", rotulo: "Status", tipo: "multi", opcoes: STATUS_OPCOES},
        {chave: "valor", rotulo: "Valor (R$)", tipo: "faixa-moeda"},
        {
            chave: "conta_id",
            rotulo: "Conta bancária",
            tipo: "select",
            placeholder: "Todas as contas",
            opcoes: contas.map((c) => ({valor: String(c.id), rotulo: c.nome})),
        },
        {
            chave: "parceiro_id",
            rotulo: "Cliente/Fornecedor",
            tipo: "combobox",
            placeholder: "Buscar parceiro…",
            opcoes: parceiros.map((p) => ({valor: String(p.id), rotulo: p.nome})),
        },
        {
            chave: "plano_conta_id",
            rotulo: "Plano de contas",
            tipo: "combobox",
            placeholder: "Todas as categorias",
            opcoes: planoContas.map((p) => ({
                valor: String(p.id),
                rotulo: p.subcategoria ? `${p.categoria} / ${p.subcategoria}` : p.categoria,
                grupo: p.categoria,
            })),
        },
        {
            chave: "departamento_id",
            rotulo: "Departamento",
            tipo: "select",
            placeholder: "Todos",
            opcoes: departamentos.map((d) => ({valor: String(d.id), rotulo: d.nome})),
        },
        {
            chave: "centro_custo_id",
            rotulo: "Centro de custo",
            tipo: "select",
            dependeDe: "departamento_id",
            placeholder: "Todos",
            placeholderDependente: "Selecione o departamento",
            opcoes: (rascunho) =>
                centrosCusto
                    .filter((c) => String(c.departamento_id ?? "") === rascunho.departamento_id)
                    .map((c) => ({valor: String(c.id), rotulo: c.nome})),
        },
    ], [contas, parceiros, planoContas, departamentos, centrosCusto]);

    const filtros = useFiltrosNaUrl(definicoes);
    const {ler, atualizar, pagina: page, irParaPagina} = filtros;

    const activeTab = ler("tipo") === "cr" || ler("tipo") === "cp" ? ler("tipo") : "todos";
    const tipo = activeTab === "cr" ? "CR" : activeTab === "cp" ? "CP" : undefined;
    const busca = ler("q");
    const dateStart = ler("data_inicio");
    const dateEnd = ler("data_fim");

    /** Mesmos parâmetros para a listagem e o export. */
    const paramsFiltro = useMemo(() => {
        const params = new URLSearchParams();
        if (tipo) params.set("tipo", tipo);
        if (busca) params.set("search", busca);
        if (dateStart) params.set("data_inicio", dateStart);
        if (dateEnd) params.set("data_fim", dateEnd);
        for (const [chave, valor] of Object.entries(filtros.valores)) {
            params.set(chave, chave === "status" ? statusFiltroParaApi(valor) : valor);
        }
        return params.toString();
    }, [tipo, busca, dateStart, dateEnd, filtros.valores]);

    const {data, isLoading, isError} = useQuery<LancamentosListResult & { totais?: LancamentosMeta["totais"] }>({
        queryKey: tenantQueryKey("lancamentos", paramsFiltro, page),
        queryFn: async () => {
            const params = new URLSearchParams(paramsFiltro);
            params.set("page", String(page));
            params.set("limit", String(limit));
            const envelope = await fetchApi<ApiEnvelope<Lancamento[]>>(`/lancamentos?${params}`);
            const meta = envelope.meta as LancamentosMeta | null;
            return {items: envelope.data, total: meta?.total ?? 0, totais: meta?.totais};
        },
        placeholderData: keepPreviousData,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => fetchApiData<{ deleted: boolean }>(`/lancamentos/${id}`, {method: "DELETE"}),
        onSuccess: () => {
            invalidateRelated(queryClient, "lancamentos");
            toast({title: "Excluído", description: "Lançamento removido com sucesso."});
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível excluir.";
            toast({variant: "destructive", title: "Erro", description: msg});
        },
    });

    const handleDelete = async (l: Lancamento) => {
        if (!podeExcluirLancamento(l.status)) {
            toast({
                variant: "destructive",
                title: "Não é possível excluir",
                description: "Só lançamentos Pendente ou Atrasado podem ser excluídos.",
            });
            return;
        }
        const label = l.descricao ? `"${l.descricao.toUpperCase()}"` : `lançamento #${l.id}`;
        const ok = await confirm({
            title: `Excluir ${label}?`,
            description: "Esta ação não pode ser desfeita. O lançamento será removido permanentemente.",
            confirmLabel: "Excluir",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(l.id);
    };

    const handleEdit = async (l: Lancamento) => {
        const label = l.descricao ? `"${l.descricao.toUpperCase()}"` : `lançamento #${l.id}`;
        const ok = await confirm({
            title: `Editar ${label}?`,
            description: "Você será direcionado ao formulário de edição deste lançamento.",
            confirmLabel: "Editar",
            cancelLabel: "Cancelar",
            variant: "default",
        });
        if (ok) setEditItem(l);
    };

    const lancamentos = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / limit);
    const setPage = (updater: number | ((p: number) => number)) =>
        irParaPagina(typeof updater === "function" ? updater(page) : updater);

    // ── Exportação ──────────────────────────────────────────────────────────────
    const [isExporting, setIsExporting] = useState(false);

    const EXPORT_COLUMNS_LANC = [
        {header: "Tipo", key: "tipo", width: 8},
        {header: "Vencimento", key: "vencimento", width: 14, formatter: (v: unknown) => fmtDateExport(v)},
        {header: "Parceiro", key: "parceiro_nome", width: 32},
        {header: "Descrição", key: "descricao", width: 38},
        {header: "Tipo de documento", key: "tipo_documento_fmt", width: 28},
        {header: "Nº do documento", key: "numero_documento", width: 18},
        {header: "Observação", key: "observacao", width: 40},
        {header: "Categoria", key: "plano_conta_nome", width: 28},
        {header: "Conta", key: "conta_nome", width: 24},
        {header: "Valor (R$)", key: "valor_fmt", width: 18},
        {header: "Status", key: "status", width: 14},
        {header: "Riscos", key: "riscos_fmt", width: 30},
    ];

    async function handleExportLancamentos() {
        setIsExporting(true);
        try {
            // Mesmos filtros da tela, sem paginação (a API limita a 10 mil linhas).
            const envelope = await fetchApi<ApiEnvelope<Lancamento[]>>(`/lancamentos/export?${paramsFiltro}`);
            const meta = envelope.meta as ExportMeta | null;
            const rows = envelope.data.map((l) => ({
                ...l,
                valor_fmt: fmtBRL(Number(l.valor)),
                tipo_documento_fmt: rotuloTipoDocumento(l.tipo_documento) || "-",
                numero_documento: l.numero_documento || "-",
                observacao: l.observacao || "-",
                riscos_fmt: (l.riscos ?? []).map((r) => getRiscoStyle(r).label).join(", ") || "-",
            })) as Record<string, unknown>[];
            const suffix = activeTab !== "todos" ? `_${activeTab.toUpperCase()}` : "";
            exportToExcel(`Lancamentos${suffix}_${new Date().toISOString().split("T")[0]}`, rows, EXPORT_COLUMNS_LANC);
            if (meta?.truncado) {
                toast({
                    title: "Exportação parcial",
                    description: `O filtro tem ${meta.total.toLocaleString("pt-BR")} lançamentos; o arquivo traz os ${meta.limite.toLocaleString("pt-BR")} mais recentes. Refine os filtros para exportar o restante.`,
                });
            }
        } catch {
            toast({variant: "destructive", title: "Erro", description: "Não foi possível exportar os lançamentos."});
        } finally {
            setIsExporting(false);
        }
    }

    const anuncio = isLoading
        ? ""
        : `${total.toLocaleString("pt-BR")} ${total === 1 ? "lançamento encontrado" : "lançamentos encontrados"}`;

    return (
        <div className="flex flex-col gap-2 h-full">
            <ConfirmDialog {...ConfirmDialogProps} />

            {(modalOpen || editItem) && (
                <LancamentoModal
                    onClose={() => {
                        setModalOpen(false);
                        setEditItem(null);
                    }}
                    onSaved={() => {
                        setModalOpen(false);
                        setEditItem(null);
                    }}
                    editItem={editItem}
                />
            )}

            {/* Header compacto */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1">
                <div>
                    <h1 className="text-base font-bold text-white leading-tight">Lançamentos Financeiros</h1>
                    <p className="text-xs text-muted-foreground">Gerencie suas contas a pagar e a receber</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportLancamentos}
                        disabled={isExporting || total === 0}
                        title="Exportar XLSX com os filtros aplicados"
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed", FOCO_VISIVEL)}
                    >
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true"/> :
                            <Download className="w-3.5 h-3.5" aria-hidden="true"/>}
                        {isExporting ? "Exportando…" : "Exportar XLSX"}
                    </button>
                    <button
                        onClick={() => setModalOpen(true)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-all shadow-md shadow-primary/30", FOCO_VISIVEL)}>
                        <Plus className="w-3.5 h-3.5" aria-hidden="true"/>
                        Novo Lançamento
                    </button>
                </div>
            </div>

            {/* Painel principal */}
            <div className="glass-panel rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0">
                {/* Toolbar: tipo, período e Filtros à esquerda; busca à direita */}
                <div
                    className="px-4 py-2.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/5" role="group" aria-label="Tipo de lançamento">
                            {TABS.map(({key, label}) => (
                                <button key={key}
                                        type="button"
                                        aria-pressed={activeTab === key}
                                        onClick={() => atualizar({tipo: key === "todos" ? null : key})}
                                        className={cn(`px-4 py-1 rounded-md text-xs font-bold transition-colors ${
                                            activeTab === key
                                                ? key === "cr" ? "bg-teal-500/20 text-teal-300 shadow-sm"
                                                    : key === "cp" ? "bg-orange-500/20 text-orange-300 shadow-sm"
                                                        : "bg-white/10 text-white shadow-sm"
                                                : "text-muted-foreground hover:text-white"
                                        }`, FOCO_VISIVEL)}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        <DateRangePicker
                            startDate={dateStart}
                            endDate={dateEnd}
                            onChange={(start: string, end: string) => {
                                atualizar({data_inicio: start || null, data_fim: end || null});
                            }}
                        />

                        <FiltrosPopover
                            definicoes={definicoes}
                            valores={filtros.valores}
                            contagem={filtros.contagem}
                            onAplicar={filtros.aplicar}
                        />
                    </div>

                    <CampoBusca
                        valor={busca}
                        onBuscar={(termo) => atualizar({q: termo || null})}
                        placeholder="Buscar por descrição, parceiro ou documento…"
                        rotulo="Buscar lançamentos por descrição, parceiro ou documento"
                    />
                </div>

                <FiltrosAtivos
                    chips={filtros.chips}
                    onRemover={filtros.remover}
                    onLimparTodos={filtros.limpar}
                    anuncio={anuncio}
                    resumo={
                        !isLoading && data ? (
                            <span>
                                {total.toLocaleString("pt-BR")} {total === 1 ? "lançamento" : "lançamentos"}
                                {data.totais && (
                                    <>
                                        {" · "}A receber{" "}
                                        <strong className="text-teal-300">{formatCurrency(data.totais.receber)}</strong>
                                        {" · "}A pagar{" "}
                                        <strong className="text-orange-300">{formatCurrency(data.totais.pagar)}</strong>
                                    </>
                                )}
                            </span>
                        ) : undefined
                    }
                />

                {/* Table */}
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-black/20 text-muted-foreground border-b border-white/5">
                        <tr>
                            <th className="px-3 py-3 font-semibold w-14 text-center">Tipo</th>
                            <th className="px-3 py-3 font-semibold">Vencimento</th>
                            <th className="px-3 py-3 font-semibold">Banco</th>
                            <th className="px-3 py-3 font-semibold">Parceiro</th>
                            <th className="px-3 py-3 font-semibold">Descrição</th>
                            <th className="px-3 py-3 font-semibold">Categoria</th>
                            <th className="px-3 py-3 font-semibold">Riscos</th>
                            <th className="px-3 py-3 font-semibold text-right">R$ Valor</th>
                            <th className="px-3 py-3 font-semibold text-center">Status</th>
                            <th className="px-3 py-3 font-semibold text-right">Ações</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                        {isLoading ? (
                            <tr>
                                <td colSpan={10} className="py-16 text-center">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <Loader2 className="w-7 h-7 animate-spin text-primary"/>
                                        <span className="text-xs">Carregando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : isError ? (
                            <tr>
                                <td colSpan={10} className="py-16 text-center">
                                    <div className="flex flex-col items-center gap-2 text-destructive">
                                        <AlertCircle className="w-7 h-7"/>
                                        <span className="text-xs">Erro ao carregar dados. Verifique se o servidor está ativo.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : lancamentos.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="py-16 text-center text-muted-foreground text-xs">
                                    Nenhum lançamento encontrado.
                                </td>
                            </tr>
                        ) : lancamentos.map((l) => {
                            const bank = getBankBadge(l.conta_nome);
                            const isCR = l.tipo === "CR";
                            const riscos = l.riscos ?? [];
                            return (
                                <tr key={l.id} className="hover:bg-white/[0.04] transition-colors group">
                                    {/* Tipo CP/CR badge */}
                                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded ${
                          isCR ? "bg-teal-500/15 text-teal-300 border border-teal-500/25"
                              : "bg-orange-500/15 text-orange-300 border border-orange-500/25"
                      }`}>
                        {l.tipo}
                      </span>
                                    </td>

                                    {/* Vencimento */}
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-1.5 text-white/80 font-medium">
                                            <Calendar className="w-3 h-3 text-muted-foreground shrink-0"/>
                                            {formatDate(l.vencimento)}
                                        </div>
                                    </td>

                                    {/* Banco - ícone/badge */}
                                    <td className="px-3 py-2.5">
                      <span
                          title={l.conta_nome || "A identificar"}
                          className="inline-flex items-center justify-center w-9 h-6 rounded text-[10px] font-black leading-none cursor-default"
                          style={{color: bank.color, background: bank.bg, border: `1px solid ${bank.color}40`}}>
                        {bank.abbr}
                      </span>
                                    </td>

                                    {/* Parceiro */}
                                    <td className="px-3 py-2.5 font-medium text-white max-w-[160px] truncate"
                                        title={l.parceiro_nome || ""}>
                                        {l.parceiro_nome || <span className="text-white/30 italic">-</span>}
                                    </td>

                                    {/* Descrição */}
                                    <td className="px-3 py-2.5 text-white/60 max-w-[200px] truncate"
                                        title={prefixoDescricaoLista(l.tipo_documento, l.numero_documento, l.descricao)}>
                                        {prefixoDescricaoLista(l.tipo_documento, l.numero_documento, l.descricao)}
                                    </td>

                                    {/* Categoria */}
                                    <td className="px-3 py-2.5 max-w-[220px] truncate">
                                        {l.plano_conta_nome
                                            ? <span title={l.plano_conta_nome}
                                                    className="text-[10px] bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-white/70">{l.plano_conta_nome}</span>
                                            : <span className="text-white/25 italic text-[10px]">Sem cat.</span>}
                                    </td>

                                    {/* ── Riscos ── */}
                                    <td className="px-3 py-2.5">
                                        {riscos.length === 0 ? (
                                            <span className="text-white/20 italic text-[10px]">-</span>
                                        ) : (
                                            <div className="flex gap-1 flex-wrap">
                                                {riscos.map((r) => {
                                                    const s = getRiscoStyle(r);
                                                    return (
                                                        <span
                                                            key={r}
                                                            title={s.label}
                                                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                            style={{
                                                                color: s.color,
                                                                background: s.bg,
                                                                border: `1px solid ${s.border}`
                                                            }}
                                                        >
                                {s.label}
                              </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </td>

                                    {/* Valor - sem $ na frente */}
                                    <td className={`px-3 py-2.5 text-right font-bold ${isCR ? "text-teal-300" : "text-white/90"}`}>
                                        {isCR ? "" : "- "}
                                        {formatCurrency(Number(l.valor)).replace("R$", "").trim()}
                                    </td>

                                    {/* Status */}
                                    <td className="px-3 py-2.5 text-center">
                                        <StatusBadge status={l.status}/>
                                    </td>

                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center justify-end gap-2">
                                            <BotaoEditar onClick={() => handleEdit(l)}/>
                                            <RequiresPermission permission={PERM.LANCAMENTOS_DELETAR}>
                                                <BotaoExcluir
                                                    onClick={() => handleDelete(l)}
                                                    disabled={deleteMutation.isPending}
                                                />
                                            </RequiresPermission>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div
                    className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground bg-black/10">
          <span>
            {isLoading ? "..." : total === 0 ? "0 registros" : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total.toLocaleString("pt-BR")} registros`}
          </span>
                    <div className="flex gap-1">
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                                className="px-2.5 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                            ‹ Anterior
                        </button>
                        {Array.from({length: Math.min(totalPages, 5)}, (_, i) => {
                            const start = Math.max(1, page - 2);
                            const pageNum = start + i;
                            if (pageNum > totalPages) return null;
                            return (
                                <button key={pageNum} onClick={() => setPage(pageNum)}
                                        aria-current={pageNum === page ? "page" : undefined}
                                        className={`px-2.5 py-1 rounded font-medium transition-colors ${pageNum === page ? "bg-primary text-white" : "hover:bg-white/5"}`}>
                                    {pageNum}
                                </button>
                            );
                        })}
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                                className="px-2.5 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                            Próxima ›
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}