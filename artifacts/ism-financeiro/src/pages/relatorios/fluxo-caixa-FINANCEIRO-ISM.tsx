import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Download, Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
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

export type FluxoLinhaApi = {
  codigo: string;
  descricao: string;
  valores: Record<string, string | number>;
  total: string | number;
};

export type FluxoSecaoApi = {
  titulo: string;
  tipo: string;
  linhas: FluxoLinhaApi[];
};

export type FluxoCaixaResponse = {
  ano: number;
  meses: string[];
  secoes: FluxoSecaoApi[];
};

/** Lida com string numeric e number para evitar erro IEEE 754 de float */
function toCents(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return Math.round(v * 100);
  const str = String(v).replace(",", ".");
  return Math.round(Number(str) * 100);
}

function valorMesCents(linha: FluxoLinhaApi, mes: number): number {
  return toCents(linha.valores[monthKey(mes)]);
}

function somaMesSecaoCents(linhas: FluxoLinhaApi[], mes: number): number {
  return linhas.reduce((acc, l) => acc + valorMesCents(l, mes), 0);
}

function somaTotalSecaoCents(linhas: FluxoLinhaApi[]): number {
  return linhas.reduce((acc, l) => acc + toCents(l.total), 0);
}

export default function FluxoCaixa() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const mesesPt = useMemo(() => mesesPtLong(), []);

  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["relatorio-fluxo-caixa", ano],
    queryFn: () => fetchApiData<FluxoCaixaResponse>(`/relatorios/fluxo-caixa?ano=${ano}`),
  });

  const secoes = data?.secoes ?? [];

  const toggleSecao = (tipo: string) => {
    setAberto((prev) => ({
      ...prev,
      [tipo]: !(prev[tipo] ?? true),
    }));
  };

  /** Secções expandidas por defeito até o utilizador fechar. */
  const isOpen = (tipo: string) => aberto[tipo] !== false;

  const fluxoLiquidoMensalCents = useMemo(() => {
    if (!data?.secoes.length) return null;
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return data.secoes.reduce((acc, sec) => acc + somaMesSecaoCents(sec.linhas, m), 0);
    });
  }, [data]);

  const fluxoLiquidoTotalCents = fluxoLiquidoMensalCents?.reduce((a, b) => a + b, 0) ?? 0;

  const anosOpcoes = useMemo(() => {
    const out: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 8; y--) out.push(y);
    return out;
  }, [currentYear]);

  const cellTone = (vCents: number, opts?: { mutedZero?: boolean }) => {
    if (vCents === 0 && opts?.mutedZero) return "text-muted-foreground/35";
    if (vCents < 0) return "text-orange-300/95";
    if (vCents > 0) return "text-teal-300/95";
    return "text-muted-foreground/40";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de caixa mensal"
        description="Entradas e saídas por categoria (data de quitação, lançamentos recebidos/pagos)."
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

      {isLoading ? (
        <div className="glass-panel rounded-2xl border border-white/10 p-16 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm">Carregando fluxo de caixa…</p>
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
      ) : secoes.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-white/10 p-10 text-center text-muted-foreground text-sm">
          Nenhuma seção retornada para {ano}.
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 bg-black/20 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Exercício <span className="text-white font-semibold">{data?.ano ?? ano}</span>
              <span className="text-muted-foreground/60"> · </span>
              <span className="text-[11px]">Valores na data de quitação (caixa)</span>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1180px]">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-[#121417]/95 backdrop-blur-sm z-10 min-w-[240px] border-r border-white/5">
                    Categoria
                  </th>
                  {mesesPt.map((nome) => (
                    <th
                      key={nome}
                      title={nome}
                      className="px-1.5 py-3 text-right font-medium text-[10px] leading-tight text-muted-foreground min-w-[76px] max-w-[92px]">
                      {nome}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-bold text-primary min-w-[100px] sticky right-0 bg-[#121417]/95 backdrop-blur-sm border-l border-white/5">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {secoes.map((secao) => {
                  const open = isOpen(secao.tipo);
                  const subTotaisMesCents = Array.from({ length: 12 }, (_, i) => somaMesSecaoCents(secao.linhas, i + 1));
                  const subTotalAnoCents = somaTotalSecaoCents(secao.linhas);

                  return (
                    <Fragment key={secao.tipo}>
                      <tr className="bg-white/[0.06]">
                        <td colSpan={14} className="p-0">
                          <button
                            type="button"
                            onClick={() => toggleSecao(secao.tipo)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider text-primary hover:bg-white/5 transition-colors">
                            {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                            {secao.titulo}
                            <span className="ml-auto text-[10px] font-normal text-muted-foreground normal-case">
                              {secao.linhas.length} {secao.linhas.length === 1 ? "categoria" : "categorias"}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {open &&
                        secao.linhas.map((linha) => (
                          <tr key={linha.codigo} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2 pl-8 text-white/90 sticky left-0 bg-[#121417]/90 backdrop-blur-sm border-r border-white/5 z-[1]">
                              {linha.descricao}
                            </td>
                            {mesesPt.map((_, i) => {
                              const m = i + 1;
                              const vCents = valorMesCents(linha, m);
                              return (
                                <td
                                  key={m}
                                  className={cn("px-1.5 py-2 text-right tabular-nums text-xs", cellTone(vCents, { mutedZero: true }))}>
                                  {vCents !== 0 ? formatCurrency(vCents / 100) : "—"}
                                </td>
                              );
                            })}
                            <td
                              className={cn(
                                "px-3 py-2 text-right font-semibold tabular-nums text-xs sticky right-0 bg-[#121417]/90 border-l border-white/5",
                                cellTone(toCents(linha.total)),
                              )}>
                              {toCents(linha.total) !== 0 ? formatCurrency(toCents(linha.total) / 100) : "—"}
                            </td>
                          </tr>
                        ))}
                      {open && (
                        <tr key={`sub-${secao.tipo}`} className="bg-primary/5 border-t border-primary/10 font-semibold text-white/95">
                          <td className="px-4 py-2 sticky left-0 bg-[#121417]/95 border-r border-white/5 z-[1]">
                            Subtotal {secao.titulo}
                          </td>
                          {subTotaisMesCents.map((vCents, i) => (
                            <td key={i} className={cn("px-1.5 py-2 text-right tabular-nums text-xs", cellTone(vCents))}>
                              {vCents !== 0 ? formatCurrency(vCents / 100) : "—"}
                            </td>
                          ))}
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums text-xs sticky right-0 bg-[#121417]/95 border-l border-white/5",
                              cellTone(subTotalAnoCents),
                            )}>
                            {subTotalAnoCents !== 0 ? formatCurrency(subTotalAnoCents / 100) : "—"}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {fluxoLiquidoMensalCents && (
                  <tr className="bg-emerald-500/10 border-t-2 border-emerald-500/25 font-bold text-white">
                    <td className="px-4 py-3 sticky left-0 bg-emerald-500/10 border-r border-emerald-500/20 z-[1]">
                      Fluxo líquido (todas as seções)
                    </td>
                    {fluxoLiquidoMensalCents.map((vCents, i) => (
                      <td key={i} className={cn("px-1.5 py-3 text-right tabular-nums text-xs", cellTone(vCents))}>
                        {vCents !== 0 ? formatCurrency(vCents / 100) : "—"}
                      </td>
                    ))}
                    <td
                      className={cn(
                        "px-3 py-3 text-right tabular-nums text-sm sticky right-0 bg-emerald-500/10 border-l border-emerald-500/20",
                        cellTone(fluxoLiquidoTotalCents),
                      )}>
                      {fluxoLiquidoTotalCents !== 0 ? formatCurrency(fluxoLiquidoTotalCents / 100) : "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
