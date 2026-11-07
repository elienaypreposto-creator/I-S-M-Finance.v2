/**
 * Decisão pura do vínculo.
 *
 * Modo A (1 extrato -> N lançamentos):
 *   Δ = extrato − Σ(bases líquidas)
 *
 * Modo B (1 lançamento ← N extratos, vínculo a vínculo):
 *   Δ = (quitado_acumulado + linha_atual) − valor_título
 *
 * >0 gap (sem juros explícitos, N>1) -> "Falta cobrir extrato"; juros só com alocação explícita
 *      (ou 1:1 inequívoco no endpoint); <0 FALTA -> residual opcional; =0 EXATO.
 * Residual NÃO é oferecido quando o título já está em quitação multi-linha
 * (quitadoAnterior > 0) - evita fantasma no meio do Modo B.
 */

import {diferencaConciliacaoCents, sumCents} from "./money.js";

export type VincularLancamentoInput = {
    lancamento_id: number;
    valorCents: number;
    descontoCents: number;
    /** Juros/Multa informado no payload (0 se omitido). */
    jurosMultaCents: number;
    /** valor_quitado já gravado antes deste vínculo (Modo B). */
    quitadoAnteriorCents?: number;
};

export type VincularDecisionInput = {
    extratoCents: number;
    lancamentos: VincularLancamentoInput[];
    gerarParcial: boolean;
    /** Obrigatório se gerarParcial && lancamentos.length >= 2. */
    residuoLancamentoId?: number | null;
};

export type VincularLancamentoDecision = {
    lancamento_id: number;
    descontoCents: number;
    jurosMultaCents: number;
    /** Valor deste vínculo (base − desconto + juros, ou valor da linha no Modo B). */
    valorVinculadoCents: number;
    /** Quanto quitar neste vínculo (antes de acumular com histórico). */
    valorQuitadoNesteVinculoCents: number;
};

export type VincularDecision =
    | { ok: false; status: 400; code: string; message: string }
    | {
    ok: true;
    deltaCents: number;
    ramo: "exato" | "excedente_juros" | "falta";
    faltaCents: number;
    /** true = quitação multi-linha em andamento; UI não deve oferecer residual. */
    quitacaoMultiLinha: boolean;
    itens: VincularLancamentoDecision[];
    residual: null | {
        origemLancamentoId: number;
        valorCents: number;
    };
    valorSaldoCents: number;
};

function baseLiquidaCents(l: VincularLancamentoInput): number {
    return l.valorCents - l.descontoCents;
}

/**
 * Modo B / 1 lançamento: Δ = (quitadoAnterior + extrato) − título.
 */
function decidirModoBUmLancamento(input: VincularDecisionInput): VincularDecision {
    const {extratoCents, gerarParcial} = input;
    const l = input.lancamentos[0]!;
    const quitadoAnterior = l.quitadoAnteriorCents ?? 0;
    const base = baseLiquidaCents(l);
    const efetivoApos = quitadoAnterior + extratoCents;
    const deltaCents = diferencaConciliacaoCents(efetivoApos, base);
    const quitacaoMultiLinha = quitadoAnterior > 0;

    if (l.descontoCents < 0 || l.jurosMultaCents < 0) {
        return {
            ok: false,
            status: 400,
            code: "VALIDATION_ERROR",
            message: "Desconto e Juros/Multa não podem ser negativos.",
        };
    }
    if (l.descontoCents > l.valorCents) {
        return {
            ok: false,
            status: 400,
            code: "VALIDATION_ERROR",
            message: "Desconto não pode exceder o valor do lançamento.",
        };
    }

    if (deltaCents > 0) {
        // Excedente acumulado -> juros. A linha inteira entra no quitado.
        let juros = l.jurosMultaCents;
        if (juros === 0) {
            if (!quitacaoMultiLinha) {
                // Modo A (1º vínculo): título < extrato sem juros explícitos =
                // cobertura parcial - quita o título e deixa saldo na linha.
                return {
                    ok: true,
                    deltaCents,
                    ramo: "falta",
                    faltaCents: deltaCents,
                    quitacaoMultiLinha: false,
                    itens: [
                        {
                            lancamento_id: l.lancamento_id,
                            descontoCents: l.descontoCents,
                            jurosMultaCents: 0,
                            valorVinculadoCents: base,
                            valorQuitadoNesteVinculoCents: base,
                        },
                    ],
                    residual: null,
                    valorSaldoCents: deltaCents,
                };
            }
            // Modo B (já há quitado): sobra da linha → juros (T3 / caso 3).
            juros = deltaCents;
        } else if (juros !== deltaCents) {
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message:
                    "A soma de Juros/Multa deve ser igual ao excedente entre pagamentos e o título.",
            };
        }
        return {
            ok: true,
            deltaCents,
            ramo: "excedente_juros",
            faltaCents: 0,
            quitacaoMultiLinha,
            itens: [
                {
                    lancamento_id: l.lancamento_id,
                    descontoCents: l.descontoCents,
                    jurosMultaCents: juros,
                    valorVinculadoCents: extratoCents,
                    valorQuitadoNesteVinculoCents: extratoCents,
                },
            ],
            residual: null,
            valorSaldoCents: 0,
        };
    }

    if (deltaCents < 0) {
        const faltaCents = -deltaCents;
        // Residual = falta DEPOIS deste vínculo (título − quitado anterior − linha).
        // Cada requisição do Modo B gera o seu residual com o saldo já decrescido;
        // não se agrupa num único título “fundido” das outras linhas.
        const podeResidual = gerarParcial;
        const residual = podeResidual
            ? {origemLancamentoId: l.lancamento_id, valorCents: faltaCents}
            : null;

        if (podeResidual && base < faltaCents) {
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message: "A origem do residual deve ter valor líquido maior ou igual à falta.",
            };
        }

        return {
            ok: true,
            deltaCents,
            ramo: "falta",
            faltaCents,
            quitacaoMultiLinha,
            itens: [
                {
                    lancamento_id: l.lancamento_id,
                    descontoCents: l.descontoCents,
                    jurosMultaCents: l.jurosMultaCents,
                    // Neste vínculo quita só o valor da linha do extrato
                    valorVinculadoCents: extratoCents,
                    valorQuitadoNesteVinculoCents: extratoCents,
                },
            ],
            residual,
            valorSaldoCents: faltaCents,
        };
    }

    // Exato após este vínculo
    return {
        ok: true,
        deltaCents: 0,
        ramo: "exato",
        faltaCents: 0,
        quitacaoMultiLinha,
        itens: [
            {
                lancamento_id: l.lancamento_id,
                descontoCents: l.descontoCents,
                jurosMultaCents: l.jurosMultaCents,
                valorVinculadoCents: extratoCents,
                valorQuitadoNesteVinculoCents: extratoCents,
            },
        ],
        residual: null,
        valorSaldoCents: 0,
    };
}

/**
 * Resolve juros do excedente e monta a decisão de vínculo.
 * Não persiste nada - só a regra de negócio.
 */
export function decidirVincular(input: VincularDecisionInput): VincularDecision {
    const {extratoCents, lancamentos, gerarParcial, residuoLancamentoId} = input;

    if (lancamentos.length === 0) {
        return {
            ok: false,
            status: 400,
            code: "VALIDATION_ERROR",
            message: "Envie ao menos um lançamento para vincular.",
        };
    }

    // 1 lançamento: fórmula Modo B (também cobre Modo A 1:1 com quitadoAnterior=0)
    if (lancamentos.length === 1) {
        return decidirModoBUmLancamento(input);
    }

    for (const l of lancamentos) {
        if (l.descontoCents < 0 || l.jurosMultaCents < 0) {
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message: "Desconto e Juros/Multa não podem ser negativos.",
            };
        }
        if (l.descontoCents > l.valorCents) {
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message: "Desconto não pode exceder o valor do lançamento.",
            };
        }
    }

    // Modo A: N lançamentos - Δ = extrato − Σ(bases)
    const somaBasesCents = sumCents(lancamentos.map(baseLiquidaCents));
    const deltaCents = diferencaConciliacaoCents(extratoCents, somaBasesCents);

    const jurosById = new Map<number, number>(
        lancamentos.map((l) => [l.lancamento_id, l.jurosMultaCents]),
    );

    if (deltaCents > 0) {
        const somaJurosPayload = sumCents(lancamentos.map((l) => l.jurosMultaCents));

        if (somaJurosPayload === deltaCents) {
            // Juros explícitos cobrindo o gap - OK.
            const itens: VincularLancamentoDecision[] = lancamentos.map((l) => {
                const juros = jurosById.get(l.lancamento_id) ?? 0;
                const base = baseLiquidaCents(l);
                const valorVinculadoCents = base + juros;
                return {
                    lancamento_id: l.lancamento_id,
                    descontoCents: l.descontoCents,
                    jurosMultaCents: juros,
                    valorVinculadoCents,
                    valorQuitadoNesteVinculoCents: valorVinculadoCents,
                };
            });

            return {
                ok: true,
                deltaCents,
                ramo: "excedente_juros",
                faltaCents: 0,
                quitacaoMultiLinha: false,
                itens,
                residual: null,
                valorSaldoCents: 0,
            };
        }

        if (somaJurosPayload !== 0) {
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message:
                    "A soma de Juros/Multa deve ser igual ao valor que falta para cobrir o extrato.",
            };
        }

        // Modo A incremental: títulos ainda não cobrem o extrato - vincula o que
        // foi selecionado e deixa saldo aberto (sem forçar juros).
        const itens: VincularLancamentoDecision[] = lancamentos.map((l) => {
            const base = baseLiquidaCents(l);
            return {
                lancamento_id: l.lancamento_id,
                descontoCents: l.descontoCents,
                jurosMultaCents: 0,
                valorVinculadoCents: base,
                valorQuitadoNesteVinculoCents: base,
            };
        });

        return {
            ok: true,
            deltaCents,
            ramo: "falta",
            faltaCents: deltaCents,
            quitacaoMultiLinha: false,
            itens,
            residual: null,
            valorSaldoCents: deltaCents,
        };
    }

    if (deltaCents < 0) {
        const faltaCents = -deltaCents;

        let origemId: number | null = null;
        let residual: { origemLancamentoId: number; valorCents: number } | null = null;

        if (gerarParcial) {
            if (
                residuoLancamentoId == null ||
                !lancamentos.some((l) => l.lancamento_id === residuoLancamentoId)
            ) {
                return {
                    ok: false,
                    status: 400,
                    code: "VALIDATION_ERROR",
                    message:
                        "Com 2 ou mais lançamentos, informe residuo_lancamento_id (origem da movimentação residual).",
                };
            }
            origemId = residuoLancamentoId;

            const origem = lancamentos.find((l) => l.lancamento_id === origemId)!;
            if (baseLiquidaCents(origem) < faltaCents) {
                return {
                    ok: false,
                    status: 400,
                    code: "VALIDATION_ERROR",
                    message:
                        "A origem do residual deve ter valor líquido maior ou igual à falta.",
                };
            }

            residual = {origemLancamentoId: origemId, valorCents: faltaCents};
        } else {
            // RN-E2: com 2+ lançamentos, a soma tem que fechar com o extrato.
            // Sem "gerar movimentação residual" explícito, não fecha o vínculo
            // com o restante em aberto - diferente do Modo B (1 lançamento),
            // onde a falta é pagamento parcial legítimo.
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message:
                    "Falta valor para fechar com o extrato. Marque \"Gerar movimentação residual\" (com a origem) ou ajuste os lançamentos selecionados.",
            };
        }

        const itens: VincularLancamentoDecision[] = lancamentos.map((l) => {
            const juros = jurosById.get(l.lancamento_id) ?? 0;
            const base = baseLiquidaCents(l);
            let valorQuitadoNesteVinculoCents = base + juros;
            if (l.lancamento_id === origemId) {
                valorQuitadoNesteVinculoCents = base + juros - faltaCents;
            }
            return {
                lancamento_id: l.lancamento_id,
                descontoCents: l.descontoCents,
                jurosMultaCents: juros,
                valorVinculadoCents: valorQuitadoNesteVinculoCents,
                valorQuitadoNesteVinculoCents,
            };
        });

        return {
            ok: true,
            deltaCents,
            ramo: "falta",
            faltaCents,
            quitacaoMultiLinha: false,
            itens,
            residual,
            valorSaldoCents: faltaCents,
        };
    }

    const itens: VincularLancamentoDecision[] = lancamentos.map((l) => {
        const juros = jurosById.get(l.lancamento_id) ?? 0;
        const base = baseLiquidaCents(l);
        const valorVinculadoCents = base + juros;
        return {
            lancamento_id: l.lancamento_id,
            descontoCents: l.descontoCents,
            jurosMultaCents: juros,
            valorVinculadoCents,
            valorQuitadoNesteVinculoCents: valorVinculadoCents,
        };
    });

    return {
        ok: true,
        deltaCents: 0,
        ramo: "exato",
        faltaCents: 0,
        quitacaoMultiLinha: false,
        itens,
        residual: null,
        valorSaldoCents: 0,
    };
}

export function statusAposQuitacao(args: {
    tipoExtrato: "credito" | "debito";
    valorLancamentoCents: number;
    valorQuitadoAcumuladoCents: number;
    /** Desconto acumulado no titulo (DEF-08: threshold = valor - desconto). */
    descontoAcumuladoCents?: number;
}): "pago" | "recebido" | "pago_parcial" {
    const {
        tipoExtrato,
        valorLancamentoCents,
        valorQuitadoAcumuladoCents,
        descontoAcumuladoCents = 0,
    } = args;
    const baseLiquidaCents = Math.max(0, valorLancamentoCents - descontoAcumuladoCents);
    if (valorQuitadoAcumuladoCents < baseLiquidaCents) {
        return "pago_parcial";
    }
    return tipoExtrato === "credito" ? "recebido" : "pago";
}

/** Status operacional enquanto a conciliação ainda não foi concluída. */
export function statusAbertoPorVencimento(
    vencimento: string | Date | null | undefined,
    hojeIso: string,
): "pendente" | "atrasado" {
    if (!vencimento) return "pendente";
    const vencIso =
        typeof vencimento === "string"
            ? vencimento.slice(0, 10)
            : vencimento.toISOString().slice(0, 10);
    return vencIso < hojeIso ? "atrasado" : "pendente";
}

const STATUS_QUITACAO = new Set(["pago", "recebido", "pago_parcial"]);

/**
 * Desfazer vínculo: não promove quitação se o título ainda está no ciclo
 * adiado (pendente/atrasado). Só reavalia pago/recebido/pago_parcial quando
 * o status já era de quitação (ex.: conciliação anterior já finalizada).
 */
export function statusAposDesfazerVinculo(args: {
    statusAtual: string;
    tipoExtrato: "credito" | "debito";
    valorLancamentoCents: number;
    valorQuitadoAcumuladoCents: number;
    descontoAcumuladoCents?: number;
    vencimento: string | Date | null | undefined;
    hojeIso: string;
}): "pendente" | "atrasado" | "pago" | "recebido" | "pago_parcial" {
    const {
        statusAtual,
        tipoExtrato,
        valorLancamentoCents,
        valorQuitadoAcumuladoCents,
        descontoAcumuladoCents = 0,
        vencimento,
        hojeIso,
    } = args;

    if (valorQuitadoAcumuladoCents <= 0) {
        return statusAbertoPorVencimento(vencimento, hojeIso);
    }

    if (STATUS_QUITACAO.has(statusAtual)) {
        return statusAposQuitacao({
            tipoExtrato,
            valorLancamentoCents,
            valorQuitadoAcumuladoCents,
            descontoAcumuladoCents,
        });
    }

    return statusAbertoPorVencimento(vencimento, hojeIso);
}

/**
 * Quitação do título no POST .../finalizar.
 *
 * Todo vínculo gravado já quita o título na hora (Salvar, regra de
 * conciliação na importação, botão [+]); finalizar só fecha o extrato. Aqui
 * só se garante que o título reflita TODOS os seus vínculos (em qualquer
 * extrato), sem somar duas vezes: vale o maior entre o que está gravado no
 * título e a soma dos vínculos. Cobre extratos antigos cujos vínculos não
 * chegaram a quitar o título (classificação automática / [+] da época em que
 * a quitação ficava para o finalizar).
 *
 * Antes era "base finalizada + Σ desta conciliação", que descartava do título
 * os vínculos salvos em extratos ainda abertos - e o desfazer posterior deles
 * zerava a quitação que restava.
 */
export function quitacaoNoFinalizar(args: {
    valorQuitadoTituloCents: number;
    jurosTituloCents: number;
    descontoTituloCents: number;
    /** Σ dos vínculos do título em todos os extratos. */
    sumVinculadoCents: number;
    sumJurosCents: number;
    sumDescontoCents: number;
}): { quitadoCents: number; jurosCents: number; descontoCents: number } {
    return {
        quitadoCents: Math.max(args.valorQuitadoTituloCents, args.sumVinculadoCents, 0),
        jurosCents: Math.max(args.jurosTituloCents, args.sumJurosCents, 0),
        descontoCents: Math.max(args.descontoTituloCents, args.sumDescontoCents, 0),
    };
}

/**
 * Um lançamento movimenta UMA conta só (regra do saldo em utils/lancamentos-conta.ts):
 * `valor_quitado`, `data_quitacao` e `conta_id` são um só por título. Vincular a um
 * extrato de outra conta um título que já tem quitação registrada moveria toda a
 * quitação anterior para a conta nova (o vincular grava `conta_id` = conta do
 * extrato). Para pagar o restante por outra conta, usa-se a parcela residual.
 *
 * Devolve os ids dos títulos que já têm quitação em outra conta.
 */
export function quitadosEmOutraConta(
    lancamentos: ReadonlyArray<{id: number; conta_id: number | null; quitadoCents: number}>,
    contaDoExtrato: number,
): number[] {
    return lancamentos
        .filter((l) => l.quitadoCents > 0 && l.conta_id != null && l.conta_id !== contaDoExtrato)
        .map((l) => l.id);
}

/**
 * Quanto do título já está coberto por vínculos (de outras linhas/extratos):
 * Σ(valor vinculado − juros/multa + desconto). Coberto por inteiro = vincular
 * de novo pagaria o título duas vezes (ex.: título criado por regra num extrato
 * antigo, ainda pendente, oferecido no Vincular de outro extrato).
 */
export function principalVinculadoCents(
    vinculos: ReadonlyArray<{valorVinculadoCents: number; jurosCents: number; descontoCents: number}>,
): number {
    return vinculos.reduce((acc, v) => acc + v.valorVinculadoCents - v.jurosCents + v.descontoCents, 0);
}

export function cobertoPorVinculos(valorLiquidoCents: number, principalCents: number): boolean {
    return valorLiquidoCents > 0 && principalCents >= valorLiquidoCents;
}

export function mensagemJaVinculadoEmOutroExtrato(lancamentoId: number, extratoIds: readonly number[]): string {
    const onde = extratoIds.length > 0
        ? (extratoIds.length > 1 ? "aos extratos " : "ao extrato ") + extratoIds.map((id) => `#${id}`).join(", ")
        : "a outra linha de extrato";
    return (
        `O lançamento #${lancamentoId} já está vinculado ${onde} pelo valor todo. ` +
        "Vincular de novo pagaria o mesmo título duas vezes: desfaça o vínculo anterior antes."
    );
}

/** Formata centavos como "70.000,00" (padrão BR, sem símbolo de moeda). */
function centsToBrDecimal(cents: number): string {
    const negativo = cents < 0;
    const abs = Math.abs(cents);
    const inteiro = Math.floor(abs / 100);
    const centavos = String(abs % 100).padStart(2, "0");
    return `${negativo ? "-" : ""}${inteiro.toLocaleString("pt-BR")},${centavos}`;
}

/**
 * Descrição do lançamento residual gerado após quitação parcial (Card 01):
 * "Residual do lançamento #{origem} - {Pagamento|Recebimento} DO(A) {PARCEIRO}
 * NO VALOR R$ {valor} (PARCELA {atual/total ou UNICA} NO DIA {dia})". Aponta o
 * título de origem e usa "Recebimento" para conta a receber (CR).
 */
export function descreverResiduoParcial(params: {
    origemId: number;
    tipo: string | null;
    valorCents: number;
    vencimento: string | null;
    parceiroNome: string | null;
    parcelaAtual: number | null;
    totalParcelas: number | null;
}): string {
    const {origemId, tipo, valorCents, vencimento, parceiroNome, parcelaAtual, totalParcelas} = params;

    const nome = (parceiroNome ?? "PARCEIRO NÃO INFORMADO").toUpperCase();
    const parcelaTexto =
        totalParcelas && totalParcelas > 1
            ? `PARCELA ${parcelaAtual ?? "?"}/${totalParcelas}`
            : "PARCELA UNICA";
    const dia = vencimento ? String(Number(String(vencimento).slice(0, 10).split("-")[2])) : "?";
    const movimento = tipo === "CR" ? "Recebimento" : "Pagamento";

    return `Residual do lançamento #${origemId} - ${movimento} DO(A) ${nome} NO VALOR R$ ${centsToBrDecimal(valorCents)} (${parcelaTexto} NO DIA ${dia})`;
}

/**
 * Título sem nada a quitar: o quitado (gravado + vínculos ainda em rascunho na
 * tela) já alcança o líquido menos o desconto concedido. Vincular de novo
 * viraria "juros/multa" com o valor inteiro da linha e pagaria o título duas
 * vezes (o Salvar recusaria com 409 só no fim).
 */
export function quitadoPorInteiro(args: {valorLiquidoCents: number; descontoCents?: number; quitadoCents: number}): boolean {
    const base = Math.max(0, args.valorLiquidoCents - (args.descontoCents ?? 0));
    return base > 0 && args.quitadoCents >= base;
}

export function mensagemJaQuitado(lancamentoId: number, porRascunho: boolean): string {
    return porRascunho
        ? `O lançamento #${lancamentoId} já está vinculado pelo valor todo em outra linha deste extrato (vínculo ainda não salvo). ` +
              "Vincular de novo pagaria o mesmo título duas vezes: remova aquele vínculo antes."
        : `O lançamento #${lancamentoId} já está quitado pelo valor todo. ` +
              "Vincular de novo pagaria o mesmo título duas vezes: desfaça a quitação anterior antes.";
}

export function mensagemQuitadoEmOutraConta(ids: readonly number[]): string {
    const plural = ids.length > 1;
    return (
        `${plural ? "Os lançamentos" : "O lançamento"} ${ids.map((id) => `#${id}`).join(", ")} ` +
        `já ${plural ? "têm" : "tem"} pagamento registrado em outra conta bancária. ` +
        "Um lançamento só movimenta uma conta: para quitar o restante por esta conta, " +
        "vincule a parcela residual do pagamento parcial (ou desfaça o vínculo anterior)."
    );
}
