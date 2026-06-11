import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { PageHeader } from "@/components/shared/page-header";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { format, startOfYear, endOfYear } from "date-fns";
import {
  Plus,
  Search,
  Trash2,
  ArrowRight,
  X,
  Link2,
  Ban,
  ChevronsRight,
  CheckCircle,
  Loader2,
  UploadCloud,
  FileCheck2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ContaBancaria = {
  id: number;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
};

type ConciliacaoListItem = {
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

type LancamentoVinculavel = {
  id: number;
  tipo: string;
  descricao: string | null;
  parceiro_nome: string | null;
  valor: string | number;
  vencimento: string;
  status: string;
};

type ImportarExtratoResponse = {
  extrato_id: number;
  conta_id: number;
  total_linhas: number;
  status: string;
};

// ─── VincularModal ────────────────────────────────────────────────────────────

function VincularModal({
  linhaId,
  extratoId,
  valorExtratoAbs,
  onClose,
  onSuccess,
}: {
  linhaId: number;
  extratoId: number;
  valorExtratoAbs: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selecionados, setSelecionados] = useState<number[]>([]);

  const { data: lancamentos = [], isLoading } = useQuery<LancamentoVinculavel[]>({
    queryKey: ["lancamentos-vinculaveis", linhaId, search],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("linha_id", String(linhaId));
      params.set("limit", "100");
      if (search.trim()) params.set("search", search.trim());
      return fetchApiData<LancamentoVinculavel[]>(`/conciliacoes/lancamentos-vinculaveis?${params}`);
    },
  });

  const vincularMutation = useMutation({
    mutationFn: () =>
      fetchApiData(`/conciliacoes/linhas/${linhaId}/vincular`, {
        method: "POST",
        body: JSON.stringify({
          lancamentos: selecionados.map((id) => {
            const l = lancamentos.find((x) => x.id === id)!;
            const valorLanc = Number(l.valor);
            return {
              lancamento_id: id,
              valor_vinculado: valorLanc,
              desconto:
                valorLanc > valorExtratoAbs && selecionados.length === 1
                  ? Number((valorLanc - valorExtratoAbs).toFixed(2))
                  : 0,
              acrescimo:
                valorExtratoAbs > valorLanc && selecionados.length === 1
                  ? Number((valorExtratoAbs - valorLanc).toFixed(2))
                  : 0,
            };
          }),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conciliacoes-list"] });
      toast({ title: "Vínculo criado", description: "Lançamento(s) vinculado(s) com sucesso." });
      onSuccess();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Não foi possível vincular.";
      toast({ variant: "destructive", title: "Erro ao vincular", description: msg });
    },
  });

  const totalSelecionado = selecionados.reduce((acc, id) => {
    const l = lancamentos.find((x) => x.id === id);
    return acc + Number(l?.valor ?? 0);
  }, 0);
  const diferenca = valorExtratoAbs - totalSelecionado;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h3 className="font-bold text-white">Vincular Lançamento</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Valor do extrato:{" "}
              <span className="text-primary font-semibold">{formatCurrency(valorExtratoAbs)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-primary/50 transition-colors">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar lançamento ou parceiro..."
              className="bg-transparent outline-none text-sm text-white placeholder:text-muted-foreground w-full"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Selecione um ou mais lançamentos para combinar com o valor do extrato.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Buscando lançamentos…</span>
            </div>
          ) : lancamentos.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum lançamento encontrado.
            </div>
          ) : (
            lancamentos.map((l) => {
              const sel = selecionados.includes(l.id);
              const isCR = l.tipo === "CR";
              return (
                <label
                  key={l.id}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${sel ? "bg-primary/10" : "hover:bg-white/5"}`}
                >
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() =>
                      setSelecionados((s) =>
                        s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id],
                      )
                    }
                    className="accent-primary w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{l.descricao ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.parceiro_nome ?? "Sem parceiro"} · Venc:{" "}
                      {l.vencimento
                        ? new Date(l.vencimento + "T00:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold shrink-0 ${isCR ? "text-teal-400" : "text-destructive"}`}
                  >
                    {formatCurrency(Number(l.valor))}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {selecionados.length > 0 && (
          <div className="p-4 border-t border-white/5 bg-primary/5">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Total selecionado:</span>
              <span className="font-bold text-white">{formatCurrency(totalSelecionado)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Diferença:</span>
              <span
                className={`font-bold ${diferenca === 0 ? "text-success" : diferenca > 0 ? "text-warning" : "text-destructive"}`}
              >
                {diferenca === 0
                  ? "✓ Valores iguais"
                  : diferenca > 0
                    ? `+${formatCurrency(diferenca)} (sobra)`
                    : `-${formatCurrency(Math.abs(diferenca))} (desconto/juros)`}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3 p-5 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => vincularMutation.mutate()}
            disabled={selecionados.length === 0 || vincularMutation.isPending}
            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {vincularMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {vincularMutation.isPending ? "Vinculando…" : "Confirmar Vínculo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ImportarModal ────────────────────────────────────────────────────────────

function ImportarModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (extratoId: number) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contaSelecionada, setContaSelecionada] = useState<number | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);

  const { data: contas = [], isLoading: loadingContas } = useQuery<ContaBancaria[]>({
    queryKey: ["contas-bancarias"],
    queryFn: () => fetchApiData<ContaBancaria[]>("/contas?limit=100"),
  });

  const importarMutation = useMutation({
    mutationFn: async () => {
      if (!contaSelecionada || !arquivo) throw new Error("Selecione a conta e o arquivo.");
      const formData = new FormData();
      formData.append("conta_id", String(contaSelecionada));
      formData.append("arquivo", arquivo);
      const baseUrl = (import.meta as any).env?.VITE_API_URL ?? "";
      const res = await fetch(`${baseUrl}/api/conciliacoes/importar`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.message ?? "Erro ao importar extrato.");
      }
      return res.json() as Promise<ImportarExtratoResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Extrato importado",
        description: `${data.total_linhas} linha(s) carregada(s) com sucesso.`,
      });
      onImported(data.extrato_id);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Não foi possível importar o extrato.";
      toast({ variant: "destructive", title: "Erro na importação", description: msg });
    },
  });

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) setArquivo(file);
  }

  const podeProsseguir = !!contaSelecionada && !!arquivo && !importarMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Importar Extrato</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
              Selecione a Conta Bancária *
            </label>
            {loadingContas ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando contas…
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {contas.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      contaSelecionada === c.id
                        ? "border-primary bg-primary/10"
                        : "border-white/10 hover:border-white/20 bg-white/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name="conta"
                      value={c.id}
                      checked={contaSelecionada === c.id}
                      onChange={() => setContaSelecionada(c.id)}
                      className="accent-primary"
                    />
                    <div>
                      <p className="font-semibold text-white text-sm">{c.nome}</p>
                      {(c.agencia || c.conta) && (
                        <p className="text-xs text-muted-foreground">
                          {c.agencia ? `Ag: ${c.agencia}` : ""}
                          {c.agencia && c.conta ? " · " : ""}
                          {c.conta ? `CC: ${c.conta}` : ""}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Arquivo OFX / CSV *
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                arquivo
                  ? "border-success/50 bg-success/5"
                  : "border-white/10 hover:border-primary/40 hover:bg-primary/5"
              }`}
            >
              {arquivo ? (
                <div className="flex flex-col items-center gap-2">
                  <FileCheck2 className="w-8 h-8 text-success" />
                  <p className="text-sm font-medium text-white">{arquivo.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(arquivo.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArquivo(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remover arquivo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Arraste o arquivo aqui ou clique para selecionar
                  </p>
                  <p className="text-xs text-muted-foreground/60">Formatos aceitos: .OFX, .CSV</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ofx,.csv,.OFX,.CSV"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setArquivo(file);
              }}
            />
          </div>
        </div>

        <div className="flex gap-3 p-6 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!podeProsseguir}
            onClick={() => importarMutation.mutate()}
            className="flex-1 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {importarMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronsRight className="w-4 h-4" />
            )}
            {importarMutation.isPending ? "Importando…" : "Carregar Extrato"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function ConciliacaoList() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showImportar, setShowImportar] = useState(false);
  const [vincularLinha, setVincularLinha] = useState<{
    linhaId: number;
    extratoId: number;
    valorAbs: number;
  } | null>(null);
  const [dateStart, setDateStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));

  const { data: conciliacoes = [], isLoading, refetch } = useQuery<ConciliacaoListItem[]>({
    queryKey: ["conciliacoes-list", dateStart, dateEnd],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (dateStart) params.set("data_inicio", dateStart);
      if (dateEnd) params.set("data_fim", dateEnd);
      return fetchApiData<ConciliacaoListItem[]>(`/conciliacoes?${params}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (conciliacaoId: number) =>
      fetchApiData(`/conciliacoes/${conciliacaoId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conciliacoes-list"] });
      toast({ title: "Conciliação removida com sucesso." });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Não foi possível remover.";
      toast({ variant: "destructive", title: "Erro", description: msg });
    },
  });

  return (
    <div className="space-y-6">
      {showImportar && (
        <ImportarModal
          onClose={() => setShowImportar(false)}
          onImported={(extratoId) => {
            setShowImportar(false);
            setLocation(`/conciliacao/extrato/${extratoId}`);
          }}
        />
      )}

      {vincularLinha && (
        <VincularModal
          linhaId={vincularLinha.linhaId}
          extratoId={vincularLinha.extratoId}
          valorExtratoAbs={vincularLinha.valorAbs}
          onClose={() => setVincularLinha(null)}
          onSuccess={() => setVincularLinha(null)}
        />
      )}

      <PageHeader
        title="Conciliação Bancária"
        description="Importe extratos e concilie com seus lançamentos financeiros"
        actions={
          <div className="flex items-center gap-3">
            <DateRangePicker
              startDate={dateStart}
              endDate={dateEnd}
              onChange={(start, end) => {
                setDateStart(start);
                setDateEnd(end);
              }}
            />
            <button
              type="button"
              onClick={() => setShowImportar(true)}
              className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-success/25"
            >
              <Plus className="w-4 h-4" /> Importar Extrato
            </button>
          </div>
        }
      />

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/20 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-medium text-center w-32">Status</th>
                <th className="px-6 py-4 font-medium">Banco / Conta</th>
                <th className="px-6 py-4 font-medium">Período</th>
                <th className="px-6 py-4 font-medium text-center text-success">Conciliados</th>
                <th className="px-6 py-4 font-medium text-center text-muted-foreground">Ignorados</th>
                <th className="px-6 py-4 font-medium text-center text-warning">Pendentes</th>
                <th className="px-6 py-4 font-medium text-center">Total</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="mt-2 text-xs">Carregando conciliações…</p>
                  </td>
                </tr>
              ) : conciliacoes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground text-xs">
                    Nenhuma conciliação encontrada. Use "Importar Extrato" para começar.
                  </td>
                </tr>
              ) : (
                conciliacoes.map((c) => {
                  const periodo =
                    c.periodo_inicio && c.periodo_fim
                      ? `${new Date(c.periodo_inicio + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(c.periodo_fim + "T00:00:00").toLocaleDateString("pt-BR")}`
                      : "—";

                  return (
                    <tr key={c.conciliacao_id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                            c.status === "conciliado"
                              ? "bg-success/20 text-success"
                              : "bg-white/10 text-muted-foreground"
                          }`}
                        >
                          {c.status === "conciliado" ? "Conciliado" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{c.conta_nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.arquivo_nome ?? "—"}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{periodo}</td>
                      <td className="px-6 py-4 text-center font-semibold text-success">
                        {c.resumo_conciliados ?? 0}
                      </td>
                      <td className="px-6 py-4 text-center text-muted-foreground">
                        {c.resumo_ignorados ?? 0}
                      </td>
                      <td className="px-6 py-4 text-center font-semibold text-warning">
                        {c.resumo_pendentes ?? 0}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-white">
                        {c.resumo_total ?? 0}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setLocation(`/conciliacao/extrato/${c.extrato_id}`)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-medium transition-colors"
                          >
                            Continuar <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Excluir esta conciliação?"))
                                deleteMutation.mutate(c.conciliacao_id);
                            }}
                            className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
