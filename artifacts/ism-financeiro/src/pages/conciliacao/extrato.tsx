import {useMemo, useState, useEffect, useRef} from "react";
import {useLocation} from "wouter";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {formatCurrency, formatDate, cn} from "@/lib/utils";
import {VincularModal, type DraftVincular} from "@/components/conciliacao/vincular-modal";
import {IgnorarLinhaModal, type MotivoIgnorarPayload} from "@/components/conciliacao/ignorar-linha-modal";
import {EditarLancamentoConciliacaoModal} from "@/components/conciliacao/editar-lancamento-modal";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {RequiresPermission} from "@/components/auth/requires-permission";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    FileText,
    Link2,
    Ban,
    CheckCircle2,
    RotateCcw,
    Unlink,
    Pencil,
    Plus,
    X,
    Search,
    Copy,
    Trash2,
    Sparkles,
    RefreshCw,
    Filter,
    Download,
    ChevronDown,
} from "lucide-react";
import {invalidateRelated} from "@/App";
import {formatValorBrInput, brMoneyDisplayToApiString} from "@/validations/lancamentos.schema";
import {RegraConciliacaoModal} from "@/components/conciliacao/regra-conciliacao-modal";

type ExtratoDetalheExtrato = {
    id: number;
    conta_id: number;
    conta_nome: string | null;
    status: string;
    arquivo_nome: string | null;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    total_linhas: number;
    total_creditos: string | number;
    total_debitos: string | number;
    saldo_final_banco: string | number | null;
    saldo_banco_data: string | null;
    created_at: string;
};

type ConciliacaoResumo = {
    id: number;
    status: string;
    resumo_conciliados: number;
    resumo_ignorados: number;
    resumo_pendentes: number;
    resumo_total: number;
    resumo_classificadas_automaticamente?: number;
};

type VinculacaoDetalhe = {
    /** id da linha em itens_conciliacao_lancamentos - necessário pra editar/remover o vínculo individualmente (RN-G7/RN-I7). Opcional: se o backend ainda não devolver isso, os botões caem no fallback "desfazer todos". */
    vinculo_id?: number;
    lancamento_id: number;
    descricao: string | null;
    tipo: string;
    status: string;
    /** Flag do título residual (DEF-08) — não inferir por status pendente. */
    is_residuo_parcial?: boolean;
    valor_vinculado: string | number;
    desconto: string | number;
    acrescimo?: string | number;
    juros_multa?: string | number;
    /** Vencimento do residual = origem (imutável — Decisão nº 3). */
    vencimento?: string | null;
    /** Card 76: residual marcado no vincular mas ainda não materializado em
     *  lancamentosTable — só nasce como lançamento real ao Salvar/Conciliar. */
    residuo_pendente?: { valor: string | number } | null;
    /** Regra de Ouro (Fase 8): true quando este card representa um rascunho
     *  em memória (ainda não persistido) - não tem vinculo_id real, então
     *  não pode ser editado (desconto/juros) até o Salvar/Conciliar. */
    _local?: boolean;
};

export type LinhaDetalhe = {
    linha_id: number;
    tipo_movimento: string;
    descricao: string | null;
    valor: string | number;
    data_movimento: string | null;
    documento: string | null;
    status: string;
    valor_vinculado_total: string | number;
    valor_saldo: string | number;
    saldo_pos_linha: string | number | null;
    vinculacoes: VinculacaoDetalhe[];
    /** Card 48 / FEAT-03 */
    regra_id?: number | null;
    classificacao_automatica?: boolean;
    regra_texto_gatilho?: string | null;
    regra_criar_lancamento?: boolean | null;
};

type DiagnosticoSaldoInicial = {
    data_referencia: string;
    extrato_anterior_id: number;
    saldo_sistema: number;
    saldo_extrato_anterior: number;
    diferenca: number;
    bate: boolean;
};

type DiagnosticoSaldo = {
    data_referencia: string;
    saldo_sistema: number;
    saldo_banco: number | null;
    diferenca: number | null;
    bate: boolean | null;
    diagnostico: string;
    linhas_ignoradas_valor: number;
    linhas_ignoradas_explicam: boolean;
    saldo_inicial: DiagnosticoSaldoInicial | null;
} | null;

type ExtratoDetalheResponse = {
    extrato: ExtratoDetalheExtrato;
    conciliacao: ConciliacaoResumo;
    linhas: LinhaDetalhe[];
    // OBS: o diagnóstico de saldo continua vindo nesta resposta, mas deixou
    // de ser exibido aqui — a exibição foi movida para a tela Home/Dashboard
    // (ver Dashboard.tsx). Mantido no tipo para não quebrar o contrato com o
    // backend; se a Home passar a ter um endpoint próprio, este campo pode
    // ser removido daqui.
    diagnostico: DiagnosticoSaldo;
};

function statusExtratoBadge(status: string) {
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

function statusLinhaBadge(status: string) {
    switch (status) {
        case "vinculado":
            return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
        case "ignorado":
            return "bg-white/10 text-muted-foreground border-white/15";
        default:
            return "bg-amber-500/15 text-amber-200 border-amber-500/25";
    }
}

/**
 * RN-D2: cor semântica por natureza — crédito/entrada = VERDE, débito/saída
 * = VERMELHO. O código anterior usava teal/orange; o card pede explicitamente
 * vermelho/verde, então padronizei aqui (não em todo o app, só neste módulo).
 */
function corNaturezaBadge(isCredito: boolean) {
    return isCredito
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
        : "bg-red-500/15 text-red-300 border-red-500/25";
}

function corNaturezaTexto(isCredito: boolean) {
    return isCredito ? "text-emerald-300" : "text-red-300";
}

/**
 * Regra de Ouro (Fase 8): nenhuma ação de conciliação (vincular, ignorar,
 * desfazer, reverter-ignorar) é persistida no banco no momento do clique -
 * cada uma fica guardada como um "rascunho" local, e só é enviada ao
 * backend (POST /conciliacoes/:id/salvar) quando o usuário clica em
 * Salvar/Conciliar. Por linha, a sequência de rascunhos só pode ser:
 *   [] | [ignorar]
 *   | [vincular...]
 *   | [desfazer, vincular...]
 *   | [reverter_ignorar, vincular...]
 * ("Desfazer"/"Reverter ignorar" sempre resetam a lista para conter só a
 * si mesmos, descartando rodadas de vincular rascunhadas antes deles - ver
 * handlers dos botões "Desfazer vínculos"/"Reverter". Depois disso, novas
 * rodadas de "Vincular" na MESMA linha voltam a ser empilhadas normalmente.)
 */
type DraftAcaoVincular = { tipo: "vincular"; draft: DraftVincular };
type DraftAcaoIgnorar = { tipo: "ignorar"; motivoCodigo?: string; motivo?: string };
type DraftAcaoDesfazer = { tipo: "desfazer" };
type DraftAcaoReverterIgnorar = { tipo: "reverter_ignorar" };
type DraftAcao = DraftAcaoVincular | DraftAcaoIgnorar | DraftAcaoDesfazer | DraftAcaoReverterIgnorar;

type LinhaEfetiva = LinhaDetalhe & {
    /** true quando existe QUALQUER rascunho local pendente para esta linha
     *  (ainda não enviado ao Salvar/Conciliar). */
    _draftAtivo: boolean;
    /** Soma (em centavos) do que rodadas de vincular rascunhadas NESTA linha
     *  já cobriram localmente - repassado ao modal como jaVinculadoLocalCents
     *  para a próxima rodada de preview calcular o saldo certo. */
    _jaVinculadoLocalCents: number;
    /** true quando um "Desfazer" desta linha já está rascunhado - o preview
     *  de novas rodadas de vincular deve ignorar os vínculos reais. */
    _ignorarVinculosReais: boolean;
};

function centsFromReais(v: string | number | null | undefined): number {
    return Math.round(Math.abs(Number(v) || 0) * 100);
}

function reaisFromCents(cents: number): number {
    return cents / 100;
}

/** Soma (em centavos) do que cada rodada de vincular acrescentou LOCALMENTE
 *  além do que já existia de fato no banco no momento em que foi calculada -
 *  a base real é constante durante a sessão porque nada é persistido antes
 *  do Salvar (ver contexto_rascunho.ja_vinculado_local_cents no backend). */
function somaRoundsNovoCents(rounds: DraftVincular[], realBaseCents: number): number {
    return rounds.reduce((acc, r) => acc + Math.round(r.totalConciliado * 100) - realBaseCents, 0);
}

/** Mescla a linha vinda do servidor com o(s) rascunho(s) locais desta
 *  sessão (Regra de Ouro) - produz a linha "efetiva" que a tela exibe. */
function mergeLinhaComDraft(linha: LinhaDetalhe, draft: DraftAcao[] | undefined): LinhaEfetiva {
    if (!draft || draft.length === 0) {
        return {...linha, _draftAtivo: false, _jaVinculadoLocalCents: 0, _ignorarVinculosReais: false};
    }

    const primeiro = draft[0]!;

    if (primeiro.tipo === "ignorar") {
        return {
            ...linha,
            status: "ignorado",
            _draftAtivo: true,
            _jaVinculadoLocalCents: 0,
            _ignorarVinculosReais: false,
        };
    }

    // A partir daqui: começa com "desfazer" ou "reverter_ignorar" (ambos
    // "zeram" a base real da linha, opcionalmente seguidos de rodadas de
    // "vincular") OU é só uma sequência de rodadas de "vincular".
    const resetaBaseReal = primeiro.tipo === "desfazer" || primeiro.tipo === "reverter_ignorar";
    const rounds = draft
        .filter((a): a is DraftAcaoVincular => a.tipo === "vincular")
        .map((a) => a.draft);

    const extratoTotalCents = centsFromReais(linha.valor);
    const realBaseCents = resetaBaseReal ? 0 : centsFromReais(linha.valor_vinculado_total);
    const localNovoCents = somaRoundsNovoCents(rounds, realBaseCents);
    const totalEfetivoCents = realBaseCents + localNovoCents;
    const saldoEfetivoCents = Math.max(0, extratoTotalCents - totalEfetivoCents);

    const vinculacoesBase: VinculacaoDetalhe[] = resetaBaseReal ? [] : linha.vinculacoes;
    const vinculacoesLocais: VinculacaoDetalhe[] = rounds.flatMap((r) =>
        r.itens.map((item) => ({
            lancamento_id: item.lancamento_id,
            descricao: item.descricao,
            tipo: item.tipo,
            status: item.status,
            is_residuo_parcial: false,
            valor_vinculado: item.valor_vinculado,
            desconto: item.desconto,
            juros_multa: item.juros_multa,
            vencimento: item.vencimento,
            residuo_pendente:
                r.residual && r.residual.lancamentoOrigemId === item.lancamento_id
                    ? {valor: r.residual.valor}
                    : null,
            _local: true,
        })),
    );

    const temAlgumVinculo = vinculacoesBase.length > 0 || vinculacoesLocais.length > 0;

    return {
        ...linha,
        status: temAlgumVinculo ? "vinculado" : "pendente",
        vinculacoes: [...vinculacoesBase, ...vinculacoesLocais],
        valor_vinculado_total: reaisFromCents(totalEfetivoCents),
        valor_saldo: reaisFromCents(saldoEfetivoCents),
        _draftAtivo: true,
        _jaVinculadoLocalCents: localNovoCents,
        // Preview de novas rodadas de vincular deve ignorar os vínculos
        // reais quando a base real foi zerada por "desfazer" - já não se
        // aplica a "reverter_ignorar" (uma linha ignorada nunca tem vínculos
        // reais para ignorar, então o flag não faz diferença ali).
        _ignorarVinculosReais: primeiro.tipo === "desfazer",
    };
}

/**
 * Card de lançamento (coluna direita): Desconto / Juros-Multa editáveis (RN-G7).
 * Residual parcial: vencimento = origem, **não editável** (Decisão nº 3).
 * Padding/gaps reduzidos para acompanhar a densidade do protótipo (imagem 2).
 */
function CardLancamento({
                            v,
                            extratoId,
                            linhaId,
                            canEditarLancamento,
                            canDesfazer,
                            onEditarLancamento,
                            onRemoverVinculo,
                        }: {
    v: VinculacaoDetalhe;
    extratoId: string;
    linhaId: number;
    canEditarLancamento: boolean;
    canDesfazer: boolean;
    onEditarLancamento: () => void;
    onRemoverVinculo: () => void;
}) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [editando, setEditando] = useState<null | "desconto" | "juros_multa">(null);
    const [valorEdicao, setValorEdicao] = useState("");

    const jurosOuAcrescimo = v.juros_multa ?? v.acrescimo ?? 0;
    const isCredito = v.tipo === "CR";
    const isResidual = Boolean(v.is_residuo_parcial);
    // Regra de Ouro: rascunho local ainda não tem vinculo_id real - não dá
    // pra editar desconto/juros dele até o Salvar/Conciliar persistir.
    const isLocal = Boolean(v._local);
    const podeEditarEsteVinculo = canEditarLancamento && !isLocal;

    const duplicarMutation = useMutation({
        mutationFn: async () => {
            const original = await fetchApiData<Record<string, unknown>>(`/lancamentos/${v.lancamento_id}`);
            return fetchApiData("/lancamentos", {
                method: "POST",
                body: JSON.stringify({
                    tipo: original.tipo,
                    vencimento: original.vencimento,
                    competencia: original.competencia ?? null,
                    conta_id: original.conta_id ?? null,
                    parceiro_id: original.parceiro_id ?? null,
                    descricao: original.descricao ?? null,
                    valor: original.valor,
                    plano_conta_id: original.plano_conta_id ?? null,
                    departamento_id: original.departamento_id ?? null,
                    centro_custo_id: original.centro_custo_id ?? null,
                    forma_pagamento: original.forma_pagamento ?? null,
                    dados_pagamento: original.dados_pagamento ?? null,
                    // Cópia nasce solta (pendente, sem vínculo) - o usuário decide
                    // depois com qual linha do extrato ela vai conciliar.
                    status: "pendente",
                }),
            });
        },
        onSuccess: () => {
            invalidateRelated(queryClient, "lancamentos");
            toast({
                title: "Lançamento duplicado",
                description: "Uma cópia pendente foi criada, sem vínculo com esta linha.",
            });
        },
        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Não foi possível duplicar",
                description: e instanceof Error ? e.message : String(e),
            }),
    });

    const atualizarValorMutation = useMutation({
        mutationFn: (payload: { campo: "desconto" | "juros_multa"; valor: string }) => {
            if (!v.vinculo_id) {
                throw new Error("Sem vinculo_id - backend precisa expor esse campo em GET /conciliacoes/:id.");
            }
            const body = {[payload.campo]: brMoneyDisplayToApiString(payload.valor) || "0.00"};
            return fetchApiData(`/conciliacoes/vinculos/${v.vinculo_id}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            setEditando(null);
        },
        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Não foi possível atualizar",
                description: e instanceof Error ? e.message : String(e),
            }),
    });

    function iniciarEdicao(campo: "desconto" | "juros_multa") {
        if (!podeEditarEsteVinculo) return;
        const atual = campo === "desconto" ? v.desconto : jurosOuAcrescimo;
        setValorEdicao(formatValorBrInput(String(Number(atual) || 0).replace(".", ",")));
        setEditando(campo);
    }

    return (
        <li className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
                {isResidual ? (
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-300 shrink-0"/>
                        Gerar movimentação residual
                    </label>
                ) : (
                    <span className="text-white/90 font-medium text-[12px] truncate min-w-0" title={v.descricao ?? ""}>
                        #{v.lancamento_id} · {v.descricao ?? "—"}
                    </span>
                )}
                <span className={cn("text-[9px] font-bold px-1 rounded shrink-0", corNaturezaTexto(isCredito))}>
                    {v.tipo}
                </span>
                {isLocal && !isResidual && (
                    <span
                        title="Ainda não foi salvo - será persistido ao Salvar/Conciliar"
                        className="text-[8px] font-bold px-1 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 uppercase tracking-wide shrink-0">
                        Não salvo
                    </span>
                )}
                <div className="flex items-center gap-0.5 shrink-0">
                    {/* RN-I7: 📄 detalhar - reaproveita o modal "Editar lançamento" já existente */}
                    {canEditarLancamento && (
                        <button
                            type="button"
                            title="Detalhar / editar lançamento"
                            onClick={onEditarLancamento}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white">
                            <FileText className="w-3.5 h-3.5"/>
                        </button>
                    )}
                    <button
                        type="button"
                        title="Duplicar lançamento"
                        disabled={duplicarMutation.isPending}
                        onClick={() => duplicarMutation.mutate()}
                        className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white disabled:opacity-40">
                        {duplicarMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                        ) : (
                            <Copy className="w-3.5 h-3.5"/>
                        )}
                    </button>
                    {canDesfazer && (
                        <button
                            type="button"
                            title="Remover vínculo"
                            onClick={onRemoverVinculo}
                            className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-300">
                            <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
                <div>
                    <span
                        className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Desconto</span>
                    {editando === "desconto" ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={valorEdicao}
                                onChange={(e) => setValorEdicao(formatValorBrInput(e.target.value))}
                                onKeyDown={(e) => e.key === "Enter" && atualizarValorMutation.mutate({
                                    campo: "desconto",
                                    valor: valorEdicao
                                })}
                                className="w-full bg-[#1a1c23] border border-primary/40 rounded px-1.5 py-1 text-xs text-white outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => atualizarValorMutation.mutate({campo: "desconto", valor: valorEdicao})}
                                title="Confirmar"
                                className="p-1 rounded hover:bg-primary/20 text-primary shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={!podeEditarEsteVinculo}
                            onClick={() => iniciarEdicao("desconto")}
                            className="flex items-center gap-1 text-xs text-white/90 mt-0.5 group disabled:opacity-60">
                            {formatCurrency(Number(v.desconto) || 0)}
                            {podeEditarEsteVinculo && (
                                <Pencil className="w-3 h-3 text-muted-foreground group-hover:text-primary"/>
                            )}
                        </button>
                    )}
                </div>
                <div>
                    <span
                        className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Juros/Multa</span>
                    {editando === "juros_multa" ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={valorEdicao}
                                onChange={(e) => setValorEdicao(formatValorBrInput(e.target.value))}
                                onKeyDown={(e) => e.key === "Enter" && atualizarValorMutation.mutate({
                                    campo: "juros_multa",
                                    valor: valorEdicao
                                })}
                                className="w-full bg-[#1a1c23] border border-primary/40 rounded px-1.5 py-1 text-xs text-white outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => atualizarValorMutation.mutate({
                                    campo: "juros_multa",
                                    valor: valorEdicao
                                })}
                                title="Confirmar"
                                className="p-1 rounded hover:bg-primary/20 text-primary shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={!podeEditarEsteVinculo}
                            onClick={() => iniciarEdicao("juros_multa")}
                            className="flex items-center gap-1 text-xs text-white/90 mt-0.5 group disabled:opacity-60">
                            {formatCurrency(Number(jurosOuAcrescimo) || 0)}
                            {podeEditarEsteVinculo && (
                                <Pencil className="w-3 h-3 text-muted-foreground group-hover:text-primary"/>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                {/* Decisão nº 3: vencimento do residual = origem, somente leitura. */}
                {isResidual ? (
                    <span title="Vencimento herdado da origem (não editável)">
                        {v.vencimento ? formatDate(v.vencimento) : "vencimento da origem"}
                    </span>
                ) : (
                    <span className="uppercase text-[9px]">{v.status}</span>
                )}
                <span className={cn("font-bold", corNaturezaTexto(isCredito))}>
                    {formatCurrency(Number(v.valor_vinculado))}
                </span>
            </div>

            {/* Card 76: residual marcado no "Vincular", mas só existe de fato
                (aba Lançamentos) depois do Salvar/Conciliar - avisa aqui que
                ainda é uma promessa em memória, não um lançamento criado. */}
            {v.residuo_pendente && (
                <div
                    className="flex items-center gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-1 mt-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0"/>
                    <span className="truncate">
                        Residual de {formatCurrency(Number(v.residuo_pendente.valor) || 0)} será criado ao Salvar/Conciliar
                    </span>
                </div>
            )}
        </li>
    );
}

/** Tolerância em reais para considerar o saldo da linha "zerado" (evita
 *  ruído de arredondamento de ponto flutuante). */
const TOLERANCIA_SALDO = 0.005;
/** Busca automática por descrição: quantidade mínima de caracteres para
 *  disparar o filtro sozinho, e tempo de debounce (ms) para não refiltrar
 *  a cada tecla digitada. */
const BUSCA_MIN_CHARS = 3;
const BUSCA_DEBOUNCE_MS = 350;
/** Card 73: quantas linhas renderizar por "página" do botão "Role para
 *  carregar mais" (lazy loading sob controle do usuário, não automático). */
const LINHAS_POR_PAGINA = 25;

export default function ConciliacaoExtratoDetalhe({extratoId}: { extratoId: string }) {
    const [location, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {hasPermission} = useAuth();

    const canVincular = hasPermission(PERM.CONCILIACAO_VINCULAR);
    const canIgnorar = hasPermission(PERM.CONCILIACAO_IGNORAR);
    const canDesfazer = hasPermission(PERM.CONCILIACAO_DESFAZER);
    const canEditarLancamento = hasPermission(PERM.LANCAMENTOS_EDITAR);
    const canCriarRegra = hasPermission(PERM.REGRAS_CONCILIACAO_CRIAR);

    const [vincularLinha, setVincularLinha] = useState<{
        id: number;
        valorAbs: string | number;
        tipoMovimento: string;
        dataMovimento: string | null;
        descricaoLinha: string | null;
        jaVinculadoLocalCents: number;
        ignorarVinculosReais: boolean;
    } | null>(null);
    const [ignorarLinhaId, setIgnorarLinhaId] = useState<number | null>(null);
    const [reverterLinhaId, setReverterLinhaId] = useState<number | null>(null);
    const [desfazerLinhaId, setDesfazerLinhaId] = useState<number | null>(null);
    const [finalizarOpen, setFinalizarOpen] = useState(false);
    const [editarLancamentoId, setEditarLancamentoId] = useState<number | null>(null);

    // Regra de Ouro (Fase 8): TODAS as ações de conciliação (vincular,
    // ignorar, desfazer, reverter-ignorar) ficam guardadas aqui como
    // rascunho em memória - nada é persistido no banco antes do clique em
    // Salvar/Conciliar (ver salvarMutation abaixo). Chave = linha_id.
    const [draftsPorLinha, setDraftsPorLinha] = useState<Record<number, DraftAcao[]>>({});
    // RN-D3 - [+] verde: NÃO cria um lançamento avulso. Abre o cadastro de
    // "Regra de Conciliação Automática" (Fase 6 / Card 48), pré-preenchido
    // com a descrição exata e a natureza (entrada/saída) da linha, para que
    // os PRÓXIMOS extratos casem e classifiquem/criem o lançamento sozinhos.
    const [regraLinha, setRegraLinha] = useState<LinhaDetalhe | null>(null);

    // Barra de filtros (Tipo / Status / Pesquisar / Aplicar) - igual ao protótipo.
    // Tipo e Status só afetam a lista quando o usuário clica em "Aplicar"
    // (filtrosAplicados). A Pesquisa (por descrição) é diferente: ela é
    // aplicada sozinha assim que o usuário digita pelo menos
    // BUSCA_MIN_CHARS caracteres, com um pequeno debounce (ver useEffect
    // abaixo) — "Aplicar" e Enter continuam funcionando como atalho manual.
    const [filtroTipo, setFiltroTipo] = useState<"todos" | "credito" | "debito">("todos");
    const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendente" | "vinculado" | "ignorado">("todos");
    const [buscaTexto, setBuscaTexto] = useState("");
    const [filtrosAplicados, setFiltrosAplicados] = useState<{
        tipo: "todos" | "credito" | "debito";
        status: "todos" | "pendente" | "vinculado" | "ignorado";
        busca: string;
    }>({tipo: "todos", status: "todos", busca: ""});

    // Busca automática por nome/descrição: dispara sozinha a partir de
    // BUSCA_MIN_CHARS caracteres digitados. Se o campo for esvaziado, o
    // filtro de busca é limpo na hora (sem esperar debounce).
    useEffect(() => {
        const termo = buscaTexto.trim();

        if (termo.length === 0) {
            setFiltrosAplicados((prev) => (prev.busca === "" ? prev : {...prev, busca: ""}));
            return;
        }

        if (termo.length < BUSCA_MIN_CHARS) return;

        const timeoutId = setTimeout(() => {
            setFiltrosAplicados((prev) => (prev.busca === termo ? prev : {...prev, busca: termo}));
        }, BUSCA_DEBOUNCE_MS);

        return () => clearTimeout(timeoutId);
    }, [buscaTexto]);

    function aplicarFiltros() {
        setFiltrosAplicados({tipo: filtroTipo, status: filtroStatus, busca: buscaTexto.trim()});
    }

    function limparFiltros() {
        setFiltroTipo("todos");
        setFiltroStatus("todos");
        setBuscaTexto("");
        setFiltrosAplicados({tipo: "todos", status: "todos", busca: ""});
    }

    // Card 73 (reajuste): o carregamento automático "invisível" ao chegar no
    // fim do scroll foi reprovado pelo cliente — agora o controle é do
    // usuário via botão explícito "Role para carregar mais" no fim da lista.
    const [linhasVisiveisCount, setLinhasVisiveisCount] = useState(LINHAS_POR_PAGINA);
    useEffect(() => {
        setLinhasVisiveisCount(LINHAS_POR_PAGINA);
    }, [filtrosAplicados]);

    const {data, isLoading, isError, refetch} = useQuery({
        queryKey: ["conciliacao-extrato", extratoId],
        queryFn: () => fetchApiData<ExtratoDetalheResponse>(`/conciliacoes/${extratoId}`),
        enabled: !!extratoId,
    });

    const {data: parametros} = useQuery({
        queryKey: ["conciliacoes-parametros"],
        queryFn: () =>
            fetchApiData<{
                motivo_ignorar_obrigatorio: boolean;
                motivos_predefinidos: string[];
            }>("/conciliacoes/parametros"),
        staleTime: 5 * 60_000,
    });
    const motivoObrigatorio = parametros?.motivo_ignorar_obrigatorio ?? false;

    const extrato = data?.extrato;
    const conc = data?.conciliacao;
    const linhas = data?.linhas ?? [];

    // Regra de Ouro: a linha "efetiva" mescla o que está no servidor com o
    // rascunho local (se houver) desta sessão - é ela que a tela inteira
    // usa para status/valores/vinculações, não o dado bruto do servidor.
    const linhasEfetivas = useMemo<LinhaEfetiva[]>(
        () => linhas.map((linha) => mergeLinhaComDraft(linha, draftsPorLinha[linha.linha_id])),
        [linhas, draftsPorLinha],
    );

    const hasPendingChanges = useMemo(
        () => Object.values(draftsPorLinha).some((acoes) => acoes.length > 0),
        [draftsPorLinha],
    );

    /** lancamento_id -> centavos já comprometidos por rascunhos locais (de
     *  QUALQUER linha desta sessão) - repassado ao modal de Vincular para o
     *  "Restante"/Modo B não ficarem desatualizados antes do Salvar. */
    const quitadoLocalPorLancamento = useMemo(() => {
        const mapa: Record<number, number> = {};
        for (const acoes of Object.values(draftsPorLinha)) {
            for (const acao of acoes) {
                if (acao.tipo !== "vincular") continue;
                for (const item of acao.draft.itens) {
                    mapa[item.lancamento_id] = (mapa[item.lancamento_id] ?? 0) + Math.round(item.valor_vinculado * 100);
                }
            }
        }
        return mapa;
    }, [draftsPorLinha]);

    // Proteção contra F5/fechar aba com rascunhos ainda não salvos (Regra de
    // Ouro: nada é persistido até o Salvar/Conciliar) - dispara o prompt
    // nativo do navegador em vez de deixar o progresso se perder em silêncio.
    useEffect(() => {
        if (!hasPendingChanges) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasPendingChanges]);

    // Bloqueio de rota SPA: o beforeunload acima só cobre F5/fechar aba - não
    // impede clicar num link do menu lateral (navegação interna via wouter)
    // nem usar o "Voltar" do navegador. Guardamos aqui a rota que o usuário
    // tentou acessar e só navegamos de fato se ele confirmar no modal.
    const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
    const hasPendingChangesRef = useRef(hasPendingChanges);
    useEffect(() => {
        hasPendingChangesRef.current = hasPendingChanges;
    }, [hasPendingChanges]);
    const currentPathRef = useRef(location);
    useEffect(() => {
        currentPathRef.current = location;
    }, [location]);

    function irPara(href: string) {
        if (hasPendingChangesRef.current) {
            setPendingNavigationHref(href);
        } else {
            setLocation(href);
        }
    }

    // Intercepta cliques em qualquer link interno (menu lateral, breadcrumbs,
    // etc.) enquanto houver rascunho pendente - captura no document ANTES do
    // <Link> do wouter tratar o clique, então dá pra cancelar a navegação.
    useEffect(() => {
        if (!hasPendingChanges) return;
        const handleClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
            if (!anchor || anchor.target === "_blank") return;
            const href = anchor.getAttribute("href");
            if (!href || !href.startsWith("/")) return;
            if (href === currentPathRef.current) return;
            e.preventDefault();
            e.stopPropagation();
            setPendingNavigationHref(href);
        };
        document.addEventListener("click", handleClick, true);
        return () => document.removeEventListener("click", handleClick, true);
    }, [hasPendingChanges]);

    // Intercepta o "Voltar"/"Avançar" nativo do navegador. Diferente de um
    // clique em link, o popstate dispara DEPOIS que a URL já mudou de fato, e
    // não dá pra "cancelar" a navegação de histórico via preventDefault - o
    // browser não suporta isso. A técnica padrão é plantar uma "armadilha":
    // assim que aparece rascunho pendente, duplicamos a entrada atual do
    // histórico (mesma URL). O 1º "Voltar" do usuário só consome essa cópia
    // extra e o pathname NÃO muda de verdade (wouter nem percebe, o
    // componente do extrato continua montado) - só então mostramos o modal.
    // Se ele insistir em clicar "Voltar" de novo antes de decidir, o
    // popstate handler replanta a armadilha na hora, mantendo a trava.
    useEffect(() => {
        if (!hasPendingChanges) return;
        window.history.pushState({ismTrap: true}, "", window.location.href);

        const handlePopState = () => {
            window.history.pushState({ismTrap: true}, "", window.location.href);
            // Não dá pra recuperar "pra onde" o usuário ia (a URL nunca chega
            // a mudar de fato) - assume o destino natural desta tela, igual
            // ao botão "Voltar para conciliações" do cabeçalho.
            setPendingNavigationHref("/conciliacao");
        };
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [hasPendingChanges]);

    function confirmarSairComRascunho() {
        const href = pendingNavigationHref;
        setPendingNavigationHref(null);
        if (href) setLocation(href);
    }

    function cancelarSairComRascunho() {
        setPendingNavigationHref(null);
    }

    function buildAcoesSalvar(): Array<Record<string, unknown>> {
        const acoes: Array<Record<string, unknown>> = [];
        for (const [linhaIdStr, draftArr] of Object.entries(draftsPorLinha)) {
            const linhaId = Number(linhaIdStr);
            for (const acao of draftArr) {
                if (acao.tipo === "vincular") {
                    const payload = acao.draft.payload;
                    acoes.push({
                        tipo: "vincular",
                        linha_id: linhaId,
                        lancamentos: payload.lancamentos,
                        gerar_parcial: payload.gerar_parcial,
                        residuo_lancamento_id: payload.residuo_lancamento_id,
                    });
                } else if (acao.tipo === "ignorar") {
                    acoes.push({
                        tipo: "ignorar",
                        linha_id: linhaId,
                        motivo_codigo: acao.motivoCodigo,
                        motivo: acao.motivo,
                    });
                } else if (acao.tipo === "desfazer") {
                    acoes.push({tipo: "desfazer", linha_id: linhaId});
                } else {
                    acoes.push({tipo: "reverter_ignorar", linha_id: linhaId});
                }
            }
        }
        return acoes;
    }

    // Regra de Ouro: único ponto de persistência real de toda a tela - as
    // ações rascunhadas (vincular/ignorar/desfazer/reverter-ignorar) só
    // chegam ao banco aqui, em lote, dentro de UMA transação no backend.
    const salvarMutation = useMutation({
        mutationFn: (params: { finalizar: boolean }) =>
            fetchApiData<{ extrato_id: number; linhas_processadas: unknown[]; finalizado: boolean }>(
                `/conciliacoes/${extratoId}/salvar`,
                {method: "POST", body: JSON.stringify({acoes: buildAcoesSalvar(), finalizar: params.finalizar})},
            ),
        onSuccess: (resultado) => {
            setDraftsPorLinha({});
            setFinalizarOpen(false);
            invalidateRelated(queryClient, "conciliacao");
            // É só agora, com a persistência real, que residuais pendentes
            // nascem de fato em lancamentosTable e títulos mudam para
            // pago/recebido - a aba Lançamentos precisa buscar de novo.
            invalidateRelated(queryClient, "lancamentos");
            void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
            void queryClient.invalidateQueries({queryKey: ["conciliacoes-pendencias-mes"]});
            toast({
                title: resultado.finalizado ? "Extrato conciliado" : "Alterações salvas",
                description: resultado.finalizado
                    ? "Conciliação concluída com sucesso."
                    : "Suas alterações foram salvas com sucesso.",
            });
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Não foi possível salvar as alterações.";
            toast({variant: "destructive", title: "Erro ao salvar", description: msg});
        },
    });

    const pendentesEfetivos = useMemo(
        () => linhasEfetivas.filter((l) => l.status === "pendente").length,
        [linhasEfetivas],
    );
    const podeFinalizar = pendentesEfetivos === 0;
    const rotuloAcaoConciliacao = podeFinalizar ? "Conciliar" : "Salvar";

    // Aplica Tipo / Status / Pesquisar sobre a lista (já com rascunhos
    // mesclados). Sem paginação: a lista inteira fica dentro de um
    // contêiner com overflow-y-auto (scroll).
    const linhasFiltradas = useMemo(() => {
        return linhasEfetivas.filter((linha) => {
            if (filtrosAplicados.tipo !== "todos" && linha.tipo_movimento !== filtrosAplicados.tipo) return false;
            if (filtrosAplicados.status !== "todos" && linha.status !== filtrosAplicados.status) return false;
            if (filtrosAplicados.busca) {
                const alvo = (linha.descricao ?? "").toLowerCase();
                if (!alvo.includes(filtrosAplicados.busca.toLowerCase())) return false;
            }
            return true;
        });
    }, [linhasEfetivas, filtrosAplicados]);

    // Card 73: só renderiza as primeiras N linhas filtradas — o resto só
    // entra quando o usuário clicar em "Role para carregar mais" (ver botão
    // no fim da lista), em vez de um observer invisível de scroll.
    const linhasVisiveis = useMemo(
        () => linhasFiltradas.slice(0, linhasVisiveisCount),
        [linhasFiltradas, linhasVisiveisCount],
    );
    const restantesParaCarregar = linhasFiltradas.length - linhasVisiveis.length;

    return (
       <div className="flex flex-col gap-4 h-full w-full px-0 py-2">
            <button
                type="button"
                onClick={() => irPara("/conciliacao")}
                className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors w-fit">
                <ArrowLeft className="w-3.5 h-3.5"/>
                Voltar para conciliações
            </button>

            {vincularLinha && (
                <VincularModal
                    open
                    extratoId={extratoId}
                    linhaId={vincularLinha.id}
                    valorExtratoAbs={vincularLinha.valorAbs}
                    tipoMovimento={vincularLinha.tipoMovimento}
                    dataMovimento={vincularLinha.dataMovimento}
                    descricaoLinha={vincularLinha.descricaoLinha}
                    jaVinculadoLocalCents={vincularLinha.jaVinculadoLocalCents}
                    quitadoLocalPorLancamento={quitadoLocalPorLancamento}
                    ignorarVinculosReais={vincularLinha.ignorarVinculosReais}
                    onClose={() => setVincularLinha(null)}
                    onDraftVincular={(draft) => {
                        setDraftsPorLinha((prev) => {
                            const atual = prev[draft.linhaId] ?? [];
                            return {...prev, [draft.linhaId]: [...atual, {tipo: "vincular", draft}]};
                        });
                    }}
                />
            )}

            {/*
              o [+] verde NÃO cria um lançamento avulso. Ele abre o cadastro
              de "Regra de Conciliação Automática",
              pré-preenchido com o texto exato da linha (ex.: "TAR PIX") e a
              natureza (entrada/saída), para que os PRÓXIMOS extratos casem
              e classifiquem/criem o lançamento sozinhos - sem precisar
              repetir o cadastro manual toda vez que a mesma tarifa aparecer.
            */}
            {regraLinha && (
                <RegraConciliacaoModal
                    open
                    prefill={{
                        texto_gatilho: regraLinha.descricao ?? "",
                        natureza: regraLinha.tipo_movimento === "credito" ? "entrada" : "saida",
                        conta_id: extrato?.conta_id ?? null,
                    }}
                    onClose={() => setRegraLinha(null)}
                    onSuccess={() => {
                        setRegraLinha(null);
                        toast({
                            title: "Regra criada",
                            description: "A partir de agora, extratos com este padrão são classificados automaticamente.",
                        });
                    }}
                />
            )}

            {/* Regra de Ouro: "Ignorar" só rascunha localmente - nada é
                persistido até o Salvar/Conciliar no rodapé da tela. */}
            <IgnorarLinhaModal
                open={ignorarLinhaId != null}
                obrigatorio={motivoObrigatorio}
                pending={false}
                onClose={() => setIgnorarLinhaId(null)}
                onConfirm={(payload: MotivoIgnorarPayload) => {
                    if (ignorarLinhaId == null) return;
                    const linhaId = ignorarLinhaId;
                    // Caso raro: a linha já está ignorada DE VERDADE no banco (de um
                    // Save anterior) e o usuário reverteu localmente (rascunho
                    // "reverter_ignorar") e resolveu ignorar de novo antes de salvar -
                    // nesse caso o estado real já é "ignorado", então basta descartar
                    // o rascunho de reverter (nada muda) em vez de mandar um "ignorar"
                    // que o backend rejeitaria (linha já ignorada).
                    const linhaServidor = linhas.find((l) => l.linha_id === linhaId);
                    setDraftsPorLinha((prev) => {
                        if (linhaServidor?.status === "ignorado") {
                            const {[linhaId]: _removido, ...resto} = prev;
                            return resto;
                        }
                        return {
                            ...prev,
                            [linhaId]: [{tipo: "ignorar", motivoCodigo: payload.motivo_codigo, motivo: payload.motivo}],
                        };
                    });
                    setIgnorarLinhaId(null);
                    toast({
                        title: "Linha marcada para ignorar",
                        description: "Ainda não foi salvo - clique em Salvar/Conciliar para confirmar.",
                    });
                }}
            />

            {/* Regra de Ouro: se o "ignorado" atual é só um rascunho local
                (ainda não salvo), reverter apenas descarta esse rascunho -
                sem chamada ao backend. Se já é real (de um Save anterior),
                rascunha um "reverter_ignorar" para ser aplicado no Salvar. */}
            <ConfirmDialog
                open={reverterLinhaId != null}
                title="Reverter ignorar?"
                description="A linha voltará ao status pendente e poderá ser vinculada novamente. Nenhum motivo é exigido."
                confirmLabel="Reverter"
                variant="warning"
                icon={RotateCcw}
                onCancel={() => setReverterLinhaId(null)}
                onConfirm={() => {
                    if (reverterLinhaId == null) return;
                    const linhaId = reverterLinhaId;
                    setDraftsPorLinha((prev) => {
                        const atual = prev[linhaId];
                        if (atual && atual[0]?.tipo === "ignorar") {
                            const {[linhaId]: _removido, ...resto} = prev;
                            return resto;
                        }
                        return {...prev, [linhaId]: [{tipo: "reverter_ignorar"}]};
                    });
                    setReverterLinhaId(null);
                    toast({
                        title: "Reverter rascunhado",
                        description: "Ainda não foi salvo - clique em Salvar/Conciliar para confirmar.",
                    });
                }}
            />

            {/* Regra de Ouro: se os vínculos atuais são só rascunho local
                (linha ainda "pendente" de fato no banco), desfazer apenas
                descarta o rascunho. Se já há vínculo real (de um Save
                anterior), rascunha um "desfazer" para reverter no Salvar. */}
            <ConfirmDialog
                open={desfazerLinhaId != null}
                title="Desfazer vínculos?"
                description="Os lançamentos vinculados voltarão ao status anterior e a linha do extrato ficará pendente novamente."
                confirmLabel="Desfazer vínculos"
                variant="destructive"
                icon={Unlink}
                onCancel={() => setDesfazerLinhaId(null)}
                onConfirm={() => {
                    if (desfazerLinhaId == null) return;
                    const linhaId = desfazerLinhaId;
                    const linhaServidor = linhas.find((l) => l.linha_id === linhaId);
                    setDraftsPorLinha((prev) => {
                        if (linhaServidor?.status === "vinculado") {
                            return {...prev, [linhaId]: [{tipo: "desfazer"}]};
                        }
                        const {[linhaId]: _removido, ...resto} = prev;
                        return resto;
                    });
                    setDesfazerLinhaId(null);
                    toast({
                        title: "Vínculos removidos (rascunho)",
                        description: "Ainda não foi salvo - clique em Salvar/Conciliar para confirmar.",
                    });
                }}
            />

            <ConfirmDialog
                open={finalizarOpen}
                title="Conciliar extrato?"
                description="Não pode haver linhas pendentes. Após conciliar, o extrato será marcado como conciliado."
                confirmLabel="Conciliar"
                variant="default"
                icon={CheckCircle2}
                onCancel={() => setFinalizarOpen(false)}
                onConfirm={() => salvarMutation.mutate({finalizar: true})}
            />

            <ConfirmDialog
                open={pendingNavigationHref != null}
                title="Alterações não salvas"
                description="Você tem alterações não salvas. Deseja sair e descartar o progresso?"
                confirmLabel="Sair"
                cancelLabel="Continuar editando"
                variant="warning"
                icon={AlertCircle}
                onCancel={cancelarSairComRascunho}
                onConfirm={confirmarSairComRascunho}
            />

            <EditarLancamentoConciliacaoModal
                open={editarLancamentoId != null}
                lancamentoId={editarLancamentoId}
                onClose={() => setEditarLancamentoId(null)}
                onSaved={() => {
                    void queryClient.invalidateQueries({queryKey: ["conciliacao-extrato", extratoId]});
                }}
            />

            {isLoading ? (
                <div className="glass-panel rounded-2xl p-16 flex flex-col items-center gap-3 border border-white/10">
                    <Loader2 className="w-10 h-10 animate-spin text-primary"/>
                    <p className="text-sm text-muted-foreground">Carregando extrato…</p>
                </div>
            ) : isError || !extrato || !conc ? (
                <div className="glass-panel rounded-2xl p-10 border border-destructive/30 text-center">
                    <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3"/>
                    <p className="text-sm text-white font-medium">Não foi possível carregar este extrato.</p>
                    <button type="button" onClick={() => void refetch()}
                            className="mt-4 text-xs text-primary underline">
                        Tentar novamente
                    </button>
                </div>
            ) : (
                <>


                    <div
                        className="glass-panel rounded-2xl border border-white/10 overflow-hidden flex flex-col flex-1 min-h-0">
                        {/* Barra de filtros: Tipo, Status, Aplicar, Atualizar, Limpar e Pesquisar (igual ao protótipo) */}
                        <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-white/5 bg-black/10">
                            <select
                                value={filtroTipo}
                                onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                                className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 outline-none focus:border-primary/40">
                                <option value="todos">Tipo</option>
                                <option value="credito">Crédito</option>
                                <option value="debito">Débito</option>
                            </select>

                            <select
                                value={filtroStatus}
                                onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
                                className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 outline-none focus:border-primary/40">
                                <option value="todos">Status</option>
                                <option value="pendente">Pendente</option>
                                <option value="vinculado">Vinculado</option>
                                <option value="ignorado">Ignorado</option>
                            </select>

                            <button
                                type="button"
                                onClick={aplicarFiltros}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold">
                                <Filter className="w-3.5 h-3.5"/>
                                Aplicar
                            </button>

                            <button
                                type="button"
                                title="Atualizar"
                                onClick={() => void refetch()}
                                className="p-1.5 rounded-lg border border-white/10 text-white/80 hover:bg-white/5 hover:text-white">
                                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}/>
                            </button>

                            <button
                                type="button"
                                title="Limpar filtros"
                                onClick={limparFiltros}
                                className="p-1.5 rounded-lg border border-white/10 text-white/80 hover:bg-white/5 hover:text-white">
                                <X className="w-3.5 h-3.5"/>
                            </button>

                            <div className="flex-1"/>

                            <div className="relative w-full sm:w-64">
                                <Search
                                    className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"/>
                                <input
                                    type="text"
                                    value={buscaTexto}
                                    onChange={(e) => setBuscaTexto(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
                                    placeholder="Pesquisar (mín. 3 letras)"
                                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs text-white placeholder:text-muted-foreground outline-none focus:border-primary/40"
                                />
                            </div>
                        </div>

                        {/* Cabeçalho de duas colunas - "Extrato" à esquerda (com o período do
                            extrato ao lado do título) - "Movimentações não conciliadas" à
                            direita - ícones e títulos centralizados. */}
                        <div
                            className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] border-b border-white/5 bg-black/20">
                            <div className="px-3.5 py-2.5 flex items-center justify-center gap-2 flex-wrap">
                                <Download className="w-3.5 h-3.5 text-primary shrink-0"/>
                                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Extrato</h2>
                                {extrato.periodo_inicio && extrato.periodo_fim && (
                                    <span className="text-[10px] font-normal normal-case text-muted-foreground">
                                        · Período {formatDate(extrato.periodo_inicio)} — {formatDate(extrato.periodo_fim)}
                                    </span>
                                )}
                            </div>
                            <div className="hidden xl:block"/>
                            <div className="px-3.5 py-2.5 flex items-center justify-center gap-2 border-t xl:border-t-0 border-white/5">
                                <Unlink className="w-3.5 h-3.5 text-primary shrink-0"/>
                                <h2 className="text-sm font-bold text-white uppercase tracking-wide">Movimentações
                                    não conciliadas</h2>
                            </div>
                        </div>

                        {/*
                          RN-D1: duas colunas - esquerda a linha do extrato, direita o(s)
                          lançamento(s) - com o conector central de estado (RN-D4).
                          Sem barra colorida lateral: a cor semântica agora aparece como
                          sublinhado sob o título e no valor, igual ao protótipo.
                        */}
                        {linhasFiltradas.length === 0 ? (
                            <div className="py-16 text-center text-xs text-muted-foreground">
                                Nenhuma linha encontrada com os filtros aplicados.
                            </div>
                        ) : (
                        <div className="divide-y divide-white/5 overflow-y-auto flex-1 min-h-0">
                            {linhasVisiveis.map((linha) => {
                                const isPendente = linha.status === "pendente";
                                const isVinculado = linha.status === "vinculado";
                                const isIgnorado = linha.status === "ignorado";
                                const isCredito = linha.tipo_movimento === "credito";
                                const valorAbs = Math.abs(Number(linha.valor));

                                const saldoAbs = Math.abs(Number(linha.valor_saldo));
                                const faltaFechar = saldoAbs > TOLERANCIA_SALDO;
                                const podeVincularMais = !isIgnorado && (isPendente || faltaFechar);

                                return (
                                    <div
                                        key={linha.linha_id}
                                        className={cn(
                                            "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] divide-y xl:divide-y-0 xl:divide-x divide-white/5",
                                            isIgnorado && "opacity-45 grayscale-[0.35] bg-white/[0.015]",
                                        )}
                                    >
                                        {/* ── COLUNA ESQUERDA: linha do extrato ── */}
                                        <div className="p-3 space-y-1.5 min-w-0">
                                            {/* Cabeçalho: badge + data à esquerda, [+] e [⊘ Ignorar]/[↺ Reverter]
                                                juntos à direita, na mesma linha (layout do protótipo). */}
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-2 min-w-0">
                          <span
                              className={cn(
                                  "text-[10px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0",
                                  corNaturezaBadge(isCredito),
                              )}>
                            {linha.tipo_movimento}
                          </span>
                                                    {linha.data_movimento && (
                                                        <span className="text-xs text-muted-foreground truncate">
                                                            {formatDate(linha.data_movimento)}
                                                        </span>
                                                    )}
                                                    {linha._draftAtivo && (
                                                        <span
                                                            title="Alterações locais ainda não salvas nesta linha"
                                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 uppercase tracking-wide shrink-0">
                                                            Não salvo
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {/* RN-D3 (reinterpretado): [+] verde - abre "Nova regra de
                                                        conciliação automática" pré-preenchida com esta linha,
                                                        para os PRÓXIMOS extratos casarem sozinhos. Não cria um
                                                        lançamento avulso nem depende de saldo em aberto. */}
                                                    {canCriarRegra && (
                                                        <button
                                                            type="button"
                                                            title="Criar regra de conciliação automática a partir desta linha"
                                                            onClick={() => setRegraLinha(linha)}
                                                            className="w-6 h-6 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0">
                                                            <Plus className="w-3.5 h-3.5"/>
                                                        </button>
                                                    )}
                                                    {/* [⊘ Ignorar] ⇄ [↺ Reverter] - ao lado do [+], como no protótipo */}
                                                    {isPendente && canIgnorar && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setIgnorarLinhaId(linha.linha_id)}
                                                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/90 whitespace-nowrap">
                                                            <Ban className="w-3 h-3"/>
                                                            Ignorar
                                                        </button>
                                                    )}
                                                    {isIgnorado && canDesfazer && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setReverterLinhaId(linha.linha_id)}
                                                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[11px] font-semibold text-amber-200 whitespace-nowrap">
                                                            <RotateCcw className="w-3 h-3"/>
                                                            Reverter
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="text-sm text-white font-medium leading-snug">
                                                {linha.descricao ?? "—"}
                                            </p>

                                            <span className={cn("block text-lg font-black", corNaturezaTexto(isCredito))}>
                          {formatCurrency(valorAbs)}
                        </span>

                                            {/* Quando já existe vínculo parcial, mostra quanto ainda falta —
                                                senão o usuário não entende por que o botão "Vincular" voltou
                                                a aparecer numa linha que já tem lançamento associado. */}
                                            {isVinculado && faltaFechar && (
                                                <p className="text-[11px] text-amber-300/90">
                                                    Falta vincular {formatCurrency(saldoAbs)}
                                                </p>
                                            )}

                                            {linha.classificacao_automatica && (
                                                <p className="text-[11px] text-sky-300/90 bg-sky-500/10 border border-sky-500/25 rounded-lg px-2 py-1 inline-flex items-center gap-1.5">
                                                    <Sparkles className="w-3 h-3 shrink-0"/>
                                                    {linha.status === "pendente" && linha.regra_criar_lancamento
                                                        ? "Essa movimentação será criada"
                                                        : linha.status === "pendente"
                                                            ? "Classificação sugerida pela regra — revise"
                                                            : "Classificada automaticamente pela regra"}
                                                    {linha.regra_texto_gatilho
                                                        ? ` (“${linha.regra_texto_gatilho}”)`
                                                        : ""}
                                                </p>
                                            )}

                                            {linha.documento && (
                                                <p className="text-[10px] text-muted-foreground font-mono">Doc.
                                                    {" "}{linha.documento}</p>
                                            )}
                                            {linha.saldo_pos_linha != null && (
                                                <p className="text-[11px] text-muted-foreground">
                                                    Saldo pós-linha: {formatCurrency(Number(linha.saldo_pos_linha))}
                                                </p>
                                            )}
                                        </div>

                                        {/* ── COLUNA CENTRAL: conector (RN-D4) ── */}
                                        <div className="flex items-center justify-center py-1.5 xl:py-2">
                                            {!isIgnorado && (
                                                <div
                                                    className={cn(
                                                        "w-7 h-7 rounded-full flex items-center justify-center border shrink-0",
                                                        !faltaFechar
                                                            ? "bg-white/5 border-white/15 text-muted-foreground"
                                                            : "bg-amber-500/15 border-amber-500/40 text-amber-300",
                                                    )}
                                                    title={!faltaFechar ? "Os valores batem" : "Os valores divergem"}>
                                                    {!faltaFechar ? (
                                                        <Link2 className="w-3.5 h-3.5"/>
                                                    ) : (
                                                        <span className="text-xs font-black">≠</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* ── COLUNA DIREITA: lançamento(s) ── */}
                                        <div className="p-3 min-w-0 space-y-1.5">
                                            {/* Lista dos lançamentos já vinculados (se houver) — antes isso
                                                era "ou" com o botão Vincular; agora os dois podem coexistir
                                                enquanto sobrar saldo a fechar na linha. */}
                                            {isVinculado && linha.vinculacoes.length > 0 && (
                                                <ul className="space-y-1.5">
                                                    {linha.vinculacoes.map((v) => (
                                                        <CardLancamento
                                                            key={v.vinculo_id ?? v.lancamento_id}
                                                            v={v}
                                                            extratoId={extratoId}
                                                            linhaId={linha.linha_id}
                                                            canEditarLancamento={canEditarLancamento}
                                                            canDesfazer={canDesfazer}
                                                            onEditarLancamento={() => setEditarLancamentoId(v.lancamento_id)}
                                                            onRemoverVinculo={() => setDesfazerLinhaId(linha.linha_id)}
                                                        />
                                                    ))}
                                                </ul>
                                            )}

                                            {/* [🔍 Vincular]: visível enquanto sobrar saldo a fechar (linha
                                                pendente OU vinculada parcialmente); some no valor exato.
                                                IMPORTANTE: passa o SALDO restante da linha (linha.valor_saldo),
                                                não o valor cheio da linha — senão o modal calcula o "restante"
                                                contra o valor total, ignorando o que já foi vinculado antes. */}
                                            {/* UX: botão menor. */}
                                            {podeVincularMais && canVincular && (
                                                <button
                                                    type="button"
                                                    onClick={() => setVincularLinha({
                                                        id: linha.linha_id,
                                                        valorAbs: saldoAbs,
                                                        tipoMovimento: linha.tipo_movimento,
                                                        dataMovimento: linha.data_movimento,
                                                        descricaoLinha: linha.descricao,
                                                        jaVinculadoLocalCents: linha._jaVinculadoLocalCents,
                                                        ignorarVinculosReais: linha._ignorarVinculosReais,
                                                    })}
                                                    className="w-[40%] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                                                    <Search className="w-3.5 h-3.5"/>
                                                    Vincular
                                                </button>
                                            )}

                                            {isIgnorado && (
                                                <p className="text-[11px] text-muted-foreground italic py-2">
                                                    Linha ignorada — sem lançamento vinculado.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {/* Card 73 (reajuste): substitui o antigo gatilho invisível de
                                scroll infinito por um botão explícito no fim da lista —
                                o carregamento de mais linhas fica sob controle do usuário. */}
                            {restantesParaCarregar > 0 && (
                                <div className="py-4 flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setLinhasVisiveisCount((n) => n + LINHAS_POR_PAGINA)}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-white transition-colors">
                                        <ChevronDown className="w-3.5 h-3.5"/>
                                        Role para carregar mais ({restantesParaCarregar} restante{restantesParaCarregar === 1 ? "" : "s"})
                                    </button>
                                </div>
                            )}
                        </div>
                        )}

                        {/*
                          Rodapé de ação: o botão Salvar/Conciliar fica alinhado à
                          direita, após a lista de linhas (scroll infinito - sem
                          paginação, ver contêiner overflow-y-auto acima).
                          Regra de Ouro + botão inteligente (Fase 8):
                          - Só fica clicável quando há alguma alteração local ainda
                            não salva (hasPendingChanges) - sem rascunho pendente,
                            fica desabilitado (nada novo para persistir).
                          - Com pendências de linha zeradas (efetivamente, já
                            considerando os rascunhos), o rótulo vira "Conciliar" e
                            o clique abre o ConfirmDialog que salva + finaliza em
                            uma única chamada a POST /salvar.
                          - Caso contrário, o rótulo é "Salvar" e o clique já
                            dispara o salvamento em lote de todos os rascunhos
                            (sem precisar de confirmação, já que não é destrutivo).
                        */}
                        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-white/5 bg-black/25">
                            {hasPendingChanges && (
                                <span className="text-[11px] text-amber-300/90 flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5"/>
                                    Você tem alterações não salvas
                                </span>
                            )}
                            <RequiresPermission permission={PERM.CONCILIACAO_CONCLUIR}>
                                <button
                                    type="button"
                                    disabled={!hasPendingChanges || salvarMutation.isPending || extrato.status === "conciliado"}
                                    onClick={() => {
                                        if (podeFinalizar) {
                                            setFinalizarOpen(true);
                                            return;
                                        }
                                        salvarMutation.mutate({finalizar: false});
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-white text-xs font-bold disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-success/20">
                                    {salvarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> :
                                        <CheckCircle2 className="w-4 h-4"/>}
                                    {rotuloAcaoConciliacao}
                                </button>
                            </RequiresPermission>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}