import {tenantQueryKey} from "@/lib/tenant-query";
import {Fragment, useEffect, useMemo, useRef, useState} from "react";
import {PageHeader} from "@/components/shared/page-header";
import {Download, Target, TrendingUp, TrendingDown, Loader2, ChevronDown, ChevronRight, Eye, EyeOff} from "lucide-react";
import {useDinheiro, useSaldosVisiveis} from "@/components/conta/saldos-visiveis";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {ToastAction} from "@/components/ui/toast";
import {fetchApiData} from "@/lib/api-config";
import {formatCurrency} from "@/lib/utils";
import {formatValorBrInput, apiValorToValorBr} from "@/validations/lancamentos.schema";
import {
    MESES_CURTOS as MESES,
    MESES_EXTENSO,
    acaoAoSalvarCelula,
    entradaMetaParaApi,
    resumirCadastroMetas,
    rotuloCelulaMeta,
    rotuloPeriodoMetas,
    valorMeta,
} from "@/lib/metas-cadastro";
import {invalidateRelated} from "@/App";
import {TableSkeleton} from "@/components/shared/table-skeleton";
import {Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription} from "@/components/ui/empty";
import {SelectCampo} from "@/components/ui/select-campo";
import {
    FiltrosAtivos,
    FiltrosPopover,
    separarMulti,
    useFiltrosNaUrl,
    type DefinicaoFiltro,
    type OpcaoFiltro,
} from "@/components/shared/filtros";

// ─── Tipos 
type PlanoConta = {
    id: number;
    tipo: string;
    categoria: string;
    subcategoria: string | null;
    ativo: boolean;
};

type MetaRow = {
    id: number;
    plano_conta_id: number;
    ano: number;
    mes: number;
    valor_projetado: string;
};

type ActiveCell = {
    plano_conta_id: number;
    mes: number;
    value: string;
};

// ─── Constantes 
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 7}, (_, i) => CURRENT_YEAR + 3 - i);
const TODOS_MESES = Array.from({length: 12}, (_, i) => i + 1);

// ─── Filtros (ISMF-33) — estado na URL: ?ano=2026&plano_conta_id=12&mes=1,2,3
const OPCOES_MES: OpcaoFiltro[] = MESES_EXTENSO.map((rotulo, i) => ({valor: String(i + 1), rotulo}));
const TIPO_ROTULO_CURTO: Record<string, string> = {receita: "Receitas", custo: "Custos", despesa: "Despesas"};
const collator = new Intl.Collator("pt-BR", {sensitivity: "base"});

/** Ano vindo da URL (?ano=2026); ausente ou inválido → ano corrente. */
function anoDaUrl(valor: string): number {
    if (!/^\d{4}$/.test(valor)) return CURRENT_YEAR;
    const n = Number(valor);
    return n >= 2000 && n <= 2100 ? n : CURRENT_YEAR;
}

const TIPO_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    receita: {
        label: "Receitas (+)",
        color: "text-teal-400",
        bg: "bg-teal-500/10",
        border: "border-teal-500/20",
    },
    custo: {
        label: "Custos (-)",
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
    },
    despesa: {
        label: "Despesas (-)",
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
    },
};
const TIPO_ORDER = ["receita", "custo", "despesa"];

// ─── Utilitário de exibição compacta (sem "R$") ─────────────────────────────
function compactBrl(valor: string | undefined): string {
    if (!valor) return "—";
    const n = parseFloat(valor);
    if (!n) return "—";
    return n.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

/** Nome da linha para leitores de tela e avisos: "Categoria / Subcategoria". */
function nomeLinha(pc: Pick<PlanoConta, "categoria" | "subcategoria">): string {
    return pc.subcategoria ? `${pc.categoria} / ${pc.subcategoria}` : pc.categoria;
}

// ─── Exportação CSV ────────────────────────────────────────────────────────────
function exportarCSV(
    ano: number,
    grouped: Map<string, Map<string, PlanoConta[]>>,
    metasMap: Map<string, string>,
    stats: { receitas: number; saidas: number; resultado: number },
) {
    const BOM = "\uFEFF"; // garante acentos no Excel
    const sep = ";";
    const rows: string[] = [];

    // Cabeçalho
    const header = ["Tipo", "Categoria", "Subcategoria", ...MESES, "Total Ano"];
    rows.push(header.map((c) => `"${c}"`).join(sep));

    for (const tipo of TIPO_ORDER) {
        const catMap = grouped.get(tipo);
        if (!catMap || catMap.size === 0) continue;
        const cfg = TIPO_CONFIG[tipo];

        for (const [categoria, items] of catMap.entries()) {
            for (const pc of items) {
                const valores = Array.from({length: 12}, (_, i) => {
                    const v = parseFloat(metasMap.get(`${pc.id}-${i + 1}`) ?? "0") || 0;
                    return v.toFixed(2).replace(".", ",");
                });
                const total = valores
                    .reduce((acc, v) => acc + parseFloat(v.replace(",", ".")), 0)
                    .toFixed(2)
                    .replace(".", ",");

                const row = [
                    cfg.label,
                    categoria,
                    pc.subcategoria ?? pc.categoria,
                    ...valores,
                    total,
                ];
                rows.push(row.map((c) => `"${c}"`).join(sep));
            }
        }
    }

    // Linha em branco + resumo
    rows.push("");
    rows.push(`"Resumo ${ano}"`);
    rows.push(`"Total Receitas"${sep}${sep}"${stats.receitas.toFixed(2).replace(".", ",")}"`);
    rows.push(`"Total Saídas"${sep}${sep}"${stats.saidas.toFixed(2).replace(".", ",")}"`);
    rows.push(`"Resultado Projetado"${sep}${sep}"${stats.resultado.toFixed(2).replace(".", ",")}"`);

    const blob = new Blob([BOM + rows.join("\n")], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metas-orcamentarias-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Célula editável ───────────────────────────────────────────────────────────
interface MetaCellProps {
    plano_conta_id: number;
    mes: number;
    ano: number;
    /** "Categoria / Subcategoria" — compõe o aria-label da célula. */
    linha: string;
    currentValue: string;
    activeCell: ActiveCell | null;
    onActivate: (cell: ActiveCell) => void;
    onChange: (value: string) => void;
    onSave: (plano_conta_id: number, mes: number) => void;
    onCancel: () => void;
}

function MetaCell({
                      plano_conta_id,
                      mes,
                      ano,
                      linha,
                      currentValue,
                      activeCell,
                      onActivate,
                      onChange,
                      onSave,
                      onCancel,
                  }: MetaCellProps) {
    const saldos = useSaldosVisiveis();
    const inputRef = useRef<HTMLInputElement>(null);
    const isActive =
        activeCell?.plano_conta_id === plano_conta_id && activeCell?.mes === mes;

    useEffect(() => {
        if (isActive) inputRef.current?.select();
    }, [isActive]);

    if (isActive) {
        return (
            <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Meta de ${linha} em ${MESES_EXTENSO[mes - 1]} de ${ano} (R$). Deixe vazio para ficar sem meta`}
                value={activeCell.value}
                onChange={(e) => onChange(formatValorBrInput(e.target.value))}
                onBlur={() => onSave(plano_conta_id, mes)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        onSave(plano_conta_id, mes);
                    }
                    if (e.key === "Escape") {
                        e.preventDefault();
                        onCancel();
                    }
                }}
                className="w-full text-right bg-primary/15 border border-primary/50 rounded px-1.5 py-0.5 text-xs text-white outline-none font-mono tabular-nums"
                placeholder="0,00"
            />
        );
    }

    const hasValue = valorMeta(currentValue) > 0;
    const valorFalado = hasValue
        ? (saldos.visivel ? formatCurrency(valorMeta(currentValue)) : "valor oculto")
        : null;
    return (
        <button
            type="button"
            aria-label={rotuloCelulaMeta(linha, mes, ano, valorFalado)}
            onClick={() =>
                onActivate({
                    plano_conta_id,
                    mes,
                    value: hasValue ? apiValorToValorBr(currentValue) : "",
                })
            }
            className={`w-full text-right text-xs rounded px-1 py-0.5 transition-colors hover:bg-white/10 font-mono ${
                hasValue && saldos.visivel ? "text-white" : "text-muted-foreground/30"
            }`}
        >
            {hasValue ? saldos.texto(compactBrl(currentValue)) : "—"}
        </button>
    );
}

// ─── Página ────────────────────────────────────────────────────────────────────
export default function Metas() {
    const dinheiro = useDinheiro();
    const saldos = useSaldosVisiveis();
    const queryClient = useQueryClient();
    const {toast} = useToast();

    const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
    const [collapsedTipos, setCollapsedTipos] = useState<Set<string>>(new Set());

    // ── Queries ────────────────────────────────────────────────────────────────
    const {data: planoContas = [], isLoading: loadingPC} = useQuery<PlanoConta[]>({
        queryKey: tenantQueryKey("plano-contas"),
        queryFn: () => fetchApiData<PlanoConta[]>("/plano-contas"),
        staleTime: 5 * 60 * 1000,
    });

    // ── Filtros e ano na URL ───────────────────────────────────────────────────
    const definicoes: DefinicaoFiltro[] = useMemo(() => [
        {
            chave: "plano_conta_id",
            rotulo: "Plano de contas",
            tipo: "combobox",
            placeholder: "Todas as categorias",
            // Mesmas linhas da planilha: só planos ativos, na ordem tipo → categoria → subcategoria.
            opcoes: planoContas
                .filter((p) => p.ativo && TIPO_ORDER.includes(p.tipo))
                .sort((a, b) =>
                    TIPO_ORDER.indexOf(a.tipo) - TIPO_ORDER.indexOf(b.tipo)
                    || collator.compare(a.categoria, b.categoria)
                    || collator.compare(a.subcategoria ?? "", b.subcategoria ?? ""))
                .map((p) => ({
                    valor: String(p.id),
                    rotulo: p.subcategoria ? `${p.categoria} / ${p.subcategoria}` : p.categoria,
                    grupo: `${TIPO_ROTULO_CURTO[p.tipo] ?? p.tipo} · ${p.categoria}`,
                })),
        },
        {chave: "mes", rotulo: "Mês", tipo: "multi", opcoes: OPCOES_MES},
    ], [planoContas]);

    const filtros = useFiltrosNaUrl(definicoes);
    const ano = anoDaUrl(filtros.ler("ano"));
    const anosOpcoes = YEARS.includes(ano) ? YEARS : [...YEARS, ano].sort((a, b) => b - a);
    const setAno = (novo: number) => filtros.atualizar({ano: String(novo)});

    const filtroPlano = filtros.valores.plano_conta_id ?? "";
    const filtroMes = filtros.valores.mes;
    const mesesVisiveis = useMemo(() => {
        const escolhidos = separarMulti(filtroMes)
            .map(Number)
            .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
            .sort((a, b) => a - b);
        return escolhidos.length > 0 ? escolhidos : TODOS_MESES;
    }, [filtroMes]);
    const totalColunas = mesesVisiveis.length + 2;

    // Reset active cell when year changes
    useEffect(() => {
        setActiveCell(null);
    }, [ano]);

    const {data: metas = [], isLoading: loadingMetas} = useQuery<MetaRow[]>({
        queryKey: tenantQueryKey("metas", ano),
        queryFn: () => fetchApiData<MetaRow[]>(`/metas?ano=${ano}`),
    });

    // ── Mutation com Optimistic Update ────────────────────────────────────────
    const saveMeta = useMutation({
        mutationFn: (payload: {
            plano_conta_id: number;
            ano: number;
            mes: number;
            valor_projetado: string;
        }) =>
            fetchApiData<MetaRow>("/metas", {
                method: "POST",
                body: JSON.stringify(payload),
            }),

        // Chave do cache = a da query (com empresa) e do ano do payload — o "Desfazer"
        // pode chegar depois de o usuário trocar de ano.
        onMutate: async (payload) => {
            const key = tenantQueryKey("metas", payload.ano);
            await queryClient.cancelQueries({queryKey: key});
            const previous = queryClient.getQueryData<MetaRow[]>(key);

            queryClient.setQueryData<MetaRow[]>(key, (old = []) => {
                const exists = old.find(
                    (m) => m.plano_conta_id === payload.plano_conta_id && m.mes === payload.mes,
                );
                if (exists) {
                    return old.map((m) =>
                        m.plano_conta_id === payload.plano_conta_id && m.mes === payload.mes
                            ? {...m, valor_projetado: payload.valor_projetado}
                            : m,
                    );
                }
                return [
                    ...old,
                    {
                        id: -(Date.now()),
                        plano_conta_id: payload.plano_conta_id,
                        ano: payload.ano,
                        mes: payload.mes,
                        valor_projetado: payload.valor_projetado,
                    },
                ];
            });

            return {previous};
        },

        onError: (_e, payload, context) => {
            if (context?.previous) {
                queryClient.setQueryData(tenantQueryKey("metas", payload.ano), context.previous);
            }
            toast({
                variant: "destructive",
                title: "Erro ao salvar meta",
                description: "Não foi possível guardar o valor. Tente novamente.",
            });
        },

        onSettled: () => {
            invalidateRelated(queryClient, "metas"); // ← ALTERADO: era invalidateQueries(["metas", ano])
        },
    });

    // ── Lookup: "plano_conta_id-mes" -> valor_projetado ────────────────────────
    const metasMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of metas) {
            map.set(`${m.plano_conta_id}-${m.mes}`, m.valor_projetado);
        }
        return map;
    }, [metas]);

    // ── Agrupamento: tipo -> categoria -> PlanoConta[] ──────────────────────────
    const grouped = useMemo(() => {
        const result = new Map<string, Map<string, PlanoConta[]>>();
        TIPO_ORDER.forEach((t) => result.set(t, new Map()));

        for (const pc of planoContas) {
            if (!pc.ativo) continue;
            const catMap = result.get(pc.tipo);
            if (!catMap) continue;
            const arr = catMap.get(pc.categoria);
            if (arr) arr.push(pc);
            else catMap.set(pc.categoria, [pc]);
        }
        return result;
    }, [planoContas]);

    // ── Planilha filtrada pelo plano de contas (no navegador) ─────────────────
    const groupedVisivel = useMemo(() => {
        if (!filtroPlano) return grouped;
        const result = new Map<string, Map<string, PlanoConta[]>>();
        for (const [tipo, catMap] of grouped) {
            const novo = new Map<string, PlanoConta[]>();
            for (const [categoria, items] of catMap) {
                const filtrados = items.filter((pc) => String(pc.id) === filtroPlano);
                if (filtrados.length > 0) novo.set(categoria, filtrados);
            }
            result.set(tipo, novo);
        }
        return result;
    }, [grouped, filtroPlano]);

    const linhasVisiveis = useMemo(() => {
        let n = 0;
        for (const catMap of groupedVisivel.values()) {
            for (const items of catMap.values()) n += items.length;
        }
        return n;
    }, [groupedVisivel]);

    // ── Stats ──────────────────────────────────────────────────────────────────
    // Cards seguem o filtro de mês; o CSV exporta o ano inteiro, então o resumo dele também.
    const stats = useMemo(
        () => resumirCadastroMetas(metas, planoContas, mesesVisiveis),
        [metas, planoContas, mesesVisiveis],
    );
    const statsAno = useMemo(
        () => resumirCadastroMetas(metas, planoContas, TODOS_MESES),
        [metas, planoContas],
    );
    const periodo = rotuloPeriodoMetas(mesesVisiveis, ano);

    // ── Handlers de célula ─────────────────────────────────────────────────────
    // Com os valores ocultos não abre o editor (ele mostraria o número): avisa e oferece mostrar.
    const handleActivate = (cell: ActiveCell) => {
        if (!saldos.visivel) {
            toast({
                title: "Valores ocultos",
                description: "Mostre os valores para editar as metas.",
                action: (
                    <ToastAction altText="Mostrar valores" onClick={saldos.alternar}>
                        Mostrar valores
                    </ToastAction>
                ),
            });
            return;
        }
        setActiveCell(cell);
    };

    const handleChange = (value: string) => {
        if (!activeCell) return;
        setActiveCell({...activeCell, value});
    };

    // Célula vazia (ou 0,00) = sem meta. Se havia valor, a remoção é avisada com "Desfazer".
    const handleSave = (plano_conta_id: number, mes: number) => {
        if (!activeCell) return;
        setActiveCell(null);

        const anterior = metasMap.get(`${plano_conta_id}-${mes}`);
        const acao = acaoAoSalvarCelula(anterior, activeCell.value);
        if (acao === "nada") return;

        const anoCelula = ano;
        saveMeta.mutate({plano_conta_id, ano: anoCelula, mes, valor_projetado: entradaMetaParaApi(activeCell.value)});

        if (acao === "remover" && anterior) {
            const pc = planoContas.find((p) => p.id === plano_conta_id);
            const onde = `${pc ? nomeLinha(pc) : "Categoria"} · ${MESES_EXTENSO[mes - 1]} de ${anoCelula}`;
            toast({
                title: "Meta removida",
                duration: 10000,
                description: `${onde} ficou sem meta (era ${dinheiro(valorMeta(anterior))}).`,
                action: (
                    <ToastAction
                        altText={`Desfazer: voltar a meta de ${onde}`}
                        onClick={() => saveMeta.mutate({plano_conta_id, ano: anoCelula, mes, valor_projetado: anterior})}
                    >
                        Desfazer
                    </ToastAction>
                ),
            });
        }
    };

    const handleCancel = () => setActiveCell(null);

    const toggleTipo = (tipo: string) =>
        setCollapsedTipos((prev) => {
            const next = new Set(prev);
            if (next.has(tipo)) next.delete(tipo);
            else next.add(tipo);
            return next;
        });

    // ── Total anual de uma linha ───────────────────────────────────────────────
    function rowTotal(pcId: number): number {
        let sum = 0;
        for (let m = 1; m <= 12; m++) {
            sum += parseFloat(metasMap.get(`${pcId}-${m}`) ?? "0") || 0;
        }
        return sum;
    }

    const isLoading = loadingPC || loadingMetas;
    const canExport = !isLoading && metas.length > 0;
    const anuncio = isLoading
        ? ""
        : `${linhasVisiveis} ${linhasVisiveis === 1 ? "categoria exibida" : "categorias exibidas"} em ${ano}`
        + (mesesVisiveis.length < 12 ? `, ${mesesVisiveis.length} ${mesesVisiveis.length === 1 ? "mês" : "meses"}` : "");

    return (
        <div className="space-y-6">
            <PageHeader
                title="Metas Financeiras"
                description="Planejamento orçamentário por categoria — clique numa célula para editar"
                actions={
                    <div className="flex gap-3">
                        {/* Mesma preferência global de "Ocultar saldos" do menu do usuário. */}
                        <button
                            type="button"
                            onClick={saldos.alternar}
                            title="Vale para todo o sistema (mesma opção do menu do usuário)"
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
                        >
                            {saldos.visivel
                                ? <EyeOff className="w-4 h-4" aria-hidden="true"/>
                                : <Eye className="w-4 h-4" aria-hidden="true"/>}
                            {saldos.visivel ? "Ocultar valores" : "Mostrar valores"}
                        </button>
                        <button
                            type="button"
                            onClick={() => exportarCSV(ano, grouped, metasMap, statsAno)}
                            disabled={!canExport}
                            title={
                                isLoading
                                    ? "Carregando…"
                                    : metas.length === 0
                                        ? "Nenhuma meta cadastrada para exportar"
                                        : `Exportar metas de ${ano} em CSV`
                            }
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Download className="w-4 h-4" aria-hidden="true"/> Exportar
                        </button>
                    </div>
                }
            />

            {/* ── Barra: ano + filtros (grupo da esquerda) ── */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 bg-black/10">
                    <label htmlFor="metas-ano" className="sr-only">Ano das metas</label>
                    <SelectCampo
                        id="metas-ano"
                        value={String(ano)}
                        onChange={(v) => setAno(Number(v))}
                        className="w-[8.5em]"
                        opcoes={anosOpcoes.map((y) => ({value: String(y), label: String(y)}))}
                    />
                    <FiltrosPopover
                        definicoes={definicoes}
                        valores={filtros.valores}
                        contagem={filtros.contagem}
                        onAplicar={filtros.aplicar}
                    />
                </div>
                <FiltrosAtivos
                    chips={filtros.chips}
                    onRemover={filtros.remover}
                    onLimparTodos={filtros.limpar}
                    anuncio={anuncio}
                    className="border-b-0 border-t"
                />
            </div>

            {/* ── KPI Cards (respeitam o filtro de mês) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-panel rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-5 h-5 text-teal-400" aria-hidden="true"/>
                        <p className="text-xs text-muted-foreground">Meta Receita · {periodo}</p>
                    </div>
                    <p className="text-lg font-bold text-teal-400">
                        {isLoading ? "…" : dinheiro(stats.receitas)}
                    </p>
                </div>
                <div className="glass-panel rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-5 h-5 text-destructive" aria-hidden="true"/>
                        <p className="text-xs text-muted-foreground">Despesas + Custos · {periodo}</p>
                    </div>
                    <p className="text-lg font-bold text-destructive">
                        {isLoading ? "…" : dinheiro(stats.saidas)}
                    </p>
                </div>
                <div className="glass-panel rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp
                            aria-hidden="true"
                            className={`w-5 h-5 ${!saldos.visivel ? "text-muted-foreground" : stats.resultado >= 0 ? "text-success" : "text-destructive"}`}/>
                        <p className="text-xs text-muted-foreground">Resultado Projetado · {periodo}</p>
                    </div>
                    <p className={`text-lg font-bold ${!saldos.visivel ? "text-white" : stats.resultado >= 0 ? "text-success" : "text-destructive"}`}>
                        {isLoading ? "…" : dinheiro(stats.resultado)}
                    </p>
                </div>
                <div className="glass-panel rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-5 h-5 text-orange-400" aria-hidden="true"/>
                        <p className="text-xs text-muted-foreground">Categorias com Meta · {periodo}</p>
                    </div>
                    <p className="text-lg font-bold text-orange-400">
                        {isLoading ? "…" : `${stats.categoriasComMeta} / ${stats.categoriasAtivas}`}
                    </p>
                </div>
            </div>

            {/* ── Tabela ── */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-bold text-white">
                        Planilha de Metas Orçamentárias — {ano}
                    </h3>
                    <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                        {saveMeta.isPending && (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true"/>
                                Salvando…
                            </>
                        )}
                    </div>
                </div>

                {isLoading ? (
                    <TableSkeleton rows={8} columns={6}/>
                ) : planoContas.filter((p) => p.ativo).length === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Target className="text-muted-foreground/40"/>
                            </EmptyMedia>
                            <EmptyTitle className="text-white">Nenhuma categoria ativa</EmptyTitle>
                            <EmptyDescription>
                                Cadastre categorias no Plano de Contas para definir metas orçamentárias.
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : linhasVisiveis === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Target className="text-muted-foreground/40"/>
                            </EmptyMedia>
                            <EmptyTitle className="text-white">Nenhum resultado para os filtros aplicados.</EmptyTitle>
                            <EmptyDescription>
                                Ajuste ou limpe os filtros para ver as metas do plano de contas.
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                            <tr className="bg-white/5 border-b border-white/5">
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-card/95 backdrop-blur-sm min-w-[200px] z-10">
                                    Categoria / Subcategoria
                                </th>
                                {mesesVisiveis.map((mes) => (
                                    <th
                                        key={mes}
                                        className="px-2 py-3 text-right font-medium text-muted-foreground min-w-[90px] text-xs"
                                    >
                                        <abbr title={MESES_EXTENSO[mes - 1]} className="no-underline">
                                            {MESES[mes - 1]}
                                        </abbr>
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right font-semibold text-white min-w-[110px] text-xs">
                                    Total Ano
                                </th>
                            </tr>
                            </thead>
                            <tbody>
                            {TIPO_ORDER.map((tipo) => {
                                const catMap = groupedVisivel.get(tipo);
                                if (!catMap || catMap.size === 0) return null;
                                const cfg = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.despesa;
                                const isCollapsed = collapsedTipos.has(tipo);

                                return (
                                    <Fragment key={`tipo-${tipo}`}>
                                        {/* ── Cabeçalho de Tipo ── */}
                                        <tr className={`${cfg.bg} border-y ${cfg.border} select-none`}>
                                            <td
                                                className={`px-4 py-2.5 font-bold ${cfg.color} sticky left-0 bg-inherit z-10`}
                                                colSpan={totalColunas}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => toggleTipo(tipo)}
                                                    aria-expanded={!isCollapsed}
                                                    className="flex w-full items-center gap-2 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                                >
                                                    {isCollapsed ? (
                                                        <ChevronRight className="w-4 h-4" aria-hidden="true"/>
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4" aria-hidden="true"/>
                                                    )}
                                                    {cfg.label}
                                                </button>
                                            </td>
                                        </tr>

                                        {!isCollapsed &&
                                            Array.from(catMap.entries()).map(([categoria, items]) => (
                                                <Fragment key={`cat-${tipo}-${categoria}`}>
                                                    {/* ── Cabeçalho de Categoria ── */}
                                                    <tr className="bg-white/[0.03] border-b border-white/5">
                                                        <td
                                                            className="px-4 py-2 text-xs font-semibold text-white/70 uppercase tracking-wide sticky left-0 bg-card/90 z-10 pl-8"
                                                            colSpan={totalColunas}
                                                        >
                                                            {categoria}
                                                        </td>
                                                    </tr>

                                                    {/* ── Linhas de Subcategoria (folhas editáveis) ── */}
                                                    {items.map((pc) => {
                                                        const total = rowTotal(pc.id);
                                                        return (
                                                            <tr
                                                                key={`pc-${pc.id}`}
                                                                className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                                                            >
                                                                <th scope="row" className="px-4 py-2.5 sticky left-0 bg-card/80 backdrop-blur-sm z-10 pl-12 text-left font-normal">
                                    <span className="text-sm text-white/80 capitalize">
                                      {pc.subcategoria ?? pc.categoria}
                                    </span>
                                                                </th>
                                                                {mesesVisiveis.map((mes) => (
                                                                    <td key={mes} className="px-2 py-2">
                                                                        <MetaCell
                                                                            plano_conta_id={pc.id}
                                                                            mes={mes}
                                                                            ano={ano}
                                                                            linha={nomeLinha(pc)}
                                                                            currentValue={metasMap.get(`${pc.id}-${mes}`) ?? ""}
                                                                            activeCell={activeCell}
                                                                            onActivate={handleActivate}
                                                                            onChange={handleChange}
                                                                            onSave={handleSave}
                                                                            onCancel={handleCancel}
                                                                        />
                                                                    </td>
                                                                ))}
                                                                <td className="px-4 py-2 text-right">
                                    <span
                                        className={`text-xs font-semibold ${total > 0 ? cfg.color : "text-muted-foreground/40"}`}
                                    >
                                      {total > 0 ? dinheiro(total) : "—"}
                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </Fragment>
                                            ))}
                                    </Fragment>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
                Clique em qualquer célula para definir ou editar o valor projetado.
                Pressione <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-mono">Enter</kbd> para
                confirmar
                ou <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-mono">Esc</kbd> para cancelar.
                Célula vazia fica sem meta (dá para desfazer no aviso).
            </p>
        </div>
    );
}