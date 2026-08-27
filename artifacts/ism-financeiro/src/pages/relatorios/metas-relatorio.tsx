import {useMemo, useState} from "react";
import {PageHeader} from "@/components/shared/page-header";
import {
    Download,
    FileText,
    Target,
    TrendingUp,
    TrendingDown,
    Loader2,
    AlertCircle,
} from "lucide-react";
import {formatCurrency} from "@/lib/utils";
import {useQuery} from "@tanstack/react-query";
import {fetchApiData} from "@/lib/api-config";
import {exportToExcel, exportToPDF, fmtBRL} from "@/lib/export";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Cell,
} from "recharts";

const MESES_CURTOS = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length: 6}, (_, i) => CURRENT_YEAR + 2 - i);

type MetaItem = {
    plano_conta_id: number;
    categoria: string | null;
    mes: number;
    valor_projetado: number;
    valor_realizado: number;
    juros: number;
    atingimento_pct: number | null;
};

function toCents(v: number): number {
    return Math.round(v * 100);
}

const CustomTooltip = ({active, payload, label}: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
            <p className="text-white font-medium mb-2">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} style={{color: entry.color}} className="text-sm">
                    {entry.name}: {formatCurrency(entry.value)}
                </p>
            ))}
        </div>
    );
};

export default function MetasRelatorio() {
    const [ano, setAno] = useState(CURRENT_YEAR);

    const {data: metas = [], isLoading, isError} = useQuery<MetaItem[]>({
        queryKey: ["relatorio-metas", ano],
        queryFn: () => fetchApiData<MetaItem[]>(`/relatorios/metas?ano=${ano}`),
    });

    const metasPorMes = useMemo(() => {
        const orcado: Record<number, number> = {};
        const realizado: Record<number, number> = {};
        const juros: Record<number, number> = {};
        for (const item of metas) {
            orcado[item.mes] = (orcado[item.mes] ?? 0) + toCents(item.valor_projetado);
            realizado[item.mes] = (realizado[item.mes] ?? 0) + toCents(item.valor_realizado ?? 0);
            juros[item.mes] = (juros[item.mes] ?? 0) + toCents(item.juros ?? 0);
        }
        return {
            orcado: Object.fromEntries(
                Object.entries(orcado).map(([k, v]) => [k, v / 100]),
            ) as Record<number, number>,
            realizado: Object.fromEntries(
                Object.entries(realizado).map(([k, v]) => [k, v / 100]),
            ) as Record<number, number>,
            juros: Object.fromEntries(
                Object.entries(juros).map(([k, v]) => [k, v / 100]),
            ) as Record<number, number>,
        };
    }, [metas]);

    const metasPorCategoria = useMemo(() => {
        const cat = new Map<
            string,
            { orcado: Record<number, number>; realizado: Record<number, number>; juros: number }
        >();
        for (const item of metas) {
            const nome = item.categoria ?? "Sem categoria";
            if (!cat.has(nome)) {
                cat.set(nome, {orcado: {}, realizado: {}, juros: 0});
            }
            const row = cat.get(nome)!;
            row.orcado[item.mes] = (row.orcado[item.mes] ?? 0) + item.valor_projetado;
            row.realizado[item.mes] = (row.realizado[item.mes] ?? 0) + (item.valor_realizado ?? 0);
            row.juros += item.juros ?? 0;
        }
        return cat;
    }, [metas]);

    const chartData = useMemo(
        () =>
            MESES_CURTOS.map((mes, i) => ({
                mes,
                orcado: metasPorMes.orcado[i + 1] ?? 0,
                realizado: metasPorMes.realizado[i + 1] ?? 0,
            })),
        [metasPorMes],
    );

    const totalOrcadoCents = Object.values(metasPorMes.orcado).reduce((a, b) => a + toCents(b), 0);
    const totalRealizadoCents = Object.values(metasPorMes.realizado).reduce((a, b) => a + toCents(b), 0);
    const totalJurosCents = Object.values(metasPorMes.juros).reduce((a, b) => a + toCents(b), 0);
    const totalOrcado = totalOrcadoCents / 100;
    const totalRealizado = totalRealizadoCents / 100;
    const totalJuros = totalJurosCents / 100;
    const atingimentoPct =
        totalOrcado > 0 ? ((totalRealizado / totalOrcado) * 100) : null;
    const hasChartData = totalOrcado > 0 || totalRealizado > 0;

    const EXPORT_COLUMNS = [
        {header: "Categoria", key: "categoria", width: 28},
        {header: "Orçado", key: "orcado", width: 16, formatter: (v: unknown) => fmtBRL(v ?? 0)},
        {header: "Realizado", key: "realizado", width: 16, formatter: (v: unknown) => fmtBRL(v ?? 0)},
        {header: "Atingimento %", key: "pct", width: 14},
        {header: "Juros (fora)", key: "juros", width: 14, formatter: (v: unknown) => fmtBRL(v ?? 0)},
    ];

    function buildMetasExportRows(): Record<string, unknown>[] {
        const rows: Record<string, unknown>[] = [];
        for (const [cat, data] of metasPorCategoria.entries()) {
            const orcado = Object.values(data.orcado).reduce((a, b) => a + b, 0);
            const realizado = Object.values(data.realizado).reduce((a, b) => a + b, 0);
            rows.push({
                categoria: cat,
                orcado,
                realizado,
                pct: orcado > 0 ? `${((realizado / orcado) * 100).toFixed(1)}%` : "—",
                juros: data.juros,
            });
        }
        rows.push({
            categoria: "TOTAL",
            orcado: totalOrcado,
            realizado: totalRealizado,
            pct: atingimentoPct != null ? `${atingimentoPct.toFixed(1)}%` : "—",
            juros: totalJuros,
        });
        return rows;
    }

    const exportFilename = `Metas_${ano}`;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Relatório de Metas"
                description={`Previsto × Realizado via data_quitação — ${ano}`}
                actions={
                    <div className="flex gap-3">
                        <select
                            value={ano}
                            onChange={(e) => setAno(Number(e.target.value))}
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none cursor-pointer"
                        >
                            {YEARS.map((y) => (
                                <option key={y} value={y} className="bg-card text-white">
                                    {y}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() =>
                                exportToPDF(exportFilename, buildMetasExportRows(), EXPORT_COLUMNS, {
                                    title: `Relatório de Metas — ${ano}`,
                                    subtitle: `Orçado: ${fmtBRL(totalOrcado)} | Realizado (quitação): ${fmtBRL(totalRealizado)} | Juros (fora): ${fmtBRL(totalJuros)}`,
                                    orientation: "landscape",
                                })
                            }
                            disabled={metas.length === 0 || isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                        >
                            <FileText className="w-4 h-4"/> Exportar PDF
                        </button>
                        <button
                            type="button"
                            onClick={() => exportToExcel(exportFilename, buildMetasExportRows(), EXPORT_COLUMNS)}
                            disabled={metas.length === 0 || isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                        >
                            <Download className="w-4 h-4"/> Exportar XLSX
                        </button>
                    </div>
                }
            />

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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="glass-panel rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Target className="w-5 h-5 text-primary"/>
                                <p className="text-xs text-muted-foreground">Total Orçado</p>
                            </div>
                            <p className="text-xl font-bold text-primary">{formatCurrency(totalOrcado)}</p>
                        </div>
                        <div className="glass-panel rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <TrendingUp className="w-5 h-5 text-teal-400"/>
                                <p className="text-xs text-muted-foreground">Realizado (quitação)</p>
                            </div>
                            <p className="text-xl font-bold text-teal-400">{formatCurrency(totalRealizado)}</p>
                            {atingimentoPct != null && (
                                <p className={`text-xs mt-1 ${atingimentoPct >= 100 ? "text-success" : "text-warning"}`}>
                                    {atingimentoPct.toFixed(1)}% do orçado
                                </p>
                            )}
                        </div>
                        <div className="glass-panel rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                {atingimentoPct != null && atingimentoPct >= 100 ? (
                                    <TrendingUp className="w-5 h-5 text-success"/>
                                ) : (
                                    <TrendingDown className="w-5 h-5 text-warning"/>
                                )}
                                <p className="text-xs text-muted-foreground">Atingimento</p>
                            </div>
                            <p className="text-xl font-bold text-white">
                                {atingimentoPct == null ? "—" : `${atingimentoPct.toFixed(1)}%`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Previsto × quitado</p>
                        </div>
                        <div className="glass-panel rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Target className="w-5 h-5 text-amber-400"/>
                                <p className="text-xs text-muted-foreground">Juros (fora do resultado)</p>
                            </div>
                            <p className="text-xl font-bold text-amber-300">{formatCurrency(totalJuros)}</p>
                            <p className="text-xs text-muted-foreground mt-1">Não entra na meta</p>
                        </div>
                    </div>

                    {hasChartData && (
                        <div className="glass-panel rounded-2xl p-6">
                            <div className="mb-5">
                                <h3 className="font-bold text-white">Orçado × Realizado — {ano}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Realizado = valor quitado por <strong>data_quitação</strong> (conciliação). Juros
                                    não entram.
                                </p>
                            </div>
                            <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} barSize={18} barGap={4}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false}/>
                                        <XAxis dataKey="mes" stroke="#ffffff50" fontSize={12} tickLine={false}
                                               axisLine={false}/>
                                        <YAxis
                                            stroke="#ffffff50"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)}
                                        />
                                        <Tooltip content={<CustomTooltip/>} cursor={{fill: "#ffffff05"}}/>
                                        <Legend iconType="circle" wrapperStyle={{fontSize: "12px"}}/>
                                        <Bar dataKey="orcado" name="Orçado" fill="#3BA8DC" fillOpacity={0.5}
                                             radius={[3, 3, 0, 0]}/>
                                        <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                                            {chartData.map((entry, i) => (
                                                <Cell
                                                    key={i}
                                                    fill={entry.realizado >= entry.orcado ? "#27AE60" : "#E74C3C"}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {metasPorCategoria.size > 0 && (
                        <div className="glass-panel rounded-2xl overflow-hidden">
                            <div className="p-5 border-b border-white/5">
                                <h3 className="font-bold text-white">Previsto × Realizado por categoria — {ano}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Quitação parcial e atrasados pagos no mês entram pelo mês da data_quitação.
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs text-muted-foreground">Categoria</th>
                                        <th className="px-4 py-3 text-right text-xs text-muted-foreground">Orçado</th>
                                        <th className="px-4 py-3 text-right text-xs text-muted-foreground">Realizado</th>
                                        <th className="px-4 py-3 text-right text-xs text-muted-foreground">%</th>
                                        <th className="px-4 py-3 text-right text-xs text-muted-foreground">Juros</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                    {[...metasPorCategoria.entries()].map(([cat, data]) => {
                                        const orcado = Object.values(data.orcado).reduce((a, b) => a + b, 0);
                                        const realizado = Object.values(data.realizado).reduce((a, b) => a + b, 0);
                                        const pct = orcado > 0 ? (realizado / orcado) * 100 : null;
                                        return (
                                            <tr key={cat} className="hover:bg-white/[0.02]">
                                                <td className="px-4 py-3 text-white font-medium">{cat}</td>
                                                <td className="px-4 py-3 text-right text-white/80">{formatCurrency(orcado)}</td>
                                                <td className="px-4 py-3 text-right text-teal-300">{formatCurrency(realizado)}</td>
                                                <td className={`px-4 py-3 text-right font-semibold ${pct != null && pct >= 100 ? "text-success" : "text-warning"}`}>
                                                    {pct == null ? "—" : `${pct.toFixed(0)}%`}
                                                </td>
                                                <td className="px-4 py-3 text-right text-amber-300/80">{formatCurrency(data.juros)}</td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {metas.length === 0 && (
                        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-muted-foreground">
                            Nenhuma meta cadastrada para {ano}.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
