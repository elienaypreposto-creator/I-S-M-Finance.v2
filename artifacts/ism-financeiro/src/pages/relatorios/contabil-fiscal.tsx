import {tenantQueryKey} from "@/lib/tenant-query";
import { useMemo } from "react";
import { PageHeader } from "@/components/shared/page-header";
import {
  Download,
  FileText,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDinheiro } from "@/components/conta/saldos-visiveis";
import { useQuery } from "@tanstack/react-query";
import { fetchApiData } from "@/lib/api-config";
import { fmtDate } from "@/lib/export";
import { SelectCampo } from "@/components/ui/select-campo";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { FOCO_VISIVEL, useParametrosUrl } from "@/components/shared/filtros";
import {
  DESCRICAO_ABERTURA,
  MESES_LONGOS,
  avisoInicioConta,
  documentoDaLinha,
  itensDoExtrato,
  periodoDoMes,
  rotuloPeriodo,
  textoVinculo,
  type AberturaContaExtrato,
  type ExtratoContaResposta,
  type LinhaExtrato,
  type TipoFiltroExtrato,
} from "@/lib/extrato-conta";
import { exportarExtratoPdf, exportarExtratoXlsx } from "@/lib/export-extrato-conta";

// ─── Constantes ────────────────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + 2 - i);
const PAGE_SIZE = 50;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

type ContaOpcao = { id: number; nome: string; status?: string };

/** Mês da URL (1–12); inválido ou ausente cai no mês atual. */
function lerMes(valor: string): number {
  const n = Number.parseInt(valor, 10);
  return n >= 1 && n <= 12 ? n : new Date().getMonth() + 1;
}

/** Ano da URL (4 dígitos); inválido ou ausente cai no ano atual. */
function lerAno(valor: string): number {
  return /^\d{4}$/.test(valor) ? Number(valor) : CURRENT_YEAR;
}

/** Tipo da URL (?tipo=CR|CP); ausente = ambos. */
function lerTipo(valor: string): TipoFiltroExtrato {
  return valor === "CR" || valor === "CP" ? valor : "ambos";
}

const TH = "px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs";

// ─── Página ────────────────────────────────────────────────────────────────────
export default function ContabilFiscal() {
  const dinheiro = useDinheiro();

  // Opções do filtro "Conta bancária" (mesma chave de cache da tela de lançamentos).
  const { data: contas = [] } = useQuery({
    queryKey: tenantQueryKey("contas-bancarias-filtro"),
    queryFn: () => fetchApiData<ContaOpcao[]>("/contas-bancarias"),
    staleTime: 60_000,
  });

  // Conta, período (mês/ano ou intervalo), tipo e página na URL
  // (?conta_id=3&mes=10&ano=2026 | ?data_inicio=2026-10-05&data_fim=2026-10-20, &tipo=CR&pagina=2).
  const { ler, atualizar, pagina, irParaPagina } = useParametrosUrl();
  const mesFiltro = lerMes(ler("mes"));
  const anoFiltro = lerAno(ler("ano"));
  const tipoFiltro = lerTipo(ler("tipo"));
  const contaId = /^\d+$/.test(ler("conta_id")) ? ler("conta_id") : "";

  const inicioUrl = ler("data_inicio");
  const fimUrl = ler("data_fim");
  const modoIntervalo = DATA_ISO.test(inicioUrl) && DATA_ISO.test(fimUrl) && inicioUrl <= fimUrl;
  const doMes = periodoDoMes(anoFiltro, mesFiltro);
  const dataInicio = modoIntervalo ? inicioUrl : doMes.inicio;
  const dataFim = modoIntervalo ? fimUrl : doMes.fim;

  const anosOpcoes = useMemo(
    () => (YEARS.includes(anoFiltro) ? YEARS : [...YEARS, anoFiltro].sort((a, b) => b - a)),
    [anoFiltro],
  );

  const params = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
  if (tipoFiltro !== "ambos") params.set("tipo", tipoFiltro);
  if (contaId) params.set("conta_id", contaId);

  const { data, isLoading, isError } = useQuery<ExtratoContaResposta>({
    queryKey: tenantQueryKey("contabil-fiscal-movimentacoes", dataInicio, dataFim, tipoFiltro, contaId),
    queryFn: () =>
      fetchApiData<ExtratoContaResposta>(`/relatorios/contabil-fiscal/movimentacoes?${params.toString()}`),
  });

  const linhas = data?.linhas ?? [];
  const umaConta = data?.modo === "conta";
  const contaNome = data?.conta?.nome ?? (contaId ? contas.find((c) => String(c.id) === contaId)?.nome : undefined);
  const periodoTexto = rotuloPeriodo(dataInicio, dataFim);
  // Movimentos + linha "Saldo de abertura" (conta que começa dentro do período).
  const itens = itensDoExtrato(linhas, data?.resumo.abertura_conta);
  const saldoAbertura = data?.resumo.saldo_abertura ?? 0;
  const aviso = data ? avisoInicioConta(data, dinheiro) : null;

  // ── Paginação ────────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(itens.length / PAGE_SIZE));
  // Clamp: garante que a página atual não ultrapasse o total após mudança de filtro
  const paginaAtual = Math.min(pagina, totalPages);
  const paginados = itens.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);

  // Ao mudar filtro, volta para página 1 (o atualizar da URL já remove ?pagina)
  const mudarMes = (mes: number, ano: number) =>
    atualizar({ mes: String(mes), ano: String(ano), data_inicio: null, data_fim: null });
  const usarIntervalo = () => atualizar({ data_inicio: dataInicio, data_fim: dataFim });
  const usarMes = () => {
    const [a, m] = dataInicio.split("-");
    mudarMes(Number(m), Number(a));
  };
  const handleTipo = (v: TipoFiltroExtrato) => atualizar({ tipo: v === "ambos" ? null : v });
  const handleConta = (v: string) => atualizar({ conta_id: v || null });

  const anuncio = isLoading
    ? ""
    : `${linhas.length} ${linhas.length === 1 ? "lançamento encontrado" : "lançamentos encontrados"}`;

  const podeExportar = !isLoading && !isError && data != null && (linhas.length > 0 || umaConta);

  const naoConciliados = data?.nao_conciliados;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório Contábil / Fiscal"
        description="Movimentações por conta para conferir com o extrato do banco"
        actions={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => data && exportarExtratoPdf(data)}
              disabled={!podeExportar}
              title="Exportar PDF"
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" /> Exportar PDF
            </button>
            <button
              type="button"
              onClick={() => data && exportarExtratoXlsx(data)}
              disabled={!podeExportar}
              title="Exportar XLSX"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
          </div>
        }
      />

      {/* Barra: conta e período à esquerda; tipo à direita */}
      <div className="glass-panel rounded-2xl border border-white/5">
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="contabil-conta" className="sr-only">Conta bancária</label>
            <SelectCampo
              id="contabil-conta"
              value={contaId}
              onChange={handleConta}
              permitirVazio
              placeholder="Todas as contas"
              className="w-[16em] max-w-full"
              opcoes={contas.map((c) => ({
                value: String(c.id),
                label: c.status && c.status !== "ativo" ? `${c.nome} (${c.status})` : c.nome,
              }))}
            />
            <div className="flex gap-1 p-0.5 bg-black/20 rounded-lg border border-white/5" role="group" aria-label="Tipo de período">
              {([["mes", "Mês"], ["intervalo", "Intervalo"]] as const).map(([v, rotulo]) => {
                const ativo = (v === "intervalo") === modoIntervalo;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => (ativo ? undefined : v === "intervalo" ? usarIntervalo() : usarMes())}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-bold transition-colors",
                      ativo ? "bg-primary text-white" : "text-muted-foreground hover:text-white",
                      FOCO_VISIVEL,
                    )}
                  >
                    {rotulo}
                  </button>
                );
              })}
            </div>
            {modoIntervalo ? (
              <DateRangePicker
                startDate={dataInicio}
                endDate={dataFim}
                onChange={(start, end) =>
                  start && end ? atualizar({ data_inicio: start, data_fim: end }) : usarMes()
                }
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
                <label htmlFor="contabil-mes" className="sr-only">Mês</label>
                <SelectCampo
                  id="contabil-mes"
                  value={String(mesFiltro)}
                  onChange={(v) => mudarMes(Number(v), anoFiltro)}
                  className="w-[12em]"
                  opcoes={MESES_LONGOS.map((m, i) => ({value: String(i + 1), label: m}))}
                />
                <label htmlFor="contabil-ano" className="sr-only">Ano</label>
                <SelectCampo
                  id="contabil-ano"
                  value={String(anoFiltro)}
                  onChange={(v) => mudarMes(mesFiltro, Number(v))}
                  className="w-[8.5em]"
                  opcoes={anosOpcoes.map((y) => ({value: String(y), label: String(y)}))}
                />
              </div>
            )}
          </div>
          <div className="flex gap-1 p-0.5 bg-black/20 rounded-lg border border-white/5" role="group" aria-label="Tipo de lançamento">
            {(["ambos", "CR", "CP"] as TipoFiltroExtrato[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={tipoFiltro === v}
                onClick={() => handleTipo(v)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-bold transition-colors",
                  tipoFiltro === v
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-white",
                  FOCO_VISIVEL,
                )}
              >
                {v === "ambos" ? "Todos" : v === "CR" ? "Entradas" : "Saídas"}
              </button>
            ))}
          </div>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{anuncio}</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Carregando movimentações…</span>
        </div>
      )}

      {/* Erro */}
      {isError && !isLoading && (
        <div className="glass-panel rounded-2xl p-5 border border-destructive/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-muted-foreground">
            Erro ao carregar dados. Tente novamente.
          </p>
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {/* ── Resumo de saldos ── */}
          <section aria-label="Resumo do período" className="space-y-3">
            <div className={cn("grid grid-cols-2 gap-3", saldoAbertura !== 0 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
              <CardResumo
                titulo="Saldo inicial"
                detalhe={`Fim de ${fmtDate(data.resumo.data_saldo_inicial)}`}
                valor={dinheiro(data.resumo.saldo_inicial)}
                cor={data.resumo.saldo_inicial < 0 ? "text-destructive" : "text-white"}
              />
              {saldoAbertura !== 0 && (
                <CardResumo
                  titulo="Saldo de abertura"
                  detalhe={
                    data.resumo.abertura_conta
                      ? `Início da conta em ${fmtDate(data.resumo.abertura_conta.data)}`
                      : "Contas que começam no período"
                  }
                  valor={dinheiro(saldoAbertura)}
                  cor={saldoAbertura < 0 ? "text-destructive" : "text-white"}
                />
              )}
              <CardResumo titulo="Entradas" detalhe={periodoTexto} valor={dinheiro(data.resumo.entradas)} cor="text-teal-400" />
              <CardResumo titulo="Saídas" detalhe={periodoTexto} valor={dinheiro(data.resumo.saidas)} cor="text-destructive" />
              <CardResumo
                titulo="Saldo final"
                detalhe={`Fim de ${fmtDate(dataFim)}`}
                valor={dinheiro(data.resumo.saldo_final)}
                cor={data.resumo.saldo_final < 0 ? "text-destructive" : "text-success"}
              />
            </div>

            {/* Período antes da data de início da conta: saldo desconhecido (zero) */}
            {aviso && (
              <div className="glass-panel rounded-2xl p-4 border border-amber-400/30 flex items-start gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                <p className="text-muted-foreground">{aviso}</p>
              </div>
            )}

            {/* Indicador de divergência: o que ainda não tem vínculo com o extrato importado */}
            {naoConciliados && (
              <div
                className={cn(
                  "glass-panel rounded-2xl px-4 py-3 border flex flex-wrap items-center gap-x-4 gap-y-1 text-sm",
                  naoConciliados.quantidade > 0 ? "border-amber-400/30" : "border-emerald-400/20",
                )}
              >
                {naoConciliados.quantidade > 0 ? (
                  <>
                    <span className="flex items-center gap-2 font-bold text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {naoConciliados.quantidade} lançamento{naoConciliados.quantidade === 1 ? "" : "s"} não conciliado{naoConciliados.quantidade === 1 ? "" : "s"}
                    </span>
                    <span className="text-muted-foreground">
                      {dinheiro(naoConciliados.total)} sem vínculo com o extrato importado
                      {naoConciliados.entradas > 0 && naoConciliados.saidas > 0
                        ? ` (${dinheiro(naoConciliados.entradas)} em entradas, ${dinheiro(naoConciliados.saidas)} em saídas)`
                        : ""}
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-2 font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {linhas.length > 0 ? "Todos os lançamentos do período estão conciliados" : "Nenhum lançamento no período"}
                  </span>
                )}
              </div>
            )}

            {umaConta && data.resumo.confere === false && (
              <div className="glass-panel rounded-2xl p-4 border border-destructive/30 flex items-start gap-3 text-sm">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-muted-foreground">
                  O saldo final pelas linhas ({dinheiro(data.resumo.saldo_final)}) difere do saldo da conta em{" "}
                  {fmtDate(dataFim)} ({dinheiro(data.resumo.saldo_final_sistema ?? 0)}). Avise o suporte.
                </p>
              </div>
            )}
          </section>

          {/* ── Todas as contas: resumo por conta ── */}
          {!umaConta && (data.contas?.length ?? 0) > 0 && (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/5">
                <h3 className="font-bold text-white text-sm">Resumo por conta — {periodoTexto}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Escolha uma conta para ver o saldo após cada lançamento e conferir com o PDF do banco.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className={cn(TH, "text-left")}>Conta</th>
                      <th className={cn(TH, "text-right")}>Saldo inicial</th>
                      <th className={cn(TH, "text-right")}>Entradas</th>
                      <th className={cn(TH, "text-right")}>Saídas</th>
                      <th className={cn(TH, "text-right")}>Saldo final</th>
                      <th className={cn(TH, "text-right")}>Não conciliados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.contas!.map((c) => (
                      <tr key={c.conta_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleConta(String(c.conta_id))}
                            className={cn("text-white font-medium hover:text-primary underline-offset-2 hover:underline", FOCO_VISIVEL)}
                          >
                            {c.nome}
                          </button>
                          {c.banco && <span className="block text-xs text-muted-foreground">{c.banco}</span>}
                          {c.antes_do_inicio && c.inicio_conta && (
                            <span className="block text-[11px] text-amber-300/90">Começa em {fmtDate(c.inicio_conta)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-white/80">
                          {dinheiro(c.saldo_inicial)}
                          {(c.saldo_abertura ?? 0) !== 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              + {dinheiro(c.saldo_abertura ?? 0)} de abertura
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-teal-400">{dinheiro(c.entradas)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-destructive">{dinheiro(c.saidas)}</td>
                        <td className={cn("px-4 py-3 text-right whitespace-nowrap font-bold", c.saldo_final < 0 ? "text-destructive" : "text-white")}>
                          {dinheiro(c.saldo_final)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                          {c.nao_conciliados.quantidade > 0 ? (
                            <span className="text-amber-300">
                              {c.nao_conciliados.quantidade} · {dinheiro(c.nao_conciliados.total)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Movimentações ── */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <h3 className="font-bold text-white text-sm">
                {contaNome ?? "Todas as contas"} — {periodoTexto} — {linhas.length} lançamento{linhas.length !== 1 ? "s" : ""}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ordem por data de pagamento{umaConta ? "; saldo da conta após cada linha" : ""}.
                {tipoFiltro !== "ambos" ? " O filtro de tipo só esconde linhas: saldos e totais são da conta inteira." : ""}
                {totalPages > 1 &&
                  ` Página ${paginaAtual}/${totalPages} · Exibindo ${(paginaAtual - 1) * PAGE_SIZE + 1}–${Math.min(paginaAtual * PAGE_SIZE, itens.length)} de ${itens.length}.`}
              </p>
            </div>

            {itens.length === 0 ? (
              <div className="py-14 text-center text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhum lançamento quitado em {periodoTexto}.</p>
                <p className="text-xs mt-1 opacity-70">
                  Entram os lançamentos com status pago, recebido ou pago parcial, pela data de pagamento.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5">
                      <tr>
                        <th className={cn(TH, "text-left")}>Data</th>
                        {!umaConta && <th className={cn(TH, "text-left")}>Conta</th>}
                        <th className={cn(TH, "text-left")}>Descrição</th>
                        <th className={cn(TH, "text-left")}>Parceiro</th>
                        <th className={cn(TH, "text-left")}>Categoria</th>
                        <th className={cn(TH, "text-left")}>Documento</th>
                        <th className={cn(TH, "text-right")}>Entrada</th>
                        <th className={cn(TH, "text-right")}>Saída</th>
                        {umaConta && <th className={cn(TH, "text-right")}>Saldo</th>}
                        <th className={cn(TH, "text-left")}>Conciliação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginados.map((item) =>
                        item.tipo === "abertura" ? (
                          <LinhaAbertura key="abertura" abertura={item.abertura} umaConta={umaConta} dinheiro={dinheiro} />
                        ) : (
                          <LinhaMovimento key={item.linha.id} linha={item.linha} umaConta={umaConta} dinheiro={dinheiro} />
                        ),
                      )}
                    </tbody>
                    <tfoot className="bg-white/5 border-t border-white/10">
                      <tr>
                        <td colSpan={umaConta ? 5 : 6} className="px-4 py-3 font-bold text-white text-sm">
                          TOTAIS DO PERÍODO
                        </td>
                        <td className="px-4 py-3 text-right text-teal-400 font-bold text-xs whitespace-nowrap">
                          {dinheiro(data.resumo.entradas)}
                        </td>
                        <td className="px-4 py-3 text-right text-destructive font-bold text-xs whitespace-nowrap">
                          {dinheiro(data.resumo.saidas)}
                        </td>
                        {umaConta && (
                          <td className="px-4 py-3 text-right text-white font-bold text-xs whitespace-nowrap">
                            {dinheiro(data.resumo.saldo_final)}
                          </td>
                        )}
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* ── Paginação ── */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                    <span className="text-xs text-muted-foreground">
                      Página {paginaAtual} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => irParaPagina(Math.max(1, paginaAtual - 1))}
                        disabled={paginaAtual <= 1}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        aria-label="Página anterior"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {/* Números de página (máx. 5 visíveis) */}
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const offset = Math.max(
                          0,
                          Math.min(totalPages - 5, paginaAtual - 3),
                        );
                        const p = offset + i + 1;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => irParaPagina(p)}
                            aria-current={p === paginaAtual ? "page" : undefined}
                            className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                              p === paginaAtual
                                ? "bg-primary text-white"
                                : "bg-white/5 hover:bg-white/10 text-muted-foreground"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => irParaPagina(Math.min(totalPages, paginaAtual + 1))}
                        disabled={paginaAtual >= totalPages}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        aria-label="Próxima página"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componentes ───────────────────────────────────────────────────────────────

function CardResumo({ titulo, detalhe, valor, cor }: { titulo: string; detalhe: string; valor: string; cor: string }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 border border-white/5 min-w-0">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn("text-lg font-bold tracking-tight truncate", cor)}>{valor}</p>
      <p className="text-[11px] text-muted-foreground/80 truncate">{detalhe}</p>
    </div>
  );
}

/** Saldo inicial cadastrado entrando no saldo corrido na data de início da conta. */
function LinhaAbertura({
  abertura,
  umaConta,
  dinheiro,
}: {
  abertura: AberturaContaExtrato;
  umaConta: boolean;
  dinheiro: (v: number) => string;
}) {
  return (
    <tr className="bg-primary/5">
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(abertura.data)}</td>
      {!umaConta && <td className="px-4 py-3" />}
      <td className="px-4 py-3 text-white text-sm font-medium" colSpan={4}>
        {DESCRICAO_ABERTURA}: {dinheiro(abertura.valor)}
      </td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3" />
      {umaConta && (
        <td className={cn("px-4 py-3 text-right text-sm font-bold whitespace-nowrap", abertura.saldo_apos < 0 ? "text-destructive" : "text-white")}>
          {dinheiro(abertura.saldo_apos)}
        </td>
      )}
      <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
    </tr>
  );
}

function LinhaMovimento({
  linha: l,
  umaConta,
  dinheiro,
}: {
  linha: LinhaExtrato;
  umaConta: boolean;
  dinheiro: (v: number) => string;
}) {
  const documento = documentoDaLinha(l.tipo_documento, l.numero_documento);
  const vinculo = textoVinculo(l.extrato, dinheiro);
  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
        {l.data_pgto ? fmtDate(l.data_pgto) : "—"}
      </td>
      {!umaConta && (
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{l.conta_bancaria ?? "—"}</td>
      )}
      <td className="px-4 py-3 text-white text-sm max-w-[260px]">
        <span className="block truncate" title={l.descricao ?? undefined}>{l.descricao ?? "—"}</span>
        {l.transferencia && (
          <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide font-bold text-primary/90">
            Transferência entre contas
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-white/90 text-sm whitespace-nowrap">{l.nome_parceiro ?? "—"}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{l.categoria}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{documento || "—"}</td>
      <td className="px-4 py-3 text-right text-sm whitespace-nowrap text-teal-400">
        {l.entrada ? dinheiro(l.entrada) : ""}
      </td>
      <td className="px-4 py-3 text-right text-sm whitespace-nowrap text-destructive">
        {l.saida ? dinheiro(l.saida) : ""}
      </td>
      {umaConta && (
        <td
          className={cn(
            "px-4 py-3 text-right text-sm font-bold whitespace-nowrap",
            (l.saldo_apos ?? 0) < 0 ? "text-destructive" : "text-white",
          )}
        >
          {l.saldo_apos != null ? dinheiro(l.saldo_apos) : "—"}
        </td>
      )}
      <td className="px-4 py-3 text-xs">
        {l.conciliado ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3" /> Conciliado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-bold whitespace-nowrap">
            <AlertTriangle className="w-3 h-3" /> Não conciliado
          </span>
        )}
        {vinculo && (
          <span
            className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground max-w-[240px]"
            title={vinculo}
          >
            <Link2 className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{vinculo}</span>
          </span>
        )}
      </td>
    </tr>
  );
}
