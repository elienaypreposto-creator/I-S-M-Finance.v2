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
 * Δ = Σ(extrato) − Σ(lançamentos líquidos) - mesma regra do backend (DEF-01).
 * >0 gap: falta cobrir o extrato (mais títulos ou Juros/Multa explícito).
 * <0 falta nos títulos -> residual (checkbox).
 * =0 exato.
 */
export function buildVincularFormSchema(
    valorExtratoAbs: string | number,
    lancamentosValorById: Map<number, string | number>,
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

            let somaBasesCents = 0;
            let somaJurosCents = 0;

            for (const it of selected) {
                const base = lancamentosValorById.get(it.lancamento_id);

                if (base === undefined) {
                    ctx.addIssue({
                        code: "custom",
                        message: `Lançamento #${it.lancamento_id} não encontrado. Recarregue a página.`,
                        path: ["itens"],
                    });
                    return;
                }

                const baseCents = toCents(base);
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

                somaBasesCents += baseCents - descCents;
                somaJurosCents += jurosCents;
            }

            // Δ = extrato − Σ(lançamentos líquidos), sem juros (juros absorvem excedente)
            const deltaCents = extratoCents - somaBasesCents;

            if (deltaCents > 0) {
                // Card 39: gap sem juros explícitos = "Falta cobrir o extrato".
                if (selected.length > 1 && somaJurosCents !== deltaCents) {
                    const faltaBr = (deltaCents / 100).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    });
                    if (somaJurosCents === 0) {
                        ctx.addIssue({
                            code: "custom",
                            message: `Falta R$ ${faltaBr} para cobrir o valor do extrato. Selecione mais lançamentos ou aloque em Juros/Multa.`,
                            path: ["itens"],
                        });
                    } else {
                        ctx.addIssue({
                            code: "custom",
                            message:
                                "A soma de Juros/Multa deve ser igual ao valor que falta para cobrir o extrato.",
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

/** Helpers de UI para barra de resumo / prefill. */
export function calcDeltaVincularCents(
    valorExtratoAbs: string | number,
    selected: Array<{ lancamento_id: number; desconto: string; juros_multa: string }>,
    lancamentosValorById: Map<number, string | number>,
): { deltaCents: number | null; somaBasesCents: number; somaJurosCents: number } {
    const extratoCents = toCents(valorExtratoAbs);
    if (extratoCents === null) {
        return {deltaCents: null, somaBasesCents: 0, somaJurosCents: 0};
    }
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
    return {
        deltaCents: extratoCents - somaBasesCents,
        somaBasesCents,
        somaJurosCents,
    };
}