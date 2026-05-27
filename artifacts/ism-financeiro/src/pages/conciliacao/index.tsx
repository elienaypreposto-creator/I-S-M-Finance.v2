import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { ApiEnvelope, fetchApi } from "@/lib/api-config";
import { formatDate } from "@/lib/utils";
import { ImportExtratoModal } from "@/components/conciliacao/import-extrato-modal";
import { Loader2, AlertCircle, Plus, FileStack, ChevronLeft, ChevronRight } from "lucide-react";

export type ConciliacaoListItem = {
  conciliacao_id: number;
  extrato_id: number;
  conta_id: number;
  conta_nome: string | null;
  arquivo_nome: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  status: string;
  resumo_conciliados: number | null;
  resumo_ignorados: number | null;
  resumo_pendentes: number | null;
  resumo_total: number | null;
  created_at: string;
};

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

export default function ConciliacaoList() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const limit = 15;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["conciliacoes", page, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      const envelope = await fetchApi<ApiEnvelope<ConciliacaoListItem[]>>(`/conciliacoes?${params.toString()}`);
      const meta = envelope.meta as { total?: number; page?: number; limit?: number } | null;
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
        title="Conciliação bancária"
        description="Extratos importados e progresso de vínculo com lançamentos"
        actions={
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 transition-colors">
            <Plus className="w-4 h-4" />
            Importar extrato
          </button>
        }
      />

      <ImportExtratoModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(extratoId) => setLocation(`/conciliacao/extrato/${extratoId}`)}
      />

      <div className="glass-panel rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0 border border-white/10">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileStack className="w-4 h-4" />
            <span>{total.toLocaleString("pt-BR")} extrato(s) no total</span>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/25 text-muted-foreground border-b border-white/5">
              <tr>
                <th className="px-4 py-3 font-semibold">Conta</th>
                <th className="px-4 py-3 font-semibold">Arquivo</th>
                <th className="px-4 py-3 font-semibold">Período</th>
                <th className="px-4 py-3 font-semibold">Progresso</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Importado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="mt-2 text-xs">Carregando extratos…</p>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-destructive">
                      <AlertCircle className="w-7 h-7" />
                      <span className="text-xs">Não foi possível carregar as conciliações.</span>
                      <button
                        type="button"
                        onClick={() => void refetch()}
                        className="mt-2 text-xs underline text-white/70 hover:text-white">
                        Tentar novamente
                      </button>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-muted-foreground text-xs">
                    Nenhum extrato importado. Use &quot;Importar extrato&quot; para enviar OFX/CSV.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const totalLinhas = num(row.resumo_total);
                  const conc = num(row.resumo_conciliados);
                  const ign = num(row.resumo_ignorados);
                  const pend = num(row.resumo_pendentes);
                  const tratadas = conc + ign;
                  const pct = totalLinhas > 0 ? Math.round((tratadas / totalLinhas) * 100) : 0;

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
                      className="hover:bg-white/[0.04] cursor-pointer transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{row.conta_nome ?? "—"}</td>
                      <td className="px-4 py-3 text-white/80 max-w-[200px] truncate" title={row.arquivo_nome ?? ""}>
                        {row.arquivo_nome ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/70 whitespace-nowrap">
                        {row.periodo_inicio && row.periodo_fim
                          ? `${formatDate(row.periodo_inicio)} — ${formatDate(row.periodo_fim)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 min-w-[200px]">
                        <div className="flex flex-col gap-1">
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground leading-tight">
                            Vinculados: <span className="text-emerald-400 font-semibold">{conc}</span>
                            {" · "}
                            Pendentes: <span className="text-amber-300 font-semibold">{pend}</span>
                            {ign > 0 ? (
                              <>
                                {" · "}
                                Ignorados: <span className="text-white/50 font-semibold">{ign}</span>
                              </>
                            ) : null}
                            {" · "}
                            Total: {totalLinhas}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusStyles(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60 whitespace-nowrap">{formatDate(row.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground bg-black/15">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 inline-flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 inline-flex items-center gap-1">
              Próxima
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
