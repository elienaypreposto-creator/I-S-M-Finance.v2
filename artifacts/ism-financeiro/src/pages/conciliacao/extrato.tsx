import {tenantQueryKey} from "@/lib/tenant-query";
import {useMemo, useState, useEffect, useRef} from "react";
import {useLocation} from "wouter";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {ApiError, fetchApiData} from "@/lib/api-config";
import {formatDate, cn} from "@/lib/utils";
import {rotuloStatus} from "@/lib/status-label";
import {useDinheiro} from "@/components/conta/saldos-visiveis";
import {VincularModal, type DraftVincular} from "@/components/conciliacao/vincular-modal";
import {IgnorarLinhaModal, type MotivoIgnorarPayload} from "@/components/conciliacao/ignorar-linha-modal";
import {EditarLancamentoConciliacaoModal} from "@/components/conciliacao/editar-lancamento-modal";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
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
    Search,
    Copy,
    Trash2,
    Sparkles,
    RefreshCw,
    Download,
    ChevronDown,
    X,
} from "lucide-react";
import {invalidateRelated} from "@/App";
import {formatValorBrInput, brMoneyDisplayToApiString} from "@/validations/lancamentos.schema";
import {RegraConciliacaoModal} from "@/components/conciliacao/regra-conciliacao-modal";
import {rolarAteElemento} from "@/lib/rolar-ate-elemento";
import {
    CampoBusca,
    casaMulti,
    FiltrosAtivos,
    FiltrosPopover,
    FOCO_VISIVEL,
    useFiltrosNaUrl,
    type DefinicaoFiltro,
} from "@/components/shared/filtros";

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
    /** true = finalizada pelo Conciliar (travada até reabrir). */
    finalizada?: boolean;
    data_conciliacao?: string | null;
    resumo_conciliados: number;
    resumo_ignorados: number;
    resumo_pendentes: number;
    resumo_total: number;
    resumo_classificadas_automaticamente?: number;
};

type VinculacaoDetalhe = {
    vinculo_id?: number;
    lancamento_id: number;
    descricao: string | null;
    tipo: string;
    status: string;
    is_residuo_parcial?: boolean;
    /** Bruto do título, líquido (bruto − retenções) e Σ retenções na fonte. */
    valor_titulo?: string | number;
    valor_liquido_titulo?: string | number;
    total_retencoes?: string | number;
    valor_vinculado: string | number;
    desconto: string | number;
    acrescimo?: string | number;
    juros_multa?: string | number;
    vencimento?: string | null;
    residuo_pendente?: { valor: string | number } | null;
    residuo_gerado?: {
        id: number;
        descricao: string | null;
        valor: string | number;
        status: string;
        vencimento: string | null;
    } | null;
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

function corNaturezaBadge(isCredito: boolean) {
    return isCredito
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
        : "bg-red-500/15 text-red-300 border-red-500/25";
}

function corNaturezaTexto(isCredito: boolean) {
    return isCredito ? "text-emerald-300" : "text-red-300";
}

type DraftAcaoVincular = { tipo: "vincular"; draft: DraftVincular };
type DraftAcaoIgnorar = { tipo: "ignorar"; motivoCodigo?: string; motivo?: string };
type DraftAcaoDesfazer = { tipo: "desfazer" };
type DraftAcaoReverterIgnorar = { tipo: "reverter_ignorar" };
type DraftAcao = DraftAcaoVincular | DraftAcaoIgnorar | DraftAcaoDesfazer | DraftAcaoReverterIgnorar;

type LinhaEfetiva = LinhaDetalhe & {
    _draftAtivo: boolean;
    _jaVinculadoLocalCents: number;
    _ignorarVinculosReais: boolean;
};

function normalizarTextoBusca(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/** O Salvar prefixa a recusa de cada ação com "Linha N: " - separa a linha da mensagem. */
function separarLinhaDoErro(mensagem: string): { linhaId: number | null; texto: string } {
    const m = /^Linha (\d+): ([\s\S]*)$/.exec(mensagem);
    return m ? {linhaId: Number(m[1]), texto: m[2]!} : {linhaId: null, texto: mensagem};
}

function centsFromReais(v: string | number | null | undefined): number {
    return Math.round(Math.abs(Number(v) || 0) * 100);
}

function reaisFromCents(cents: number): number {
    return cents / 100;
}

function somaRoundsNovoCents(rounds: DraftVincular[], realBaseCents: number): number {
    return rounds.reduce(
        (acc, r) => acc + Math.round(r.totalConciliado * 100) - realBaseCents,
        0,
    );
}

function mergeLinhaComDraft(
    linha: LinhaDetalhe,
    draft: DraftAcao[] | undefined,
): LinhaEfetiva {
    if (!draft || draft.length === 0) {
        return {
            ...linha,
            _draftAtivo: false,
            _jaVinculadoLocalCents: 0,
            _ignorarVinculosReais: false,
        };
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

    const resetaBaseReal =
        primeiro.tipo === "desfazer" ||
        primeiro.tipo === "reverter_ignorar";

    const rounds = draft
        .filter((a): a is DraftAcaoVincular => a.tipo === "vincular")
        .map((a) => a.draft);

    const extratoTotalCents = centsFromReais(linha.valor);
    const realBaseCents = resetaBaseReal
        ? 0
        : centsFromReais(linha.valor_vinculado_total);

    const localNovoCents = somaRoundsNovoCents(
        rounds,
        realBaseCents,
    );

    const totalEfetivoCents =
        realBaseCents + localNovoCents;

    const saldoEfetivoCents = Math.max(
        0,
        extratoTotalCents - totalEfetivoCents,
    );

    const vinculacoesBase: VinculacaoDetalhe[] =
        resetaBaseReal ? [] : linha.vinculacoes;

    const vinculacoesLocais: VinculacaoDetalhe[] =
        rounds.flatMap((r) =>
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
                    r.residual &&
                    r.residual.lancamentoOrigemId === item.lancamento_id
                        ? {valor: r.residual.valor}
                        : null,
                _local: true,
            })),
        );

    const temAlgumVinculo =
        vinculacoesBase.length > 0 ||
        vinculacoesLocais.length > 0;

    return {
        ...linha,
        status: temAlgumVinculo ? "vinculado" : "pendente",
        vinculacoes: [
            ...vinculacoesBase,
            ...vinculacoesLocais,
        ],
        valor_vinculado_total:
            reaisFromCents(totalEfetivoCents),
        valor_saldo:
            reaisFromCents(saldoEfetivoCents),
        _draftAtivo: true,
        _jaVinculadoLocalCents: localNovoCents,
        _ignorarVinculosReais:
            primeiro.tipo === "desfazer",
    };
}

function removerLancamentoDoRascunho(
    prev: Record<number, DraftAcao[]>,
    linhaId: number,
    lancamentoId: number,
): Record<number, DraftAcao[]> {
    const acoes = prev[linhaId];

    if (!acoes) return prev;

    const novas: DraftAcao[] = [];

    for (const acao of acoes) {
        if (acao.tipo !== "vincular") {
            novas.push(acao);
            continue;
        }

        const itens = acao.draft.itens.filter(
            (i) => i.lancamento_id !== lancamentoId,
        );

        if (itens.length === 0) continue;

        const residual =
            acao.draft.residual?.lancamentoOrigemId ===
            lancamentoId
                ? null
                : acao.draft.residual;

        novas.push({
            tipo: "vincular",
            draft: {
                ...acao.draft,
                itens,
                residual,
                payload: {
                    ...acao.draft.payload,
                    lancamentos:
                        acao.draft.payload.lancamentos.filter(
                            (l) =>
                                l.lancamento_id !==
                                lancamentoId,
                        ),
                },
            },
        });
    }

    if (novas.length === 0) {
        const {
            [linhaId]: _drop,
            ...resto
        } = prev;

        return resto;
    }

    return {
        ...prev,
        [linhaId]: novas,
    };
}

function CardLancamento({
                            v,
                            extratoId,
                            linhaId,
                            canEditarLancamento,
                            canEditarVinculo,
                            canDesfazer,
                            onEditarLancamento,
                            onRemoverVinculo,
                        }: {
    v: VinculacaoDetalhe;
    extratoId: string;
    linhaId: number;
    canEditarLancamento: boolean;
    /** Desconto/juros do vínculo: exige permissão de vincular e extrato aberto. */
    canEditarVinculo: boolean;
    canDesfazer: boolean;
    onEditarLancamento: () => void;
    onRemoverVinculo: () => void;
}) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const dinheiro = useDinheiro();

    const [editando, setEditando] =
        useState<null | "desconto" | "juros_multa">(null);

    const [valorEdicao, setValorEdicao] =
        useState("");

    const jurosOuAcrescimo =
        v.juros_multa ?? v.acrescimo ?? 0;

    const isCredito = v.tipo === "CR";
    const isResidual = Boolean(v.is_residuo_parcial);
    const isLocal = Boolean(v._local);

    // Extrato finalizado = travado: nada de editar desconto/juros (a API recusa).
    const podeEditarEsteVinculo =
        canEditarVinculo && !isLocal;

    const duplicarMutation = useMutation({
        mutationFn: async () => {
            const original =
                await fetchApiData<Record<string, unknown>>(
                    `/lancamentos/${v.lancamento_id}`,
                );

            return fetchApiData("/lancamentos", {
                method: "POST",
                body: JSON.stringify({
                    tipo: original.tipo,
                    vencimento: original.vencimento,
                    competencia:
                        original.competencia ?? null,
                    conta_id:
                        original.conta_id ?? null,
                    parceiro_id:
                        original.parceiro_id ?? null,
                    descricao:
                        original.descricao ?? null,
                    valor: original.valor,
                    retencao_ir: original.retencao_ir ?? 0,
                    retencao_pis: original.retencao_pis ?? 0,
                    retencao_cofins: original.retencao_cofins ?? 0,
                    retencao_csll: original.retencao_csll ?? 0,
                    retencao_inss: original.retencao_inss ?? 0,
                    retencao_iss: original.retencao_iss ?? 0,
                    plano_conta_id:
                        original.plano_conta_id ?? null,
                    departamento_id:
                        original.departamento_id ?? null,
                    centro_custo_id:
                        original.centro_custo_id ?? null,
                    forma_pagamento:
                        original.forma_pagamento ?? null,
                    dados_pagamento:
                        original.dados_pagamento ?? null,
                    status: "pendente",
                }),
            });
        },

        onSuccess: () => {
            invalidateRelated(
                queryClient,
                "lancamentos",
            );

            toast({
                title: "Lançamento duplicado",
                description:
                    "Uma cópia pendente foi criada, sem vínculo com esta linha.",
            });
        },

        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Não foi possível duplicar",
                description:
                    e instanceof Error
                        ? e.message
                        : String(e),
            }),
    });

    const atualizarValorMutation = useMutation({
        mutationFn: (
            payload: {
                campo:
                    | "desconto"
                    | "juros_multa";
                valor: string;
            },
        ) => {
            if (!v.vinculo_id) {
                throw new Error(
                    "Sem vinculo_id - backend precisa expor esse campo em GET /conciliacoes/:id.",
                );
            }

            const body = {
                [payload.campo]:
                brMoneyDisplayToApiString(
                    payload.valor,
                ) || "0.00",
            };

            return fetchApiData(
                `/conciliacoes/vinculos/${v.vinculo_id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(body),
                },
            );
        },

        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: tenantQueryKey("conciliacao-extrato",
                    extratoId,),
            });

            setEditando(null);
        },

        onError: (e: unknown) =>
            toast({
                variant: "destructive",
                title: "Não foi possível atualizar",
                description:
                    e instanceof Error
                        ? e.message
                        : String(e),
            }),
    });

    function iniciarEdicao(
        campo: "desconto" | "juros_multa",
    ) {
        if (!podeEditarEsteVinculo) return;

        const atual =
            campo === "desconto"
                ? v.desconto
                : jurosOuAcrescimo;

        setValorEdicao(
            formatValorBrInput(
                String(Number(atual) || 0).replace(
                    ".",
                    ",",
                ),
            ),
        );

        setEditando(campo);
    }

    return (
        <li className="rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 space-y-1 w-full">
            <div className="flex items-center justify-between gap-2">
                {isResidual ? (
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-200 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-300 shrink-0"/>
                        Gerar movimentação residual
                    </label>
                ) : (
                    <span
                        className="text-white/90 font-medium text-[12px] truncate min-w-0"
                        title={v.descricao ?? ""}
                    >
                        #{v.lancamento_id} ·{" "}
                        {v.descricao ?? "-"}
                    </span>
                )}

                <span
                    className={cn(
                        "text-[9px] font-bold px-1 rounded shrink-0",
                        corNaturezaTexto(isCredito),
                    )}
                >
                    {v.tipo}
                </span>

                {isLocal && !isResidual && (
                    <span
                        title="Ainda não foi salvo - será persistido ao Salvar/Conciliar"
                        className="text-[8px] font-bold px-1 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 uppercase tracking-wide shrink-0"
                    >
                        Não salvo
                    </span>
                )}

                <div className="flex items-center gap-0.5 shrink-0">
                    {canEditarLancamento && (
                        <button
                            type="button"
                            title="Detalhar / editar lançamento"
                            onClick={onEditarLancamento}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white"
                        >
                            <FileText className="w-3.5 h-3.5"/>
                        </button>
                    )}

                    <button
                        type="button"
                        title="Duplicar lançamento"
                        disabled={
                            duplicarMutation.isPending
                        }
                        onClick={() =>
                            duplicarMutation.mutate()
                        }
                        className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white disabled:opacity-40"
                    >
                        {duplicarMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                        ) : (
                            <Copy className="w-3.5 h-3.5"/>
                        )}
                    </button>

                    {canDesfazer && (
                        <button
                            type="button"
                            title={isLocal ? "Remover vínculo do rascunho" : "Estornar quitação / remover vínculo"}
                            onClick={onRemoverVinculo}
                            className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-300"
                        >
                            <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
                <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        Desconto
                    </span>

                    {editando === "desconto" && podeEditarEsteVinculo ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={valorEdicao}
                                onChange={(e) =>
                                    setValorEdicao(
                                        formatValorBrInput(
                                            e.target.value,
                                        ),
                                    )
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    atualizarValorMutation.mutate(
                                        {
                                            campo: "desconto",
                                            valor: valorEdicao,
                                        },
                                    )
                                }
                                className="w-full bg-[#1a1c23] border border-primary/40 rounded px-1.5 py-1 text-xs text-white outline-none"
                            />

                            <button
                                type="button"
                                onClick={() =>
                                    atualizarValorMutation.mutate(
                                        {
                                            campo: "desconto",
                                            valor: valorEdicao,
                                        },
                                    )
                                }
                                title="Confirmar"
                                className="p-1 rounded hover:bg-primary/20 text-primary shrink-0"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={
                                !podeEditarEsteVinculo
                            }
                            onClick={() =>
                                iniciarEdicao(
                                    "desconto",
                                )
                            }
                            className="flex items-center gap-1 text-xs text-white/90 mt-0.5 group disabled:opacity-60"
                        >
                            {dinheiro(
                                Number(v.desconto) || 0,
                            )}

                            {podeEditarEsteVinculo && (
                                <Pencil className="w-3 h-3 text-muted-foreground group-hover:text-primary"/>
                            )}
                        </button>
                    )}
                </div>

                <div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        Juros/Multa
                    </span>

                    {editando === "juros_multa" && podeEditarEsteVinculo ? (
                        <div className="flex items-center gap-1 mt-0.5">
                            <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={valorEdicao}
                                onChange={(e) =>
                                    setValorEdicao(
                                        formatValorBrInput(
                                            e.target.value,
                                        ),
                                    )
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    atualizarValorMutation.mutate(
                                        {
                                            campo: "juros_multa",
                                            valor: valorEdicao,
                                        },
                                    )
                                }
                                className="w-full bg-[#1a1c23] border border-primary/40 rounded px-1.5 py-1 text-xs text-white outline-none"
                            />

                            <button
                                type="button"
                                onClick={() =>
                                    atualizarValorMutation.mutate(
                                        {
                                            campo: "juros_multa",
                                            valor: valorEdicao,
                                        },
                                    )
                                }
                                title="Confirmar"
                                className="p-1 rounded hover:bg-primary/20 text-primary shrink-0"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={
                                !podeEditarEsteVinculo
                            }
                            onClick={() =>
                                iniciarEdicao(
                                    "juros_multa",
                                )
                            }
                            className="flex items-center gap-1 text-xs text-white/90 mt-0.5 group disabled:opacity-60"
                        >
                            {dinheiro(
                                Number(jurosOuAcrescimo) || 0,
                            )}

                            {podeEditarEsteVinculo && (
                                <Pencil className="w-3 h-3 text-muted-foreground group-hover:text-primary"/>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                {isResidual ? (
                    <span title="Vencimento herdado da origem (não editável)">
                        {v.vencimento
                            ? formatDate(v.vencimento)
                            : "vencimento da origem"}
                    </span>
                ) : (
                    <span className="text-[10px]">
                        {rotuloStatus(v.status, v.tipo)}
                    </span>
                )}

                <span
                    className={cn(
                        "font-bold",
                        corNaturezaTexto(isCredito),
                    )}
                >
                    {dinheiro(
                        Number(v.valor_vinculado),
                    )}
                </span>
            </div>

            {/* Título com retenção na fonte: o extrato traz o líquido. */}
            {Number(v.total_retencoes ?? 0) > 0 && (
                <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                    Bruto {dinheiro(Number(v.valor_titulo ?? 0))} · Retenções{" "}
                    {dinheiro(Number(v.total_retencoes))}
                </p>
            )}

            {v.residuo_pendente && (
                <div
                    className="flex items-center gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-1 mt-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0"/>
                    <span className="truncate">
                        Residual de{" "}
                        {dinheiro(
                            Number(
                                v.residuo_pendente.valor,
                            ) || 0,
                        )}{" "}
                        será criado ao Salvar/Conciliar
                    </span>
                </div>
            )}

            {v.residuo_gerado && (
                <div className="rounded-lg bg-sky-500/10 border border-sky-500/25 px-2 py-1.5 mt-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-300">
                        <Copy className="w-3 h-3 shrink-0"/>
                        <span className="truncate">
                            Lançamento residual criado · #
                            {v.residuo_gerado.id}
                        </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate">
                            {v.residuo_gerado.vencimento
                                ? formatDate(
                                    v.residuo_gerado
                                        .vencimento,
                                )
                                : "-"}{" "}
                            ·{" "}
                            <span className="text-[10px]">
                                {rotuloStatus(v.residuo_gerado.status, v.tipo)}
                            </span>
                        </span>

                        <span className="font-bold text-sky-300">
                            {dinheiro(
                                Number(
                                    v.residuo_gerado.valor,
                                ) || 0,
                            )}
                        </span>
                    </div>
                </div>
            )}
        </li>
    );
}

const TOLERANCIA_SALDO = 0.005;
const BUSCA_DEBOUNCE_MS = 350;
const LINHAS_POR_PAGINA = 25;
const PENDING_RELOAD = "__reload__";

export default function ConciliacaoExtratoDetalhe({
                                                      extratoId,
                                                  }: {
    extratoId: string;
}) {
    const [location, setLocation] =
        useLocation();

    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {hasPermission} = useAuth();
    const dinheiro = useDinheiro();

    // Ações nas linhas também dependem do extrato não estar finalizado
    // (canVincular/canIgnorar/canDesfazer são definidos após carregar o extrato).
    const permVincular = hasPermission(
        PERM.CONCILIACAO_VINCULAR,
    );

    const permIgnorar = hasPermission(
        PERM.CONCILIACAO_IGNORAR,
    );

    const permDesfazer = hasPermission(
        PERM.CONCILIACAO_DESFAZER,
    );

    const canEditarLancamento = hasPermission(
        PERM.LANCAMENTOS_EDITAR,
    );

    const canConcluir = hasPermission(
        PERM.CONCILIACAO_CONCLUIR,
    );

    const canCriarRegra = hasPermission(
        PERM.REGRAS_CONCILIACAO_CRIAR,
    );

    const [
        vincularLinha,
        setVincularLinha,
    ] = useState<{
        id: number;
        valorAbs: string | number;
        tipoMovimento: string;
        dataMovimento: string | null;
        descricaoLinha: string | null;
        jaVinculadoLocalCents: number;
        ignorarVinculosReais: boolean;
    } | null>(null);

    const [
        ignorarLinhaId,
        setIgnorarLinhaId,
    ] = useState<number | null>(null);

    const [
        reverterLinhaId,
        setReverterLinhaId,
    ] = useState<number | null>(null);

    const [
        desfazerAlvo,
        setDesfazerAlvo,
    ] = useState<{
        linhaId: number;
        lancamentoId: number;
        isLocal: boolean;
    } | null>(null);

    const [
        finalizarOpen,
        setFinalizarOpen,
    ] = useState(false);

    const [
        reabrirOpen,
        setReabrirOpen,
    ] = useState(false);

    const [
        editarLancamentoId,
        setEditarLancamentoId,
    ] = useState<number | null>(null);

    const [
        draftsPorLinha,
        setDraftsPorLinha,
    ] = useState<Record<number, DraftAcao[]>>(
        {},
    );

    const [
        regraLinha,
        setRegraLinha,
    ] = useState<LinhaDetalhe | null>(null);

    /** Recusa do Salvar (409 etc.), com a linha apontada pelo backend. */
    const [
        erroSalvar,
        setErroSalvar,
    ] = useState<{ titulo: string; texto: string; linhaId: number | null } | null>(null);

    /** Confirmação de aplicar as regras nas linhas pendentes (após criar regra). */
    const [
        aplicarRegras,
        setAplicarRegras,
    ] = useState<{ casadas: number; comLancamento: number; excluidas: number } | null>(null);

    /** Linha a rolar até a vista ("Ir para a linha" do aviso de erro). */
    const [
        linhaAlvo,
        setLinhaAlvo,
    ] = useState<number | null>(null);

    // Filtros na URL (tipo, status e busca), aplicados no navegador sobre as linhas carregadas.
    const definicoesFiltro: DefinicaoFiltro[] = useMemo(() => [
        {
            chave: "tipo",
            rotulo: "Tipo",
            tipo: "select",
            placeholder: "Crédito e débito",
            opcoes: [
                {valor: "credito", rotulo: "Crédito"},
                {valor: "debito", rotulo: "Débito"},
            ],
        },
        {
            chave: "status",
            rotulo: "Status",
            tipo: "multi",
            opcoes: [
                {valor: "pendente", rotulo: "Pendente"},
                {valor: "vinculado", rotulo: "Vinculado"},
                {valor: "ignorado", rotulo: "Ignorado"},
            ],
        },
    ], []);
    const filtrosUrl = useFiltrosNaUrl(definicoesFiltro);
    const buscaUrl = filtrosUrl.ler("q");

    const filtrosAplicados = useMemo(
        () => ({
            tipo: filtrosUrl.valores.tipo ?? "",
            status: filtrosUrl.valores.status ?? "",
            busca: buscaUrl,
        }),
        [filtrosUrl.valores, buscaUrl],
    );

    const [
        linhasVisiveisCount,
        setLinhasVisiveisCount,
    ] = useState(LINHAS_POR_PAGINA);

    useEffect(() => {
        setLinhasVisiveisCount(
            LINHAS_POR_PAGINA,
        );
    }, [filtrosAplicados]);

    const {
        data,
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey: tenantQueryKey("conciliacao-extrato",
            extratoId,),
        queryFn: () =>
            fetchApiData<ExtratoDetalheResponse>(
                `/conciliacoes/${extratoId}`,
            ),
        enabled: !!extratoId,
    });

    const {data: parametros} = useQuery({
        queryKey: tenantQueryKey("conciliacoes-parametros",),
        queryFn: () =>
            fetchApiData<{
                motivo_ignorar_obrigatorio: boolean;
                motivos_predefinidos: string[];
            }>(
                "/conciliacoes/parametros",
            ),
        staleTime: 5 * 60_000,
    });

    const motivoObrigatorio =
        parametros?.motivo_ignorar_obrigatorio ??
        false;

    const extrato = data?.extrato;
    const conc = data?.conciliacao;
    const linhas = data?.linhas ?? [];

    // Finalizado (Conciliar) = travado: alterar exige "Reabrir conciliação".
    // Extrato antigo marcado "conciliado" sem ter sido finalizado vem com
    // finalizada=false e status "parcial" - pode ser revisto e finalizado aqui.
    const extratoFinalizado =
        conc?.finalizada ??
        extrato?.status === "conciliado";

    const canVincular = permVincular && !extratoFinalizado;
    const canIgnorar = permIgnorar && !extratoFinalizado;
    const canDesfazer = permDesfazer && !extratoFinalizado;

    const linhasEfetivas =
        useMemo<LinhaEfetiva[]>(
            () =>
                linhas.map((linha) =>
                    mergeLinhaComDraft(
                        linha,
                        draftsPorLinha[
                            linha.linha_id
                            ],
                    ),
                ),
            [linhas, draftsPorLinha],
        );

    const hasPendingChanges = useMemo(
        () =>
            Object.values(
                draftsPorLinha,
            ).some(
                (acoes) => acoes.length > 0,
            ),
        [draftsPorLinha],
    );

    const quitadoLocalPorLancamento =
        useMemo(() => {
            const mapa: Record<
                number,
                number
            > = {};

            for (const acoes of Object.values(
                draftsPorLinha,
            )) {
                for (const acao of acoes) {
                    if (
                        acao.tipo !==
                        "vincular"
                    )
                        continue;

                    for (const item of
                        acao.draft.itens) {
                        mapa[
                            item.lancamento_id
                            ] =
                            (mapa[
                                item.lancamento_id
                                ] ?? 0) +
                            Math.round(
                                item.valor_vinculado *
                                100,
                            );
                    }
                }
            }

            return mapa;
        }, [draftsPorLinha]);

    const allowUnloadRef =
        useRef(false);

    useEffect(() => {
        if (!hasPendingChanges) return;

        const handleBeforeUnload = (
            e: BeforeUnloadEvent,
        ) => {
            if (allowUnloadRef.current)
                return;

            e.preventDefault();

            e.returnValue =
                "Alterações não salvas. Você tem alterações não salvas. Deseja sair e descartar o progresso?";
        };

        window.addEventListener(
            "beforeunload",
            handleBeforeUnload,
        );

        return () =>
            window.removeEventListener(
                "beforeunload",
                handleBeforeUnload,
            );
    }, [hasPendingChanges]);

    const [
        pendingNavigationHref,
        setPendingNavigationHref,
    ] = useState<string | null>(null);

    const hasPendingChangesRef =
        useRef(hasPendingChanges);

    useEffect(() => {
        hasPendingChangesRef.current =
            hasPendingChanges;
    }, [hasPendingChanges]);

    const currentPathRef =
        useRef(location);

    useEffect(() => {
        currentPathRef.current =
            location;
    }, [location]);

    function irPara(href: string) {
        if (
            hasPendingChangesRef.current
        ) {
            setPendingNavigationHref(
                href,
            );
        } else {
            setLocation(href);
        }
    }

    useEffect(() => {
        if (!hasPendingChanges)
            return;

        const handleClick = (
            e: MouseEvent,
        ) => {
            if (
                e.defaultPrevented ||
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
            )
                return;

            const anchor = (
                e.target as HTMLElement | null
            )
                ?.closest?.(
                    "a[href]",
                ) as HTMLAnchorElement | null;

            if (
                !anchor ||
                anchor.target === "_blank"
            )
                return;

            const href =
                anchor.getAttribute(
                    "href",
                );

            if (
                !href ||
                !href.startsWith("/")
            )
                return;

            if (
                href ===
                currentPathRef.current
            )
                return;

            e.preventDefault();
            e.stopPropagation();

            setPendingNavigationHref(
                href,
            );
        };

        document.addEventListener(
            "click",
            handleClick,
            true,
        );

        return () =>
            document.removeEventListener(
                "click",
                handleClick,
                true,
            );
    }, [hasPendingChanges]);

    useEffect(() => {
        if (!hasPendingChanges)
            return;

        window.history.pushState(
            {ismTrap: true},
            "",
            window.location.href,
        );

        const handlePopState = () => {
            window.history.pushState(
                {ismTrap: true},
                "",
                window.location.href,
            );

            setPendingNavigationHref(
                "/conciliacao",
            );
        };

        window.addEventListener(
            "popstate",
            handlePopState,
        );

        return () =>
            window.removeEventListener(
                "popstate",
                handlePopState,
            );
    }, [hasPendingChanges]);

    useEffect(() => {
        if (!hasPendingChanges)
            return;

        const handleKeyDown = (
            e: KeyboardEvent,
        ) => {
            const isF5 =
                e.key === "F5";

            const isCtrlR =
                (e.ctrlKey ||
                    e.metaKey) &&
                (e.key === "r" ||
                    e.key === "R");

            if (!isF5 && !isCtrlR)
                return;

            e.preventDefault();
            e.stopPropagation();

            setPendingNavigationHref(
                PENDING_RELOAD,
            );
        };

        window.addEventListener(
            "keydown",
            handleKeyDown,
            true,
        );

        return () =>
            window.removeEventListener(
                "keydown",
                handleKeyDown,
                true,
            );
    }, [hasPendingChanges]);

    function confirmarSairComRascunho() {
        const href =
            pendingNavigationHref;

        setPendingNavigationHref(null);
        setDraftsPorLinha({});

        if (href === PENDING_RELOAD) {
            allowUnloadRef.current =
                true;

            window.location.reload();
            return;
        }

        if (href)
            setLocation(href);
    }

    function cancelarSairComRascunho() {
        setPendingNavigationHref(null);
    }

    function buildAcoesSalvar(): Array<
        Record<string, unknown>
    > {
        const acoes: Array<
            Record<string, unknown>
        > = [];

        for (const [
            linhaIdStr,
            draftArr,
        ] of Object.entries(
            draftsPorLinha,
        )) {
            const linhaId =
                Number(linhaIdStr);

            for (const acao of draftArr) {
                if (
                    acao.tipo ===
                    "vincular"
                ) {
                    const payload =
                        acao.draft.payload;

                    acoes.push({
                        tipo: "vincular",
                        linha_id: linhaId,
                        lancamentos:
                        payload.lancamentos,
                        gerar_parcial:
                        payload.gerar_parcial,
                        residuo_lancamento_id:
                        payload.residuo_lancamento_id,
                        // "Novo" do Vincular: excluir o extrato remove o título junto.
                        ...(acao.draft.criadoPeloExtrato
                            ? {criado_pelo_extrato: true}
                            : {}),
                    });
                } else if (
                    acao.tipo === "ignorar"
                ) {
                    acoes.push({
                        tipo: "ignorar",
                        linha_id: linhaId,
                        motivo_codigo:
                        acao.motivoCodigo,
                        motivo: acao.motivo,
                    });
                } else if (
                    acao.tipo ===
                    "desfazer"
                ) {
                    acoes.push({
                        tipo: "desfazer",
                        linha_id: linhaId,
                    });
                } else {
                    acoes.push({
                        tipo:
                            "reverter_ignorar",
                        linha_id: linhaId,
                    });
                }
            }
        }

        return acoes;
    }

    const salvarMutation =
        useMutation({
            mutationFn: (params: {
                finalizar: boolean;
            }) =>
                fetchApiData<{
                    extrato_id: number;
                    linhas_processadas: unknown[];
                    finalizado: boolean;
                }>(
                    `/conciliacoes/${extratoId}/salvar`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            acoes:
                                buildAcoesSalvar(),
                            finalizar:
                            params.finalizar,
                        }),
                    },
                ),

            onMutate: () => setErroSalvar(null),

            onSuccess: (
                resultado,
            ) => {
                setDraftsPorLinha({});
                setFinalizarOpen(false);

                invalidateRelated(
                    queryClient,
                    "conciliacao",
                );

                invalidateRelated(
                    queryClient,
                    "lancamentos",
                );

                void queryClient.invalidateQueries(
                    {
                        queryKey: tenantQueryKey("conciliacao-extrato",
                            extratoId,),
                    },
                );

                void queryClient.invalidateQueries(
                    {
                        queryKey: tenantQueryKey("conciliacoes-pendencias-mes",),
                    },
                );

                toast({
                    title:
                        resultado.finalizado
                            ? "Extrato conciliado"
                            : "Alterações salvas",

                    description:
                        resultado.finalizado
                            ? "Conciliação concluída com sucesso."
                            : "Suas alterações foram salvas com sucesso.",
                });
            },

            onError: (e: unknown) => {
                const msg =
                    e instanceof Error
                        ? e.message
                        : "Não foi possível salvar as alterações.";

                setFinalizarOpen(false);

                // Recusa de regra de negócio (ex.: título já vinculado em outra
                // linha): aviso fixo na tela apontando a linha, como no Vincular.
                if (e instanceof ApiError && e.status === 409) {
                    const {linhaId, texto} = separarLinhaDoErro(msg);
                    const ehVinculo =
                        linhaId != null &&
                        (draftsPorLinha[linhaId] ?? []).some((a) => a.tipo === "vincular");
                    const titulo = ehVinculo ? "Vínculo não permitido" : "Não foi possível salvar";
                    setErroSalvar({titulo, texto, linhaId});
                    toast({
                        variant: "destructive",
                        title: titulo,
                        description: linhaId != null ? `Linha #${linhaId}: ${texto}` : texto,
                    });
                    return;
                }

                toast({
                    variant:
                        "destructive",
                    title:
                        "Erro ao salvar",
                    description: msg,
                });
            },
        });

    const reabrirMutation =
        useMutation({
            mutationFn: () =>
                fetchApiData<{ reaberta: boolean }>(
                    `/conciliacoes/${conc?.id}/reabrir`,
                    {method: "POST", body: JSON.stringify({})},
                ),

            onSuccess: () => {
                setReabrirOpen(false);
                invalidateRelated(queryClient, "conciliacao");
                void queryClient.invalidateQueries({
                    queryKey: tenantQueryKey("conciliacao-extrato", extratoId),
                });
                void queryClient.invalidateQueries({
                    queryKey: tenantQueryKey("conciliacoes-pendencias-mes"),
                });
                toast({
                    title: "Conciliação reaberta",
                    description: "As linhas podem ser alteradas. Clique em Conciliar para fechar de novo.",
                });
            },

            onError: (e: unknown) => {
                setReabrirOpen(false);
                toast({
                    variant: "destructive",
                    title: "Não foi possível reabrir",
                    description: e instanceof Error ? e.message : String(e),
                });
            },
        });

    // Regra criada a partir de uma linha: oferece aplicá-la nas linhas pendentes
    // deste extrato (o que a importação faria). Linhas com rascunho ficam de fora.
    type AplicarRegrasResp = {
        linhas_casadas: number;
        linhas_com_lancamento: number;
        linhas_vinculadas: number;
    };

    const aplicarRegrasMutation =
        useMutation({
            mutationFn: (preview: boolean) =>
                fetchApiData<AplicarRegrasResp>(
                    `/conciliacoes/${extratoId}/aplicar-regras`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            preview,
                            excluir_linhas: Object.keys(draftsPorLinha).map(Number),
                        }),
                    },
                ),

            onSuccess: async (r, preview) => {
                if (preview) {
                    if (r.linhas_casadas > 0) {
                        setAplicarRegras({
                            casadas: r.linhas_casadas,
                            comLancamento: r.linhas_com_lancamento,
                            excluidas: Object.keys(draftsPorLinha).length,
                        });
                    } else {
                        toast({
                            title: "Regra salva",
                            description: "Nenhuma linha pendente deste extrato casa com as regras.",
                        });
                    }
                    return;
                }

                invalidateRelated(queryClient, "conciliacao");
                invalidateRelated(queryClient, "lancamentos");
                void queryClient.invalidateQueries({queryKey: tenantQueryKey("conciliacoes")});
                void queryClient.invalidateQueries({queryKey: tenantQueryKey("conciliacoes-pendencias-mes")});
                // Linhas vinculadas pela regra já aparecem vinculadas ao fechar a
                // confirmação: espera o extrato recarregar (antes só aparecia
                // depois de "Atualizar extrato").
                await queryClient
                    .refetchQueries({queryKey: tenantQueryKey("conciliacao-extrato", extratoId), exact: true})
                    .catch(() => undefined);
                setAplicarRegras(null);
                toast({
                    title: "Regra aplicada",
                    description:
                        r.linhas_vinculadas > 0
                            ? `${r.linhas_casadas} linha(s) classificada(s); ${r.linhas_vinculadas} com lançamento criado e vinculado. Revise e clique em Conciliar.`
                            : `${r.linhas_casadas} linha(s) classificada(s) pela regra.`,
                });
            },

            onError: (e: unknown) => {
                setAplicarRegras(null);
                toast({
                    variant: "destructive",
                    title: "Não foi possível aplicar a regra",
                    description: e instanceof Error ? e.message : String(e),
                });
            },
        });

    function aposSalvarRegra() {
        setRegraLinha(null);
        if (extratoFinalizado) {
            toast({
                title: "Regra salva",
                description: "Este extrato está conciliado: reabra a conciliação para aplicar a regra nas linhas dele.",
            });
            return;
        }
        if (canVincular) aplicarRegrasMutation.mutate(true);
    }

    const pendentesEfetivos =
        useMemo(
            () =>
                linhasEfetivas.filter(
                    (l) =>
                        l.status ===
                        "pendente",
                ).length,
            [linhasEfetivas],
        );

    const podeFinalizar =
        pendentesEfetivos === 0;

    const semPermissaoFinalizar = podeFinalizar && !canConcluir;

    const rotuloAcaoConciliacao =
        podeFinalizar
            ? "Conciliar"
            : "Salvar";

    const linhasFiltradas =
        useMemo(() => {
            return linhasEfetivas.filter(
                (linha) => {
                    if (
                        filtrosAplicados.tipo &&
                        linha.tipo_movimento !==
                        filtrosAplicados.tipo
                    ) {
                        return false;
                    }

                    if (
                        !casaMulti(
                            filtrosAplicados.status,
                            linha.status,
                        )
                    ) {
                        return false;
                    }

                    if (
                        filtrosAplicados.busca
                    ) {
                        const alvo =
                            normalizarTextoBusca(
                                linha.descricao ??
                                "",
                            );

                        const termo =
                            normalizarTextoBusca(
                                filtrosAplicados.busca,
                            );

                        if (
                            !alvo.includes(
                                termo,
                            )
                        ) {
                            return false;
                        }
                    }

                    return true;
                },
            );
        }, [
            linhasEfetivas,
            filtrosAplicados,
        ]);

    const linhasVisiveis =
        useMemo(
            () =>
                linhasFiltradas.slice(
                    0,
                    linhasVisiveisCount,
                ),
            [
                linhasFiltradas,
                linhasVisiveisCount,
            ],
        );

    const restantesParaCarregar =
        linhasFiltradas.length -
        linhasVisiveis.length;

    // "Ir para a linha": tira filtros que a escondem, carrega até ela e rola.
    function irParaLinha(linhaId: number) {
        if (!linhasFiltradas.some((l) => l.linha_id === linhaId)) {
            filtrosUrl.atualizar({tipo: null, status: null, q: null});
        }
        setLinhaAlvo(linhaId);
    }

    useEffect(() => {
        if (linhaAlvo == null) return;
        const idx = linhasFiltradas.findIndex((l) => l.linha_id === linhaAlvo);
        if (idx < 0) return;
        const el = document.getElementById(`linha-extrato-${linhaAlvo}`);
        if (!el) {
            if (idx >= linhasVisiveisCount) setLinhasVisiveisCount(idx + 1);
            return;
        }
        // Só o contêiner da tabela rola: scrollIntoView rolava também o layout
        // do app e o cabeçalho saía da tela.
        rolarAteElemento(el);
        setLinhaAlvo(null);
    }, [linhaAlvo, linhasFiltradas, linhasVisiveisCount]);

    const linhaDoErro =
        erroSalvar?.linhaId != null
            ? linhasEfetivas.find((l) => l.linha_id === erroSalvar.linhaId) ?? null
            : null;

    return (
        <div className="flex flex-col gap-4 h-full w-full px-0 py-2">
            <button
                type="button"
                onClick={() =>
                    irPara(
                        "/conciliacao",
                    )
                }
                className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors w-fit"
            >
                <ArrowLeft className="w-3.5 h-3.5"/>
                Voltar para conciliações
            </button>

            {vincularLinha && (
                <VincularModal
                    open
                    extratoId={extratoId}
                    linhaId={
                        vincularLinha.id
                    }
                    valorExtratoAbs={
                        vincularLinha.valorAbs
                    }
                    tipoMovimento={
                        vincularLinha.tipoMovimento
                    }
                    dataMovimento={
                        vincularLinha.dataMovimento
                    }
                    descricaoLinha={
                        vincularLinha.descricaoLinha
                    }
                    jaVinculadoLocalCents={
                        vincularLinha.jaVinculadoLocalCents
                    }
                    quitadoLocalPorLancamento={
                        quitadoLocalPorLancamento
                    }
                    ignorarVinculosReais={
                        vincularLinha.ignorarVinculosReais
                    }
                    onClose={() =>
                        setVincularLinha(
                            null,
                        )
                    }
                    onDraftVincular={(
                        draft,
                    ) => {
                        setDraftsPorLinha(
                            (prev) => {
                                const atual =
                                    prev[
                                        draft.linhaId
                                        ] ?? [];

                                return {
                                    ...prev,
                                    [draft.linhaId]:
                                        [
                                            ...atual,
                                            {
                                                tipo: "vincular",
                                                draft,
                                            },
                                        ],
                                };
                            },
                        );
                    }}
                />
            )}

            {regraLinha && (
                <RegraConciliacaoModal
                    open
                    prefill={{
                        texto_gatilho:
                            regraLinha.descricao ??
                            "",
                        natureza:
                            regraLinha.tipo_movimento ===
                            "credito"
                                ? "entrada"
                                : "saida",
                        conta_id:
                            extrato?.conta_id ??
                            null,
                    }}
                    onClose={() =>
                        setRegraLinha(
                            null,
                        )
                    }
                    onSuccess={aposSalvarRegra}
                />
            )}

            <ConfirmDialog
                open={aplicarRegras != null}
                title="Aplicar a regra neste extrato?"
                description={
                    aplicarRegras
                        ? `${aplicarRegras.casadas} linha(s) pendente(s) deste extrato casam com as regras de conciliação. ` +
                          (aplicarRegras.comLancamento > 0
                              ? `Em ${aplicarRegras.comLancamento}, o lançamento será criado e quitado agora, como na importação (desfazer a linha devolve). `
                              : "Elas serão marcadas como classificadas pela regra. ") +
                          (aplicarRegras.excluidas > 0
                              ? "Linhas com alterações ainda não salvas ficam de fora."
                              : "")
                        : ""
                }
                confirmLabel="Aplicar"
                variant="default"
                icon={Sparkles}
                confirmDisabled={aplicarRegrasMutation.isPending}
                onCancel={() => setAplicarRegras(null)}
                onConfirm={() => {
                    if (aplicarRegrasMutation.isPending) return;
                    aplicarRegrasMutation.mutate(false);
                }}
            />

            <IgnorarLinhaModal
                open={
                    ignorarLinhaId != null
                }
                obrigatorio={
                    motivoObrigatorio
                }
                pending={false}
                onClose={() =>
                    setIgnorarLinhaId(
                        null,
                    )
                }
                onConfirm={(
                    payload: MotivoIgnorarPayload,
                ) => {
                    if (
                        ignorarLinhaId ==
                        null
                    )
                        return;

                    const linhaId =
                        ignorarLinhaId;

                    const linhaServidor =
                        linhas.find(
                            (l) =>
                                l.linha_id ===
                                linhaId,
                        );

                    setDraftsPorLinha(
                        (prev) => {
                            if (
                                linhaServidor?.status ===
                                "ignorado"
                            ) {
                                const {
                                    [linhaId]:
                                        _removido,
                                    ...resto
                                } = prev;

                                return resto;
                            }

                            return {
                                ...prev,
                                [linhaId]: [
                                    {
                                        tipo: "ignorar",
                                        motivoCodigo:
                                        payload.motivo_codigo,
                                        motivo:
                                        payload.motivo,
                                    },
                                ],
                            };
                        },
                    );

                    setIgnorarLinhaId(
                        null,
                    );

                    toast({
                        title:
                            "Linha marcada para ignorar",
                        description:
                            "Ainda não foi salvo - clique em Salvar/Conciliar para confirmar.",
                    });
                }}
            />

            <ConfirmDialog
                open={
                    reverterLinhaId !=
                    null
                }
                title="Reverter ignorar?"
                description="A linha voltará ao status pendente e poderá ser vinculada novamente. Nenhum motivo é exigido."
                confirmLabel="Reverter"
                variant="warning"
                icon={RotateCcw}
                onCancel={() =>
                    setReverterLinhaId(
                        null,
                    )
                }
                onConfirm={() => {
                    if (
                        reverterLinhaId ==
                        null
                    )
                        return;

                    const linhaId =
                        reverterLinhaId;

                    setDraftsPorLinha(
                        (prev) => {
                            const atual =
                                prev[
                                    linhaId
                                    ];

                            if (
                                atual &&
                                atual[0]
                                    ?.tipo ===
                                "ignorar"
                            ) {
                                const {
                                    [linhaId]:
                                        _removido,
                                    ...resto
                                } = prev;

                                return resto;
                            }

                            return {
                                ...prev,
                                [linhaId]: [
                                    {
                                        tipo: "reverter_ignorar",
                                    },
                                ],
                            };
                        },
                    );

                    setReverterLinhaId(
                        null,
                    );

                    toast({
                        title:
                            "Reverter rascunhado",
                        description:
                            "Ainda não foi salvo - clique em Salvar/Conciliar para confirmar.",
                    });
                }}
            />

            {/* ============================================================
                CONFIRMAÇÃO DO ESTORNO DA QUITAÇÃO
                ============================================================ */}
            <ConfirmDialog
                open={desfazerAlvo != null}
                // Vínculo ainda não salvo: não há quitação a estornar, só sai do rascunho.
                title={desfazerAlvo?.isLocal ? "Remover o vínculo deste rascunho?" : "Confirmar o estorno da quitação?"}
                description={
                    desfazerAlvo?.isLocal
                        ? "O vínculo ainda não foi salvo: ele só sai do rascunho desta linha. O lançamento e o saldo não mudam."
                        : "O saldo será alterado e o lançamento voltará para situação prevista inicial. Obs.: A conciliação também será desfeita."
                }
                confirmLabel={desfazerAlvo?.isLocal ? "Remover vínculo" : "Confirmo"}
                cancelLabel="Cancelar"
                variant="destructive"
                icon={Unlink}
                onCancel={() =>
                    setDesfazerAlvo(null)
                }
                onConfirm={() => {
                    if (
                        desfazerAlvo ==
                        null
                    )
                        return;

                    const alvo =
                        desfazerAlvo;

                    if (alvo.isLocal) {
                        setDraftsPorLinha(
                            (prev) =>
                                removerLancamentoDoRascunho(
                                    prev,
                                    alvo.linhaId,
                                    alvo.lancamentoId,
                                ),
                        );

                        setDesfazerAlvo(
                            null,
                        );

                        toast({
                            title:
                                "Vínculo removido (rascunho)",
                            description:
                                "Ainda não foi salvo - clique em Salvar/Conciliar para confirmar.",
                        });

                        return;
                    }

                    const linhaServidor =
                        linhas.find(
                            (l) =>
                                l.linha_id ===
                                alvo.linhaId,
                        );

                    setDraftsPorLinha(
                        (prev) => {
                            if (
                                linhaServidor?.status ===
                                "vinculado"
                            ) {
                                return {
                                    ...prev,
                                    [alvo.linhaId]:
                                        [
                                            {
                                                tipo: "desfazer",
                                            },
                                        ],
                                };
                            }

                            const {
                                [alvo.linhaId]:
                                    _removido,
                                ...resto
                            } = prev;

                            return resto;
                        },
                    );

                    setDesfazerAlvo(
                        null,
                    );

                    toast({
                        title:
                            "Estorno da quitação rascunhado",
                        description:
                            "Ainda não foi salvo - clique em Salvar/Conciliar para confirmar.",
                    });
                }}
            />

            <ConfirmDialog
                open={finalizarOpen}
                title="Conciliar extrato?"
                description="Não pode haver linhas pendentes. Após conciliar, o extrato fica marcado como conciliado e travado: para alterar alguma linha depois, será preciso reabrir a conciliação."
                confirmLabel="Conciliar"
                variant="default"
                icon={CheckCircle2}
                confirmDisabled={salvarMutation.isPending}
                onCancel={() =>
                    setFinalizarOpen(
                        false,
                    )
                }
                onConfirm={() => {
                    if (salvarMutation.isPending) return;
                    salvarMutation.mutate({
                        finalizar: true,
                    });
                }}
            />

            <ConfirmDialog
                open={reabrirOpen}
                title="Reabrir conciliação?"
                description="O extrato volta a ficar pendente de conciliação e as linhas podem ser alteradas (desfazer, ignorar, vincular). Os lançamentos continuam quitados enquanto os vínculos existirem. Para fechar de novo, clique em Conciliar."
                confirmLabel="Reabrir"
                variant="warning"
                icon={RotateCcw}
                confirmDisabled={reabrirMutation.isPending}
                onCancel={() => setReabrirOpen(false)}
                onConfirm={() => {
                    if (reabrirMutation.isPending) return;
                    reabrirMutation.mutate();
                }}
            />

            <ConfirmDialog
                open={
                    pendingNavigationHref !=
                    null
                }
                title="Alterações não salvas"
                description="Você tem alterações não salvas. Deseja sair e descartar o progresso?"
                confirmLabel="Sair"
                cancelLabel="Continuar editando"
                variant="warning"
                icon={AlertCircle}
                onCancel={
                    cancelarSairComRascunho
                }
                onConfirm={
                    confirmarSairComRascunho
                }
            />

            <EditarLancamentoConciliacaoModal
                open={
                    editarLancamentoId !=
                    null
                }
                lancamentoId={
                    editarLancamentoId
                }
                onClose={() =>
                    setEditarLancamentoId(
                        null,
                    )
                }
                onSaved={() => {
                    void queryClient.invalidateQueries(
                        {
                            queryKey: tenantQueryKey("conciliacao-extrato",
                                extratoId,),
                        },
                    );
                }}
            />

            {isLoading ? (
                <div className="glass-panel rounded-2xl p-16 flex flex-col items-center gap-3 border border-white/10">
                    <Loader2 className="w-10 h-10 animate-spin text-primary"/>
                    <p className="text-sm text-muted-foreground">
                        Carregando extrato…
                    </p>
                </div>
            ) : isError ||
            !extrato ||
            !conc ? (
                <div className="glass-panel rounded-2xl p-10 border border-destructive/30 text-center">
                    <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3"/>

                    <p className="text-sm text-white font-medium">
                        Não foi possível
                        carregar este
                        extrato.
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            void refetch()
                        }
                        className="mt-4 text-xs text-primary underline"
                    >
                        Tentar novamente
                    </button>
                </div>
            ) : (
                <>
                    <div
                        className="glass-panel rounded-xl border border-white/10 overflow-hidden flex flex-col flex-1 min-h-0 w-full min-w-0 max-w-none">
                        <div
                            className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-white/5 bg-black/10">
                            <FiltrosPopover
                                definicoes={definicoesFiltro}
                                valores={filtrosUrl.valores}
                                contagem={filtrosUrl.contagem}
                                onAplicar={filtrosUrl.aplicar}
                            />

                            <button
                                type="button"
                                title="Atualizar"
                                aria-label="Atualizar extrato"
                                onClick={() =>
                                    void refetch()
                                }
                                className={cn("p-1.5 rounded-lg border border-white/10 text-white/80 hover:bg-white/5 hover:text-white", FOCO_VISIVEL)}
                            >
                                <RefreshCw
                                    aria-hidden="true"
                                    className={cn(
                                        "w-3.5 h-3.5",
                                        isLoading &&
                                        "animate-spin",
                                    )}
                                />
                            </button>

                            <div className="flex-1"/>

                            <CampoBusca
                                valor={buscaUrl}
                                onBuscar={(termo) => filtrosUrl.atualizar({q: termo || null})}
                                placeholder="Pesquisar na descrição…"
                                rotulo="Pesquisar linhas do extrato pela descrição"
                                atrasoMs={BUSCA_DEBOUNCE_MS}
                                className="sm:w-64"
                            />
                        </div>

                        <FiltrosAtivos
                            chips={filtrosUrl.chips}
                            onRemover={filtrosUrl.remover}
                            onLimparTodos={filtrosUrl.limpar}
                            anuncio={`${linhasFiltradas.length} ${linhasFiltradas.length === 1 ? "linha encontrada" : "linhas encontradas"}`}
                            className="px-3.5"
                        />

                        {erroSalvar && (
                            <div
                                role="alert"
                                className="mx-3.5 my-2 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2"
                            >
                                <AlertCircle aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0 text-red-300"/>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-red-200">
                                        {erroSalvar.titulo}
                                        {erroSalvar.linhaId != null && ` · Linha #${erroSalvar.linhaId}`}
                                    </p>
                                    {linhaDoErro && (
                                        <p className="text-[11px] text-red-100/70 truncate">
                                            {linhaDoErro.data_movimento ? `${formatDate(linhaDoErro.data_movimento)} · ` : ""}
                                            {linhaDoErro.descricao ?? "-"} · {dinheiro(Math.abs(Number(linhaDoErro.valor)))}
                                        </p>
                                    )}
                                    <p className="text-xs text-red-100/90 leading-snug mt-0.5">{erroSalvar.texto}</p>
                                    <p className="text-[11px] text-red-100/70 mt-0.5">Nada foi salvo. Corrija a linha e salve de novo.</p>
                                </div>
                                {erroSalvar.linhaId != null && linhaDoErro && (
                                    <button
                                        type="button"
                                        onClick={() => irParaLinha(erroSalvar.linhaId!)}
                                        className={cn("shrink-0 px-2.5 py-1 rounded-lg border border-red-400/40 text-[11px] font-semibold text-red-100 hover:bg-red-500/15", FOCO_VISIVEL)}
                                    >
                                        Ir para a linha
                                    </button>
                                )}
                                <button
                                    type="button"
                                    aria-label="Fechar aviso"
                                    onClick={() => setErroSalvar(null)}
                                    className={cn("shrink-0 p-1 rounded hover:bg-red-500/15 text-red-200", FOCO_VISIVEL)}
                                >
                                    <X aria-hidden="true" className="w-3.5 h-3.5"/>
                                </button>
                            </div>
                        )}

                        <div
                            className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] border-b border-white/5 bg-black/20">
                            <div className="px-3.5 py-2.5 flex items-center justify-center gap-2 flex-wrap">
                                <Download className="w-3.5 h-3.5 text-primary shrink-0"/>

                                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                                    Extrato #{extrato.id}
                                </h2>

                                {extrato.periodo_inicio &&
                                    extrato.periodo_fim && (
                                        <span className="text-[10px] font-normal normal-case text-muted-foreground">
                                            · Período{" "}
                                            {formatDate(
                                                extrato.periodo_inicio,
                                            )}{" "}
                                            -{" "}
                                            {formatDate(
                                                extrato.periodo_fim,
                                            )}
                </span>
                                    )}
                            </div>

                            <div className="hidden xl:block"/>

                            <div
                                className="px-3.5 py-2.5 flex items-center justify-center gap-2 border-t xl:border-t-0 border-white/5">
                                <Unlink className="w-3.5 h-3.5 text-primary shrink-0"/>

                                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                                    {extratoFinalizado
                                        ? "Movimentações conciliadas"
                                        : pendentesEfetivos > 0
                                            ? "Movimentações não conciliadas"
                                            : "Movimentações a conciliar"}
                                </h2>
                            </div>
                        </div>

                        {linhasFiltradas.length ===
                        0 ? (
                            <div className="py-16 text-center text-xs text-muted-foreground">
                                Nenhuma linha
                                encontrada com
                                os filtros
                                aplicados.
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5 overflow-y-auto flex-1 min-h-[16rem] max-h-[calc(100dvh-15rem)]">
                                {/* Altura limitada à janela: a lista rola por dentro ("Ir para a linha" rola só ela,
                                    sem levar o cabeçalho do app embora) e o rodapé Salvar/Conciliar fica à vista. */}
                                {linhasVisiveis.map(
                                    (
                                        linha,
                                    ) => {
                                        const isPendente =
                                            linha.status ===
                                            "pendente";

                                        const isVinculado =
                                            linha.status ===
                                            "vinculado";

                                        const isIgnorado =
                                            linha.status ===
                                            "ignorado";

                                        const isCredito =
                                            linha.tipo_movimento ===
                                            "credito";

                                        const valorAbs =
                                            Math.abs(
                                                Number(
                                                    linha.valor,
                                                ),
                                            );

                                        const saldoAbs =
                                            Math.abs(
                                                Number(
                                                    linha.valor_saldo,
                                                ),
                                            );

                                        const faltaFechar =
                                            saldoAbs >
                                            TOLERANCIA_SALDO;

                                        const podeVincularMais =
                                            !isIgnorado &&
                                            (isPendente ||
                                                faltaFechar);

                                        return (
                                            <div
                                                key={
                                                    linha.linha_id
                                                }
                                                id={`linha-extrato-${linha.linha_id}`}
                                                className={cn(
                                                    "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] divide-y xl:divide-y-0 xl:divide-x divide-white/5",
                                                    isIgnorado &&
                                                    "opacity-45 grayscale-[0.35] bg-white/[0.015]",
                                                    erroSalvar?.linhaId === linha.linha_id &&
                                                    "ring-2 ring-inset ring-red-500/60 bg-red-500/[0.04]",
                                                )}
                                            >
                                                <div className="p-3 space-y-1.5 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="flex items-center gap-2 min-w-0">
                          <span
                              className={cn(
                                  "text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0",
                                  corNaturezaBadge(
                                      isCredito,
                                  ),
                              )}
                          >
                                                                {isCredito ? "Crédito" : "Débito"}
                          </span>

                                                            {linha.data_movimento && (
                                                                <span
                                                                    className="text-xs text-muted-foreground truncate">
                                                                    {formatDate(
                                                                        linha.data_movimento,
                                                                    )}
                                                                </span>
                                                            )}

                                                            {linha._draftAtivo && (
                                                                <span
                                                                    title="Alterações locais ainda não salvas nesta linha"
                                                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 uppercase tracking-wide shrink-0"
                                                                >
                                                                    Não salvo
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {canCriarRegra && (
                                                                <button
                                                                    type="button"
                                                                    title="Criar regra de conciliação automática a partir desta linha"
                                                                    onClick={() =>
                                                                        setRegraLinha(
                                                                            linha,
                                                                        )
                                                                    }
                                                                    className="w-6 h-6 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5"/>
                                                                </button>
                                                            )}

                                                            {isPendente &&
                                                                canIgnorar && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setIgnorarLinhaId(
                                                                                linha.linha_id,
                                                                            )
                                                                        }
                                                                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/90 whitespace-nowrap"
                                                                    >
                                                                        <Ban className="w-3 h-3"/>
                                                                        Ignorar
                                                                    </button>
                                                                )}

                                                            {isIgnorado &&
                                                                canDesfazer && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setReverterLinhaId(
                                                                                linha.linha_id,
                                                                            )
                                                                        }
                                                                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[11px] font-semibold text-amber-200 whitespace-nowrap"
                                                                    >
                                                                        <RotateCcw className="w-3 h-3"/>
                                                                        Reverter
                                                                    </button>
                                                                )}
                                                        </div>
                                                    </div>

                                                    <p className="text-sm text-white font-medium leading-snug">
                                                        {linha.descricao ??
                                                            "-"}
                                                    </p>

                                                    <span
                                                        className={cn(
                                                            "block text-lg font-black",
                                                            corNaturezaTexto(
                                                                isCredito,
                                                            ),
                                                        )}
                                                    >
                                                        {dinheiro(
                                                            valorAbs,
                                                        )}
                                  </span>

                                                    {isVinculado &&
                                                        faltaFechar && (
                                                            <p className="text-[11px] text-amber-300/90">
                                                                Falta
                                                                vincular{" "}
                                                                {dinheiro(
                                                                    saldoAbs,
                                                                )}
                                                            </p>
                                                        )}

                                                    {linha.classificacao_automatica && (
                                                        <p className="text-[11px] text-sky-300/90 bg-sky-500/10 border border-sky-500/25 rounded-lg px-2 py-1 inline-flex items-center gap-1.5">
                                                            <Sparkles className="w-3 h-3 shrink-0"/>

                                                            {linha.status ===
                                                            "pendente" &&
                                                            linha.regra_criar_lancamento
                                                                ? "Essa movimentação será criada"
                                                                : linha.status ===
                                                                "pendente"
                                                                    ? "Classificação sugerida pela regra - revise"
                                                                    : "Classificada automaticamente pela regra"}

                                                            {linha.regra_texto_gatilho
                                                                ? ` (“${linha.regra_texto_gatilho}”)`
                                                                : ""}
                                                        </p>
                                                    )}

                                                    {linha.documento && (
                                                        <p className="text-[10px] text-muted-foreground font-mono">
                                                            Doc.{" "}
                                                            {
                                                                linha.documento
                                                            }
                                                        </p>
                                                    )}

                                                    {linha.saldo_pos_linha !=
                                                        null && (
                                                            <p className="text-[11px] text-muted-foreground">
                                                                Saldo
                                                                pós-linha:{" "}
                                                                {dinheiro(
                                                                    Number(
                                                                        linha.saldo_pos_linha,
                                                                    ),
                                                                )}
                                                            </p>
                                                        )}
                                                </div>

                                                <div className="flex items-center justify-center py-1.5 xl:py-2">
                                                    {!isIgnorado && (
                                                        <div
                                                            className={cn(
                                                                "w-7 h-7 rounded-full flex items-center justify-center border shrink-0",
                                                                !faltaFechar
                                                                    ? "bg-white/5 border-white/15 text-muted-foreground"
                                                                    : "bg-amber-500/15 border-amber-500/40 text-amber-300",
                                                            )}
                                                            title={
                                                                !faltaFechar
                                                                    ? "Os valores batem"
                                                                    : "Os valores divergem"
                                                            }
                                                        >
                                                            {!faltaFechar ? (
                                                                <Link2 className="w-3.5 h-3.5"/>
                                                            ) : (
                                                                <span className="text-xs font-black">
                                                                    ≠
                                    </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="p-3 min-w-0 space-y-1.5">
                                                    {isVinculado &&
                                                        linha.vinculacoes.length >
                                                        0 && (
                                                            <ul className="space-y-1.5">
                                                                {linha.vinculacoes.map(
                                                                    (
                                                                        v,
                                                                    ) => (
                                                                        <CardLancamento
                                                                            key={
                                                                                v.vinculo_id ??
                                                                                v.lancamento_id
                                                                            }
                                                                            v={
                                                                                v
                                                                            }
                                                                            extratoId={
                                                                                extratoId
                                                                            }
                                                                            linhaId={
                                                                                linha.linha_id
                                                                            }
                                                                            canEditarLancamento={
                                                                                canEditarLancamento &&
                                                                                !extratoFinalizado
                                                                            }
                                                                            canEditarVinculo={
                                                                                canVincular
                                                                            }
                                                                            canDesfazer={
                                                                                canDesfazer
                                                                            }
                                                                            onEditarLancamento={() =>
                                                                                setEditarLancamentoId(
                                                                                    v.lancamento_id,
                                                                                )
                                                                            }
                                                                            onRemoverVinculo={() =>
                                                                                setDesfazerAlvo(
                                                                                    {
                                                                                        linhaId:
                                                                                        linha.linha_id,
                                                                                        lancamentoId:
                                                                                        v.lancamento_id,
                                                                                        isLocal:
                                                                                            Boolean(
                                                                                                v._local,
                                                                                            ),
                                                                                    },
                                                                                )
                                                                            }
                                                                        />
                                                                    ),
                                                                )}
                                                            </ul>
                                                        )}

                                                    {podeVincularMais &&
                                                        canVincular && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setVincularLinha(
                                                                        {
                                                                            id: linha.linha_id,
                                                                            valorAbs:
                                                                            saldoAbs,
                                                                            tipoMovimento:
                                                                            linha.tipo_movimento,
                                                                            dataMovimento:
                                                                            linha.data_movimento,
                                                                            descricaoLinha:
                                                                            linha.descricao,
                                                                            jaVinculadoLocalCents:
                                                                            linha._jaVinculadoLocalCents,
                                                                            ignorarVinculosReais:
                                                                            linha._ignorarVinculosReais,
                                                                        },
                                                                    )
                                                                }
                                                                className="w-[40%] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20"
                                                            >
                                                                <Search className="w-3.5 h-3.5"/>
                                                                Vincular
                                                            </button>
                                                        )}

                                                    {isIgnorado && (
                                                        <p className="text-[11px] text-muted-foreground italic py-2">
                                                            Linha
                                                            ignorada
                                                            - sem
                                                            lançamento
                                                            vinculado.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    },
                                )}

                                {restantesParaCarregar >
                                    0 && (
                                        <div className="py-4 flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setLinhasVisiveisCount(
                                                        (
                                                            n,
                                                        ) =>
                                                            n +
                                                            LINHAS_POR_PAGINA,
                                                    )
                                                }
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-white transition-colors"
                                            >
                                                <ChevronDown className="w-3.5 h-3.5"/>
                                                Role para
                                                carregar
                                                mais (
                                                {
                                                    restantesParaCarregar
                                                }{" "}
                                                restante
                                                {restantesParaCarregar ===
                                                1
                                                    ? ""
                                                    : "s"}
                                                )
                                            </button>
                                        </div>
                                    )}
                            </div>
                        )}

                        <div
                            className="flex items-center justify-end gap-3 px-4 py-3 border-t border-white/5 bg-black/25">
                            {hasPendingChanges && (
                                <span className="text-[11px] text-amber-300/90 flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5"/>
                                    Você tem
                                    alterações não
                                    salvas
                                </span>
                            )}

                            {extratoFinalizado && (
                                <span className="text-[11px] text-emerald-300/90 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5"/>
                                    Extrato conciliado. Para alterar, reabra a conciliação.
                                </span>
                            )}

                            {!extratoFinalizado && podeFinalizar && !hasPendingChanges && !semPermissaoFinalizar && (
                                <span className="text-[11px] text-amber-300/90 flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5"/>
                                    Todas as linhas tratadas. Revise e clique em Conciliar para finalizar.
                                </span>
                            )}

                            {extratoFinalizado && canConcluir && (
                                <button
                                    type="button"
                                    disabled={reabrirMutation.isPending || !conc}
                                    onClick={() => setReabrirOpen(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold disabled:opacity-40"
                                >
                                    {reabrirMutation.isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin"/>
                                    ) : (
                                        <RotateCcw className="w-4 h-4"/>
                                    )}
                                    Reabrir conciliação
                                </button>
                            )}

                            {semPermissaoFinalizar && hasPendingChanges && (
                                <button
                                    type="button"
                                    disabled={
                                        salvarMutation.isPending ||
                                        extratoFinalizado
                                    }
                                    onClick={() => {
                                        if (salvarMutation.isPending) return;
                                        salvarMutation.mutate({finalizar: false});
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold disabled:opacity-40"
                                >
                                    Salvar
                                </button>
                            )}
                            <span
                                title={
                                    semPermissaoFinalizar
                                        ? "Você não tem permissão para finalizar a conciliação."
                                        : undefined
                                }
                                className="inline-flex"
                            >
                            <button
                                type="button"
                                disabled={
                                    semPermissaoFinalizar ||
                                    // Sem rascunho, ainda dá para Conciliar quando tudo
                                    // já foi tratado e falta só finalizar (ex.: linhas
                                    // classificadas por regra na importação).
                                    (!hasPendingChanges && !podeFinalizar) ||
                                    salvarMutation.isPending ||
                                    extratoFinalizado
                                }
                                onClick={() => {
                                    if (salvarMutation.isPending || semPermissaoFinalizar) {
                                        return;
                                    }

                                    if (podeFinalizar) {
                                        setFinalizarOpen(true);
                                        return;
                                    }

                                    salvarMutation.mutate({
                                        finalizar: false,
                                    });
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-white text-xs font-bold disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-success/20"
                            >
                                {salvarMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin"/>
                                ) : (
                                    <CheckCircle2 className="w-4 h-4"/>
                                )}

                                {rotuloAcaoConciliacao}
                            </button>
                            </span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}