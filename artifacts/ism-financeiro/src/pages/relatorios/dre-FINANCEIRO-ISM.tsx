import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Download, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { fetchApiData } from "@/lib/api-config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const monthKey = (m: number) => String(m).padStart(2, "0");

function mesesPtLong(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const s = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2000, i, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

export type DreLinhaApi = {
  codigo: string;
  descricao: string;
  valores: Record<string, string | number>;
  total: string | number;
};

export type DreResponse = {
  ano: number;
  regime: string;
  meses: string[];
  linhas: DreLinhaApi[];
};

function valorMes(linha: DreLinhaApi, mes: number): number {
  return Number(linha.valores[monthKey(mes)] ?? 0);
}

export default function DreGerencial() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const [regime, setRegime] = useState<"competencia" | "caixa">("competencia");
  const mesesPt = useMemo(() => mesesPtLong(), []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["relatorio-dre", ano, regime],
    queryFn: () =>
      fetchApiData<DreResponse>(`/relatorios/dre?ano=${ano}&regime=${regime}`),
  });

  const linhas = data?.linhas ?? [];
  const mesAtualRef = data?.ano === currentYear ? new Date().getMonth() + 1 : 12;

  const porCodigo = useMemo(() => {
    const m = new Map<string, DreLinhaApi>();
    for (const l of linhas) m.set(l.codigo, l);
    return m;
  }, [linhas]);

  const kpis = useMemo(() => {
    const rl = porCodigo.get("3");
    const mc = porCodigo.get("5");
    const ll = porCodigo.get("7");
    return [
      { label: "Receita líquida (ano)", value: Number(rl?.total ?? 0), color: "text-teal-400" },
      { label: "Margem de contribuição (ano)", value: Number(mc?.total ?? 0), color: "text-primary" },
      { label: "Lucro líquido (ano)", value: Number(ll?.total ?? 0), color: "text-emerald-400" },
    ];
  }, [porCodigo]);

  const anosOpcoes = useMemo(() => {
    const out: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 8; y--) out.push(y);
    return out;
  }, [currentYear]);

  const rowClass = (codigo: string) => {
    if (codigo === "7")
      return "bg-emerald-500/15 border-y border-emerald-500/30 font-bold text-white";
    if (codigo === "3" || codigo === "5")
      return "bg-primary/10 font-semibold text-white border-t border-primary/15";
    if (codigo === "2" || codigo === "4" || codigo === "6") return "text-white/90";
    return "text-white";
  };

  const cellClass = (codigo: string, val: number) => {
    if (codigo === "7") return val >= 0 ? "text-emerald-300" : "text-destructive";
    if (val < 0) return "text-orange-300/95";
    if (val > 0) return "text-white";
    return "text-muted-foreground/40";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="DRE Gerencial"
        description="Demonstração do resultado do exercício por mês (competência ou caixa)."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Ano</span>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger className="w-[120px] h-9 bg-white/5 border-white/10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anosOpcoes.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setRegime("competencia")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  regime === "competencia" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-white",
                )}>
                Competência
              </button>
              <button
                type="button"
                onClick={() => setRegime("caixa")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  regime === "caixa" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-white",
                )}>
                Caixa
              </button>
            </div>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all opacity-60 cursor-not-allowed"
              disabled
              title="Em breve">
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      {regime === "caixa" && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-sm text-amber-200/95 flex gap-2 items-start">
          <span className="font-bold shrink-0">ℹ</span>
          <span>
            Regime de caixa considera apenas lançamentos quitados/recebidos, pela data de quitação. Competência usa vencimento e exclui cancelados.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="glass-panel rounded-2xl border border-white/10 p-16 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm">Carregando DRE…</p>
        </div>
      ) : isError ? (
        <div className="glass-panel rounded-2xl border border-destructive/30 p-8 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="text-sm text-white font-medium">Não foi possível carregar o relatório.</p>
          <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Erro desconhecido"}</p>
          <button type="button" onClick={() => void refetch()} className="mt-2 text-xs text-primary underline">
            Tentar novamente
          </button>
        </div>
      ) : linhas.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-white/10 p-10 text-center text-muted-foreground text-sm">
          Nenhuma linha retornada para {ano}.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {kpis.map((item) => (
              <div key={item.label} className="glass-panel rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className={cn("w-4 h-4", item.color)} />
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
                <p className={cn("text-xl font-bold tabular-nums", item.color)}>{formatCurrency(item.value)}</p>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
            <div className="px-4 py-3 border-b border-white/10 bg-black/20 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Exercício <span className="text-white font-semibold">{data?.ano ?? ano}</span>
                {" · "}
                Regime <span className="text-white font-semibold">{data?.regime ?? regime}</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-[#121417]/95 backdrop-blur-sm z-10 min-w-[260px] border-r border-white/5">
                      Linha DRE
                    </th>
                    {mesesPt.map((nome, i) => {
                      const m = i + 1;
                      const futuro = data?.ano === currentYear && m > mesAtualRef;
                      return (
                        <th
                          key={nome}
                          title={nome}
                          className={cn(
                            "px-1.5 py-3 text-right font-medium text-[10px] leading-tight min-w-[76px] max-w-[90px]",
                            futuro ? "text-muted-foreground/35" : "text-muted-foreground",
                          )}>
                          {nome}
                        </th>
                      );
                    })}
                    <th className="px-3 py-3 text-right font-bold text-primary min-w-[100px] sticky right-0 bg-[#121417]/95 backdrop-blur-sm border-l border-white/5">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {linhas.map((linha) => (
                    <tr key={linha.codigo} className={cn("hover:bg-white/[0.02]", rowClass(linha.codigo))}>
                      <td
                        className={cn(
                          "px-4 py-2.5 sticky left-0 z-[1] border-r border-white/5 backdrop-blur-sm",
                          linha.codigo === "7" ? "bg-emerald-500/10" : "bg-[#121417]/90",
                        )}>
                        <span className={cn(linha.codigo === "7" && "text-base")}>{linha.descricao}</span>
                      </td>
                      {mesesPt.map((_, i) => {
                        const m = i + 1;
                        const v = valorMes(linha, m);
                        const futuro = data?.ano === currentYear && m > mesAtualRef;
                        return (
                          <td
                            key={m}
                            className={cn(
                              "px-2 py-2.5 text-right tabular-nums text-xs",
                              cellClass(linha.codigo, v),
                              futuro && "opacity-40",
                            )}>
                            {v !== 0 ? formatCurrency(v) : "—"}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-bold tabular-nums text-xs sticky right-0 border-l border-white/5 backdrop-blur-sm",
                          cellClass(linha.codigo, Number(linha.total)),
                          linha.codigo === "7" ? "bg-emerald-500/10" : "bg-[#121417]/90",
                        )}>
                        {Number(linha.total) !== 0 ? formatCurrency(Number(linha.total)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
