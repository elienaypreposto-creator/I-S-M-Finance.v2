import {z} from "zod";
import {brMoneyDisplayToApiString} from "./lancamentos.schema";

const itemSchema = z.object({
    lancamento_id: z.number().int().positive(),
    selecionado: z.boolean(),
    desconto: z.string().transform((v) => v || "0,00"),
    /** UI: Juros/Multa (DEF-05). */
    juros_multa: z.string().transform((v) => v || "0,00"),
});

export type VincularItemForm = z.infer<typeof itemSchema>;
export type VincularFormValues = {
    gerar_parcial: boolean;
    residuo_lancamento_id?: number | null;
    itens: VincularItemForm[];
};

/**
 * Converte string/number para centavos inteiros.
 * Retorna null se inválido (NaN) para o chamador tratar.
 */
function toCents(money: string | number): number | null {
    if (typeof money === "number") {
        const result = Math.round(money * 100);
        return isNaN(result) ? null : result;
    }
    const str = money.toString().trim();
    if (!str) return null;
    const apiStr = str.includes(",") ? brMoneyDisplayToApiString(str) : str;
    const n = Number(apiStr);
    if (isNaN(n)) return null;
    return Math.round(n * 100);
}

/**
 * Δ, espelhando artifacts/api-server/src/utils/conciliacao-vincular.ts:
 * - 2+ lançamentos (Modo A):  Δ = extrato − Σ(base líquida). O backend NUNCA
 *   desconta quitado_anterior aqui (baseLiquidaCents = valor − desconto,
 *   ver linha ~230 do arquivo acima) - só faz isso no Modo B. Descontar
 *   quitado também no Modo A faria o front pedir menos Juros/Multa do que
 *   o backend vai exigir quando um dos 2+ selecionados já tiver quitação
 *   parcial.
 * - 1 lançamento (Modo B):    Δ = (quitado_anterior + extrato) − base líquida,
 *   equivalente a Δ = extrato − max(0, base líquida − quitado_anterior).
 * >0: falta cobrir o valor do lançamento (mais títulos ou Juros/Multa) -
 *     RN-E2 exige que a soma de Juros/Multa feche esse gap exatamente para
 *     liberar "Concluir"; não existe "cobertura parcial" aqui.
 * <0: falta nos títulos -> residual (checkbox), só relevante no Modo A.
 * =0: exato.
 */
function calcDeltaCentsInterno(
    extratoCents: number,
    selected: Array<{ lancamento_id: number; desconto: string; juros_multa: string }>,
    lancamentosValorById: Map<number, string | number>,
    quitadoAcumuladoById?: Map<number, string | number>,
): { deltaCents: number; somaBasesCents: number; somaJurosCents: number } {
    let somaBasesCents = 0;
    let somaJurosCents = 0;

    for (const it of selected) {
        const base = lancamentosValorById.get(it.lancamento_id);
        if (base === undefined) continue;
        const baseCents = toCents(base) ?? 0;
        const descCents = toCents(it.desconto) ?? 0;
        const jurosCents = toCents(it.juros_multa) ?? 0;
        somaBasesCents += baseCents - descCents;
        somaJurosCents += jurosCents;
    }

    if (selected.length === 1 && quitadoAcumuladoById) {
        const quitadoCents = toCents(quitadoAcumuladoById.get(selected[0]!.lancamento_id) ?? 0) ?? 0;
        // Δ = (quitado_anterior + extrato) − base líquida, algebricamente
        // igual a extrato − max(0, base líquida − quitado_anterior).
        const baseRestanteCents = Math.max(0, somaBasesCents - quitadoCents);
        return {
            deltaCents: extratoCents - baseRestanteCents,
            somaBasesCents: baseRestanteCents,
            somaJurosCents,
        };
    }

    return {
        deltaCents: extratoCents - somaBasesCents,
        somaBasesCents,
        somaJurosCents,
    };
}

export function buildVincularFormSchema(
    valorExtratoAbs: string | number,
    lancamentosValorById: Map<number, string | number>,
    /** Quitado antes deste vínculo. Só é aplicado no Modo B (1 lançamento) -
     *  ver comentário de calcDeltaCentsInterno. */
    quitadoAcumuladoById?: Map<number, string | number>,
) {
    const extratoCents = toCents(valorExtratoAbs);

    return z
        .object({
            gerar_parcial: z.boolean(),
            residuo_lancamento_id: z.number().int().positive().nullable().optional(),
            itens: z.array(itemSchema),
        })
        .superRefine((data, ctx) => {
            if (extratoCents === null) {
                ctx.addIssue({
                    code: "custom",
                    message: "Valor do extrato inválido. Recarregue a página e tente novamente.",
                    path: ["itens"],
                });
                return;
            }

            const selected = data.itens.filter((i) => i.selecionado);
            if (selected.length === 0) {
                ctx.addIssue({
                    code: "custom",
                    message: "Selecione ao menos um lançamento para vincular.",
                    path: ["itens"],
                });
                return;
            }

            for (const it of selected) {
                if (!lancamentosValorById.has(it.lancamento_id)) {
                    ctx.addIssue({
                        code: "custom",
                        message: `Lançamento #${it.lancamento_id} não encontrado. Recarregue a página.`,
                        path: ["itens"],
                    });
                    return;
                }
                const baseCents = toCents(lancamentosValorById.get(it.lancamento_id)!);
                const descCents = toCents(it.desconto);
                const jurosCents = toCents(it.juros_multa);
                if (baseCents === null || descCents === null || jurosCents === null) {
                    ctx.addIssue({
                        code: "custom",
                        message: "Valor de desconto ou Juros/Multa inválido. Verifique os campos.",
                        path: ["itens"],
                    });
                    return;
                }
            }

            const {deltaCents, somaJurosCents} = calcDeltaCentsInterno(
                extratoCents,
                selected,
                lancamentosValorById,
                quitadoAcumuladoById,
            );

            if (deltaCents > 0) {
                // RN-E2: não existe "cobertura parcial" aceitável aqui - a soma de
                // Juros/Multa TEM que fechar o gap exatamente (com 1 selecionado
                // o campo já vem pré-preenchido sozinho no front, então na prática
                // só erra se o usuário apagar/alterar o valor manualmente).
                if (somaJurosCents !== deltaCents) {
                    const faltaBr = (deltaCents / 100).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    });
                    const alvo = selected.length > 1 ? "lançamentos selecionados" : "lançamento";
                    if (somaJurosCents === 0) {
                        ctx.addIssue({
                            code: "custom",
                            message: `Falta R$ ${faltaBr} para atingir o valor do ${alvo}. Selecione mais lançamentos ou complete o campo Juros/Multa.`,
                            path: ["itens"],
                        });
                    } else {
                        ctx.addIssue({
                            code: "custom",
                            message:
                                `A soma de Juros/Multa deve ser igual ao valor que falta para atingir o valor do ${alvo}.`,
                            path: ["itens"],
                        });
                    }
                }
            }

            if (deltaCents < 0) {
                // FALTA. Com 2+ lançamentos (Modo A), o restante só pode ficar em
                // aberto se o usuário optar explicitamente por gerar a movimentação
                // residual - senão o vínculo fecharia sem que o total bata (RN-E2).
                // Com 1 lançamento (Modo B), a falta é pagamento parcial legítimo
                // (mais linhas de extrato vêm depois) e não exige residual.
                if (selected.length >= 2) {
                    if (!data.gerar_parcial) {
                        ctx.addIssue({
                            code: "custom",
                            message:
                                "Falta valor para fechar com o extrato. Marque \"Gerar movimentação residual\" ou ajuste os lançamentos selecionados.",
                            path: ["itens"],
                        });
                    } else {
                        const origemOk =
                            data.residuo_lancamento_id != null &&
                            selected.some((i) => i.lancamento_id === data.residuo_lancamento_id);
                        if (!origemOk) {
                            ctx.addIssue({
                                code: "custom",
                                message:
                                    "Selecione de qual lançamento nasce a movimentação residual.",
                                path: ["residuo_lancamento_id"],
                            });
                        }
                    }
                }
            }
        });
}

/** Helper de UI para barra de resumo / prefill - mesma fórmula usada na validação. */
export function calcDeltaVincularCents(
    valorExtratoAbs: string | number,
    selected: Array<{ lancamento_id: number; desconto: string; juros_multa: string }>,
    lancamentosValorById: Map<number, string | number>,
    /** Quitado antes deste vínculo. Só é aplicado no Modo B (1 lançamento). */
    quitadoAcumuladoById?: Map<number, string | number>,
): { deltaCents: number | null; somaBasesCents: number; somaJurosCents: number } {
    const extratoCents = toCents(valorExtratoAbs);
    if (extratoCents === null) {
        return {deltaCents: null, somaBasesCents: 0, somaJurosCents: 0};
    }
    const {deltaCents, somaBasesCents, somaJurosCents} = calcDeltaCentsInterno(
        extratoCents,
        selected,
        lancamentosValorById,
        quitadoAcumuladoById,
    );
    return {deltaCents, somaBasesCents, somaJurosCents};
}