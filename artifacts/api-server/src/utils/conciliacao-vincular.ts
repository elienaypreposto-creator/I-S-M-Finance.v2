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
        // Em quitação multi-linha, a falta é o que ainda virá em outras linhas - sem residual.
        const podeResidual = gerarParcial && !quitacaoMultiLinha;
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
        const faltaCobrirExtrato = (deltaCents / 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        if (somaJurosPayload === deltaCents) {
        } else if (somaJurosPayload === 0) {
            // Card 39 / DEF-01 caso 5: enquanto títulos não cobrem o extrato, a mensagem
            // é "Falta R$ X…" (selecionar mais títulos). Juros só com alocação explícita.
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message: `Falta R$ ${faltaCobrirExtrato} para cobrir o valor do extrato. Selecione mais lançamentos ou aloque o valor em Juros/Multa.`,
            };
        } else {
            return {
                ok: false,
                status: 400,
                code: "VALIDATION_ERROR",
                message:
                    "A soma de Juros/Multa deve ser igual ao valor que falta para cobrir o extrato.",
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
            deltaCents,
            ramo: "excedente_juros",
            faltaCents: 0,
            quitacaoMultiLinha: false,
            itens,
            residual: null,
            valorSaldoCents: 0,
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
