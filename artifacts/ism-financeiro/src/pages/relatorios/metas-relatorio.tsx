import {tenantQueryKey} from "@/lib/tenant-query";
import {Fragment, useMemo, type ReactNode} from "react";
import {PageHeader} from "@/components/shared/page-header";
import {useParametrosUrl} from "@/components/shared/filtros";
import {
    Download,
    FileText,
    TrendingUp,
    TrendingDown,
    Scale,
    Loader2,
    AlertCircle,
} from "lucide-react";
import {useDinheiro, useSaldosVisiveis} from "@/components/conta/saldos-visiveis";
import {SelectCampo} from "@/components/ui/select-campo";
import {useQuery} from "@tanstack/react-query";
import {fetchApiData} from "@/lib/api-config";
import {exportToExcel, exportToPDF, fmtBRL, type ExportColumn} from "@/lib/export";
import {FiltroPeriodoMetas} from "@/components/relatorios/filtro-periodo-metas";
import {
    descricaoDaSelecao,
    lerSelecaoDaUrl,
    MESES_CURTOS,
    mesesDaSelecao,
    PARAM_PERIODOS,
    PARAM_VISAO,
    periodosSelecionados,
    selecaoParaUrl,
    sufixoArquivoDaSelecao,
} from "@/lib/periodo-metas";
import {
    atingimentoPct,
    avaliarMeta,
    caminhoCategoria,
    chaveDaLinha,
    formatarPct,
    normalizarTipo,
    reais,
    resumirMetas,
    ROTULO_TIPO,
    toCents,
    type BlocoMetas,
    type GrupoMeta,
    type LinhaCategoriaMeta,
    type TipoCategoria,
    type ValoresMeta,
} from "@/lib/metas-resumo";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 6}, (_, i) => CURRENT_YEAR + 2 - i);

/** Acima disso o PDF (A4 paisagem) leva só os totais; o XLSX sempre traz o detalhe por período. */
const MAX_PERIODOS_NO_PDF = 4;

type MetaItem = {
    plano_conta_id: number;
    categoria: string | null;
    subcategoria?: string | null;
    /** Tipo da conta do plano: receita, custo ou despesa. */
    tipo?: TipoCategoria | null;
    mes: number;
    valor_projetado: number;
    valor_realizado: number;
    juros: number;
    atingimento_pct: number | null;
};

const COR_RECEITA = "#2DD4BF";
const COR_DESPESA = "#FB7185";

const COR_AVALIACAO = {bom: "text-success", alerta: "text-amber-300", neutro: "text-white"} as const;

const TH = "px-4 py-3 text-right text-xs text-muted-foreground font-medium whitespace-nowrap";
const TD = "px-4 py-3 text-right whitespace-nowrap";
const INICIO_GRUPO = "border-l border-white/10";

const CustomTooltip = ({active, payload, label}: any) => {
    const dinheiro = useDinheiro();
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
            <p className="text-white font-medium mb-2">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} style={{color: entry.color}} className="text-sm">
                    {entry.name}: {dinheiro(entry.value)}
                </p>
            ))}
        </div>
    );
};

/** Células Orçado | Realizado | % de um grupo da tabela. */
function CelulasValores({v, grupo, dinheiro, inicioGrupo, destaque, semMeta}: {
    v: ValoresMeta;
    grupo: GrupoMeta;
    dinheiro: (n: number) => string;
    inicioGrupo?: boolean;
    destaque?: boolean;
    /** Linha sem orçado: orçado e % ficam "—". */
    semMeta?: boolean;
}) {
    const {visivel, texto} = useSaldosVisiveis();
    const peso = destaque ? "font-semibold" : "";
    const pct = semMeta ? null : atingimentoPct(v);
    // Com saldos ocultos o % some, e a cor também (ela diz se passou da meta).
    const cor = visivel ? COR_AVALIACAO[avaliarMeta(grupo, pct)] : "text-white";
    return (
        <>
            <td className={`${TD} text-white/80 ${peso} ${inicioGrupo ? INICIO_GRUPO : ""}`}>
                {semMeta ? <span className="text-muted-foreground">—</span> : dinheiro(reais(v.orcadoCents))}
            </td>
            <td className={`${TD} text-teal-300 ${peso}`}>{dinheiro(reais(v.realizadoCents))}</td>
            <td className={`${TD} ${pct == null ? "text-muted-foreground" : cor} font-semibold`}>
                {pct == null ? "—" : texto(formatarPct(pct, 1))}
            </td>
        </>
    );
}

/** Nome da categoria; com tipo/caminho quando há outra de nome parecido (ou quando pedido). */
function NomeCategoria({linha, mostrarTipo}: { linha: LinhaCategoriaMeta; mostrarTipo?: boolean }) {
    const tag = mostrarTipo || linha.nomeParecido || linha.tipo === "custo";
    return (
        <div className="min-w-0">
            <div className="flex items-center gap-2">
                <span className="text-white font-medium">{linha.categoria}</span>
                {tag && (
                    <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                            linha.grupo === "receitas"
                                ? "border-teal-400/30 text-teal-300"
                                : "border-rose-400/30 text-rose-300"
                        }`}
                    >
                        {ROTULO_TIPO[linha.tipo]}
                    </span>
                )}
            </div>
            {linha.nomeParecido && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{caminhoCategoria(linha)}</p>
            )}
        </div>
    );
}

/** Card de um grupo: orçado, realizado e % (só sobre as categorias com meta). */
function CardGrupo({titulo, icone, bloco, rotuloPct, dinheiro}: {
    titulo: string;
    icone: ReactNode;
    bloco: BlocoMetas;
    rotuloPct: string;
    dinheiro: (n: number) => string;
}) {
    const {visivel, texto} = useSaldosVisiveis();
    const pct = atingimentoPct(bloco.total);
    // Com saldos ocultos: sem %, sem barra e sem cor/aviso de "acima da meta".
    const avaliacao = visivel ? avaliarMeta(bloco.grupo, pct) : "neutro";
    const passou = visivel && pct != null && pct > 100;
    return (
        <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
                {icone}
                <p className="text-sm font-semibold text-white">{titulo}</p>
            </div>
            <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Orçado</dt>
                    <dd className="text-white/90 font-medium">{dinheiro(reais(bloco.total.orcadoCents))}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Realizado</dt>
                    <dd className="text-teal-300 font-medium">{dinheiro(reais(bloco.total.realizadoCents))}</dd>
                </div>
            </dl>
            <div className="mt-3 flex items-baseline justify-between gap-3">
                <p className={`text-2xl font-bold ${COR_AVALIACAO[avaliacao]}`}>
                    {pct == null ? "—" : texto(formatarPct(pct))}
                </p>
                <p className="text-xs text-muted-foreground">{rotuloPct}</p>
            </div>
            <div
                className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"
                role="progressbar"
                aria-label={`${titulo}: realizado sobre o orçado`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct == null || !visivel ? undefined : Math.min(100, Math.round(pct))}
            >
                <div
                    className={`h-full rounded-full ${
                        avaliacao === "alerta" ? "bg-amber-400" : avaliacao === "bom" ? "bg-success" : "bg-primary"
                    }`}
                    style={{width: `${pct == null || !visivel ? 0 : Math.min(100, Math.max(0, pct))}%`}}
                />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
                {pct == null
                    ? "Sem orçado no período"
                    : passou
                        ? bloco.grupo === "receitas" ? "Acima da meta" : "Acima do orçado"
                        : "Realizado ÷ orçado"}
            </p>
            {bloco.semMeta.realizadoCents !== 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                    + {dinheiro(reais(bloco.semMeta.realizadoCents))} realizado em categorias sem meta
                </p>
            )}
        </div>
    );
}

export default function MetasRelatorio() {
    const dinheiro = useDinheiro();
    const {visivel: saldosVisiveis} = useSaldosVisiveis();
    // Ano na URL (?ano=2026) para sobreviver ao F5 e ao compartilhar o link.
    const {ler, atualizar} = useParametrosUrl();
    const anoUrl = ler("ano");
    const ano = /^\d{4}$/.test(anoUrl) ? Number(anoUrl) : CURRENT_YEAR;
    const anosOpcoes = useMemo(
        () => (YEARS.includes(ano) ? YEARS : [...YEARS, ano].sort((a, b) => b - a)),
        [ano],
    );

    // Recorte de período (?visao=trimestre&periodos=2,3), feito no cliente sobre o ano carregado.
    const mesAtual = new Date().getMonth() + 1;
    const visaoUrl = ler(PARAM_VISAO);
    const periodosUrl = ler(PARAM_PERIODOS);
    const selecao = useMemo(
        () => lerSelecaoDaUrl(visaoUrl, periodosUrl, mesAtual),
        [visaoUrl, periodosUrl, mesAtual],
    );
    const mesesFiltro = useMemo(() => mesesDaSelecao(selecao), [selecao]);
    const periodos = useMemo(() => periodosSelecionados(selecao), [selecao]);
    const descricaoPeriodo = descricaoDaSelecao(selecao, ano);
    // Colunas por período só quando há mais de um período marcado.
    const porPeriodo = periodos.length > 1;

    const {data: metasAno = [], isLoading, isError} = useQuery<MetaItem[]>({
        queryKey: tenantQueryKey("relatorio-metas", ano),
        queryFn: () => fetchApiData<MetaItem[]>(`/relatorios/metas?ano=${ano}`),
    });
    const metas = useMemo(
        () => metasAno.filter((m) => mesesFiltro.includes(m.mes)),
        [metasAno, mesesFiltro],
    );

    const resumo = useMemo(() => resumirMetas(metas, periodos), [metas, periodos]);
    const {receitas, despesas, semMeta, resultado} = resumo;

    // Gráfico: orçado × realizado das categorias com meta, receitas e despesas lado a lado.
    const chartData = useMemo(() => {
        const comMeta = new Set([...receitas.linhas, ...despesas.linhas].map((l) => l.chave));
        const porMes = new Map<number, { ro: number; rr: number; do: number; dr: number }>();
        for (const item of metas) {
            if (!comMeta.has(chaveDaLinha(item))) continue;
            const acc = porMes.get(item.mes) ?? {ro: 0, rr: 0, do: 0, dr: 0};
            if (normalizarTipo(item.tipo) === "receita") {
                acc.ro += toCents(item.valor_projetado);
                acc.rr += toCents(item.valor_realizado);
            } else {
                acc.do += toCents(item.valor_projetado);
                acc.dr += toCents(item.valor_realizado);
            }
            porMes.set(item.mes, acc);
        }
        return mesesFiltro.map((m) => {
            const v = porMes.get(m) ?? {ro: 0, rr: 0, do: 0, dr: 0};
            return {
                mes: MESES_CURTOS[m - 1],
                receitaOrcado: reais(v.ro),
                receitaRealizado: reais(v.rr),
                despesaOrcado: reais(v.do),
                despesaRealizado: reais(v.dr),
            };
        });
    }, [metas, mesesFiltro, receitas.linhas, despesas.linhas]);

    const totalJuros = reais(resultado.jurosCents);
    const hasChartData = receitas.total.orcadoCents > 0 || despesas.total.orcadoCents > 0;
    const temLinhas = receitas.linhas.length + despesas.linhas.length + semMeta.length > 0;
    const resultadoOrcado = reais(resultado.orcadoCents);
    const resultadoRealizado = reais(resultado.realizadoCents);
    const diferencaResultado = reais(resultado.realizadoCents - resultado.orcadoCents);

    function colunasExportacao(comPeriodos: boolean): ExportColumn[] {
        const cols: ExportColumn[] = [
            {header: "Categoria", key: "categoria", width: 28},
            {header: "Tipo", key: "tipo", width: 18},
        ];
        if (comPeriodos) {
            for (const p of periodos) {
                cols.push(
                    {header: `${p.rotuloCurto} Orçado`, key: `p${p.indice}_orcado`, width: 16, tipo: "moeda"},
                    {header: `${p.rotuloCurto} Realizado`, key: `p${p.indice}_realizado`, width: 16, tipo: "moeda"},
                    {header: `${p.rotuloCurto} %`, key: `p${p.indice}_pct`, width: 10},
                );
            }
        }
        const prefixo = comPeriodos ? "Total " : "";
        cols.push(
            {header: `${prefixo}Orçado`, key: "orcado", width: 16, tipo: "moeda"},
            {header: `${prefixo}Realizado`, key: "realizado", width: 16, tipo: "moeda"},
            {header: "%", key: "pct", width: 12},
            {header: "Juros (fora)", key: "juros", width: 14, tipo: "moeda"},
        );
        return cols;
    }

    function linhaExportacao(
        categoria: string,
        tipo: string,
        porP: ValoresMeta[],
        total: ValoresMeta,
        comPct: boolean,
    ): Record<string, unknown> {
        const row: Record<string, unknown> = {
            categoria,
            tipo,
            orcado: reais(total.orcadoCents),
            realizado: reais(total.realizadoCents),
            pct: comPct ? formatarPct(atingimentoPct(total)) : "—",
            juros: reais(total.jurosCents),
        };
        periodos.forEach((p, i) => {
            row[`p${p.indice}_orcado`] = reais(porP[i].orcadoCents);
            row[`p${p.indice}_realizado`] = reais(porP[i].realizadoCents);
            row[`p${p.indice}_pct`] = comPct ? formatarPct(atingimentoPct(porP[i])) : "—";
        });
        return row;
    }

    function buildMetasExportRows(): Record<string, unknown>[] {
        const rows: Record<string, unknown>[] = [];
        for (const bloco of [receitas, despesas]) {
            if (bloco.linhas.length === 0) continue;
            for (const l of bloco.linhas) {
                rows.push(linhaExportacao(l.categoria, ROTULO_TIPO[l.tipo], l.porPeriodo, l.total, true));
            }
            const nome = bloco.grupo === "receitas" ? "Subtotal receitas" : "Subtotal despesas";
            rows.push(linhaExportacao(nome, "", bloco.totalPorPeriodo, bloco.total, true));
        }
        for (const l of semMeta) {
            rows.push(linhaExportacao(l.categoria, `${ROTULO_TIPO[l.tipo]} · sem meta`, l.porPeriodo, l.total, false));
        }
        rows.push(
            linhaExportacao("RESULTADO (receitas − despesas)", "", resumo.resultadoPorPeriodo, resultado, false),
        );
        return rows;
    }

    const sufixoArquivo = sufixoArquivoDaSelecao(selecao);
    const exportFilename = sufixoArquivo ? `Metas_${ano}_${sufixoArquivo}` : `Metas_${ano}`;

    function exportarPdf() {
        const detalhar = porPeriodo && periodos.length <= MAX_PERIODOS_NO_PDF;
        const nota = porPeriodo && !detalhar ? " | Detalhe por período no XLSX" : "";
        const resumoGrupo = (nome: string, b: BlocoMetas) =>
            `${nome}: orçado ${fmtBRL(reais(b.total.orcadoCents))}, realizado ${fmtBRL(reais(b.total.realizadoCents))}` +
            ` (${formatarPct(atingimentoPct(b.total))})`;
        exportToPDF(exportFilename, buildMetasExportRows(), colunasExportacao(detalhar), {
            title: `Relatório de Metas — ${descricaoPeriodo}`,
            subtitle:
                `${resumoGrupo("Receitas", receitas)} | ${resumoGrupo("Despesas", despesas)}` +
                ` | Resultado: orçado ${fmtBRL(resultadoOrcado)}, realizado ${fmtBRL(resultadoRealizado)}` +
                ` | Juros (fora): ${fmtBRL(totalJuros)}${nota}`,
            orientation: "landscape",
            destacarUltimaLinha: true, // linha RESULTADO
        });
    }

    const nColunas = 1 + (porPeriodo ? periodos.length * 3 : 0) + 3 + 1;

    function cabecalhoSecao(titulo: string, detalhe: string, cor: string) {
        return (
            <tr className="bg-white/[0.03]">
                <td colSpan={nColunas} className="px-4 py-2">
                    <span className={`text-xs font-bold uppercase tracking-wide ${cor}`}>{titulo}</span>
                    <span className="text-xs text-muted-foreground ml-2">{detalhe}</span>
                </td>
            </tr>
        );
    }

    function linhaCategoria(linha: LinhaCategoriaMeta, opcoes: { semMeta?: boolean } = {}) {
        return (
            <tr key={linha.chave} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 whitespace-nowrap">
                    <NomeCategoria linha={linha} mostrarTipo={opcoes.semMeta}/>
                </td>
                {porPeriodo && linha.porPeriodo.map((v, i) => (
                    <CelulasValores key={periodos[i].indice} v={v} grupo={linha.grupo} dinheiro={dinheiro}
                                    inicioGrupo semMeta={opcoes.semMeta}/>
                ))}
                <CelulasValores v={linha.total} grupo={linha.grupo} dinheiro={dinheiro} inicioGrupo={porPeriodo}
                                destaque={porPeriodo} semMeta={opcoes.semMeta}/>
                <td className={`${TD} text-amber-300/80 ${porPeriodo ? INICIO_GRUPO : ""}`}>
                    {dinheiro(reais(linha.total.jurosCents))}
                </td>
            </tr>
        );
    }

    function secaoGrupo(bloco: BlocoMetas, titulo: string, detalhe: string, cor: string) {
        return (
            <>
                {cabecalhoSecao(titulo, detalhe, cor)}
                {bloco.linhas.length === 0 ? (
                    <tr>
                        <td colSpan={nColunas} className="px-4 py-3 text-xs text-muted-foreground">
                            Nenhuma categoria com meta no período.
                        </td>
                    </tr>
                ) : (
                    <>
                        {bloco.linhas.map((l) => linhaCategoria(l))}
                        <tr className="bg-white/[0.02] font-semibold">
                            <td className="px-4 py-3 text-white whitespace-nowrap">Subtotal {titulo.toLowerCase()}</td>
                            {porPeriodo && bloco.totalPorPeriodo.map((v, i) => (
                                <CelulasValores key={periodos[i].indice} v={v} grupo={bloco.grupo} dinheiro={dinheiro}
                                                inicioGrupo destaque/>
                            ))}
                            <CelulasValores v={bloco.total} grupo={bloco.grupo} dinheiro={dinheiro}
                                            inicioGrupo={porPeriodo} destaque/>
                            <td className={`${TD} text-amber-300/80 ${porPeriodo ? INICIO_GRUPO : ""}`}>
                                {dinheiro(reais(bloco.total.jurosCents))}
                            </td>
                        </tr>
                    </>
                )}
            </>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Relatório de Metas"
                description={`Previsto × realizado pela data de pagamento — ${descricaoPeriodo}`}
                actions={
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={exportarPdf}
                            disabled={metas.length === 0 || isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                        >
                            <FileText className="w-4 h-4"/> Exportar PDF
                        </button>
                        <button
                            type="button"
                            onClick={() => exportToExcel(exportFilename, buildMetasExportRows(), colunasExportacao(porPeriodo))}
                            disabled={metas.length === 0 || isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                        >
                            <Download className="w-4 h-4"/> Exportar XLSX
                        </button>
                    </div>
                }
            />

            {/* Barra padrão: período (ano + visão/períodos) à esquerda; quebra linha no celular */}
            <div className="glass-panel rounded-2xl border border-white/5 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="metas-ano" className="text-xs text-muted-foreground whitespace-nowrap">Ano</label>
                    <SelectCampo
                        id="metas-ano"
                        value={String(ano)}
                        onChange={(v) => atualizar({ano: v})}
                        className="w-[8.5em]"
                        opcoes={anosOpcoes.map((y) => ({value: String(y), label: String(y)}))}
                    />
                    <FiltroPeriodoMetas
                        selecao={selecao}
                        mesReferencia={mesAtual}
                        onChange={(sel) => atualizar({ano: String(ano), ...selecaoParaUrl(sel)})}
                    />
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin"/>
                    <span className="text-sm">Carregando relatório de metas…</span>
                </div>
            )}

            {isError && !isLoading && (
                <div className="glass-panel rounded-2xl p-5 border border-destructive/20 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive shrink-0"/>
                    <p className="text-sm text-muted-foreground">Erro ao carregar metas.</p>
                </div>
            )}

            {!isLoading && !isError && (
                <>
                    {/* Destaque: Receitas / Despesas / Resultado do período selecionado */}
                    <section aria-label={`Resumo de ${descricaoPeriodo}`} className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <CardGrupo
                                titulo="Receitas"
                                icone={<TrendingUp className="w-5 h-5 text-teal-400"/>}
                                bloco={receitas}
                                rotuloPct="atingido"
                                dinheiro={dinheiro}
                            />
                            <CardGrupo
                                titulo="Despesas (custos + despesas)"
                                icone={<TrendingDown className="w-5 h-5 text-rose-400"/>}
                                bloco={despesas}
                                rotuloPct="consumido"
                                dinheiro={dinheiro}
                            />
                            <div className="glass-panel rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <Scale className="w-5 h-5 text-primary"/>
                                    <p className="text-sm font-semibold text-white">Resultado (receitas − despesas)</p>
                                </div>
                                <dl className="space-y-1 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Orçado</dt>
                                        <dd className={`font-medium ${resultadoOrcado < 0 ? "text-destructive" : "text-white/90"}`}>
                                            {dinheiro(resultadoOrcado)}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Realizado</dt>
                                        <dd className={`font-medium ${resultadoRealizado < 0 ? "text-destructive" : "text-teal-300"}`}>
                                            {dinheiro(resultadoRealizado)}
                                        </dd>
                                    </div>
                                </dl>
                                <p className={`mt-3 text-2xl font-bold ${diferencaResultado < 0 ? "text-destructive" : "text-white"}`}>
                                    {diferencaResultado > 0 ? "+" : ""}{dinheiro(diferencaResultado)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1.5">
                                    Realizado − orçado. O realizado inclui as categorias sem meta.
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground px-1">
                            Juros pagos no período (fora do resultado, não entram na meta):{" "}
                            <span className="text-amber-300 font-medium">{dinheiro(totalJuros)}</span>
                        </p>
                    </section>

                    {hasChartData && (
                        <div className="glass-panel rounded-2xl p-6">
                            <div className="mb-5">
                                <h3 className="font-bold text-white">Orçado × Realizado — {descricaoPeriodo}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Só categorias com meta. Realizado = valor pago ou recebido, no mês do
                                    pagamento. Juros não entram.
                                </p>
                            </div>
                            <div className="h-[240px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} barSize={12} barGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false}/>
                                        <XAxis dataKey="mes" stroke="#ffffff50" fontSize={12} tickLine={false}
                                               axisLine={false}/>
                                        <YAxis
                                            stroke="#ffffff50"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v) => (!saldosVisiveis ? "•••" : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)}
                                        />
                                        <Tooltip content={<CustomTooltip/>} cursor={{fill: "#ffffff05"}}/>
                                        <Legend iconType="circle" wrapperStyle={{fontSize: "12px"}}/>
                                        <Bar dataKey="receitaOrcado" name="Receitas orçado" fill={COR_RECEITA}
                                             fillOpacity={0.4} radius={[3, 3, 0, 0]}/>
                                        <Bar dataKey="receitaRealizado" name="Receitas realizado" fill={COR_RECEITA}
                                             radius={[3, 3, 0, 0]}/>
                                        <Bar dataKey="despesaOrcado" name="Despesas orçado" fill={COR_DESPESA}
                                             fillOpacity={0.4} radius={[3, 3, 0, 0]}/>
                                        <Bar dataKey="despesaRealizado" name="Despesas realizado" fill={COR_DESPESA}
                                             radius={[3, 3, 0, 0]}/>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {temLinhas && (
                        <div className="glass-panel rounded-2xl overflow-hidden">
                            <div className="p-5 border-b border-white/5">
                                <h3 className="font-bold text-white">Orçado × Realizado × % por categoria — {descricaoPeriodo}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Pagamentos parciais e contas atrasadas entram no mês em que foram pagos.
                                    % = realizado ÷ orçado, só onde há orçado (— quando não há). Em receitas,
                                    acima de 100% é bom; em despesas, acima de 100% é alerta.
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5">
                                    {porPeriodo ? (
                                        <>
                                            <tr>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs text-muted-foreground font-medium">
                                                    Categoria
                                                </th>
                                                {periodos.map((p) => (
                                                    <th key={p.indice} colSpan={3} scope="colgroup"
                                                        className={`px-4 pt-3 pb-1 text-center text-xs text-white/80 font-semibold whitespace-nowrap ${INICIO_GRUPO}`}>
                                                        {p.rotulo}
                                                    </th>
                                                ))}
                                                <th colSpan={3} scope="colgroup"
                                                    className={`px-4 pt-3 pb-1 text-center text-xs text-white font-bold whitespace-nowrap ${INICIO_GRUPO}`}>
                                                    Total
                                                </th>
                                                <th rowSpan={2} className={`${TH} ${INICIO_GRUPO}`}>Juros</th>
                                            </tr>
                                            <tr>
                                                {[...periodos.map((p) => String(p.indice)), "total"].map((k) => (
                                                    <Fragment key={k}>
                                                        <th className={`${TH} pt-1 ${INICIO_GRUPO}`}>Orçado</th>
                                                        <th className={`${TH} pt-1`}>Realizado</th>
                                                        <th className={`${TH} pt-1`}>%</th>
                                                    </Fragment>
                                                ))}
                                            </tr>
                                        </>
                                    ) : (
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs text-muted-foreground font-medium">Categoria</th>
                                            <th className={TH}>Orçado</th>
                                            <th className={TH}>Realizado</th>
                                            <th className={TH}>%</th>
                                            <th className={TH}>Juros</th>
                                        </tr>
                                    )}
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                    {secaoGrupo(receitas, "Receitas", "% atingido", "text-teal-300")}
                                    {secaoGrupo(despesas, "Despesas", "custos + despesas · % consumido", "text-rose-300")}
                                    {semMeta.length > 0 && (
                                        <>
                                            {cabecalhoSecao("Sem meta", "realizado sem orçamento no período, fora do %", "text-white/70")}
                                            {semMeta.map((l) => linhaCategoria(l, {semMeta: true}))}
                                        </>
                                    )}
                                    </tbody>
                                    <tfoot className="bg-white/5 border-t border-white/10">
                                    <tr className="font-bold">
                                        <td className="px-4 py-3 text-white whitespace-nowrap">
                                            Resultado (receitas − despesas)
                                        </td>
                                        {porPeriodo && resumo.resultadoPorPeriodo.map((v, i) => (
                                            <CelulaResultado key={periodos[i].indice} v={v} dinheiro={dinheiro} inicioGrupo/>
                                        ))}
                                        <CelulaResultado v={resultado} dinheiro={dinheiro} inicioGrupo={porPeriodo}/>
                                        <td className={`${TD} text-amber-300/80 ${porPeriodo ? INICIO_GRUPO : ""}`}>
                                            {dinheiro(totalJuros)}
                                        </td>
                                    </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                    {metas.length === 0 && (
                        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-muted-foreground">
                            {metasAno.length === 0
                                ? `Nenhuma meta cadastrada para ${ano}.`
                                : `Nenhuma meta ou realizado em ${descricaoPeriodo}.`}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** Resultado: orçado e realizado (negativo em vermelho); sem % (receitas − despesas pode ser negativo). */
function CelulaResultado({v, dinheiro, inicioGrupo}: {
    v: ValoresMeta;
    dinheiro: (n: number) => string;
    inicioGrupo?: boolean;
}) {
    const cor = (cents: number) => (cents < 0 ? "text-destructive" : "text-white");
    return (
        <>
            <td className={`${TD} ${cor(v.orcadoCents)} ${inicioGrupo ? INICIO_GRUPO : ""}`}>
                {dinheiro(reais(v.orcadoCents))}
            </td>
            <td className={`${TD} ${cor(v.realizadoCents)}`}>{dinheiro(reais(v.realizadoCents))}</td>
            <td className={`${TD} text-muted-foreground`}>—</td>
        </>
    );
}
