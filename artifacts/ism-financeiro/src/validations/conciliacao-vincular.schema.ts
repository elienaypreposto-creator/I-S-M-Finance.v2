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
 * Δ = Σ(extrato) − Σ(bases líquidas restantes) - alinhado ao backend (DEF-01/04).
 * Modo B (1 lançamento): base restante = valor − desconto − quitado_acumulado (rascunho+commitado).
 * >0 gap no extrato (juros / cobertura parcial).
 * <0 falta nos títulos → residual só no Modo A (2+); no Modo B é pagamento parcial.
 * =0 exato.
 */
export function buildVincularFormSchema(
    valorExtratoAbs: string | number,
    lancamentosValorById: Map<number, string | number>,
    quitadoAcumuladoById: Map<number, string | number> = new Map(),
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

            const {deltaCents, somaJurosCents} = calcDeltaVincularCents(
                valorExtratoAbs,
                selected,
                lancamentosValorById,
                quitadoAcumuladoById,
            );
            if (deltaCents === null) {
                ctx.addIssue({
                    code: "custom",
                    message: "Valor de desconto ou Juros/Multa inválido. Verifique os campos.",
                    path: ["itens"],
                });
                return;
            }

            if (deltaCents > 0) {
                // Cobertura parcial (Modo A incremental): juros=0 é OK - deixa saldo.
                // Só bloqueia se o usuário preencheu juros parciais que não fecham o gap.
                if (selected.length > 1 && somaJurosCents > 0 && somaJurosCents !== deltaCents) {
                    ctx.addIssue({
                        code: "custom",
                        message:
                            "A soma de Juros/Multa deve ser igual ao valor que falta para cobrir o extrato.",
                        path: ["itens"],
                    });
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
    /** Quitado efetivo (commitado + rascunho). Modo B: reduz a base do título. */
    quitadoAcumuladoById: Map<number, string | number> = new Map(),
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
        const quitadoCents = toCents(quitadoAcumuladoById.get(it.lancamento_id) ?? 0) ?? 0;
        // Base líquida ainda em aberto no título (DEF-04 / ciclo adiado).
        const baseRestanteCents = Math.max(0, baseCents - descCents - quitadoCents);
        somaBasesCents += baseRestanteCents;
        somaJurosCents += jurosCents;
    }
    return {
        deltaCents: extratoCents - somaBasesCents,
        somaBasesCents,
        somaJurosCents,
    };
}