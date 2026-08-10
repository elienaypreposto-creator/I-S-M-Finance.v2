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
 * String vazia -> 0 (campos Desconto/Juros vazios na UI).
 */
function toCents(money: string | number): number | null {
    if (typeof money === "number") {
        if (!Number.isFinite(money)) return null;
        return Math.round(money * 100);
    }
    const str = money.toString().trim();
    if (!str) return 0;
    const apiStr = str.includes(",") ? brMoneyDisplayToApiString(str) : str;
    const n = Number(apiStr);
    if (isNaN(n)) return null;
    return Math.round(n * 100);
}

/** Select com value="" / NaN não pode quebrar z.number() antes do superRefine. */
const residuoLancamentoIdSchema = z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return null;
    if (typeof v === "number" && Number.isNaN(v)) return null;
    return v;
}, z.number().int().positive().nullable().optional());

/**
 * Δ, espelhando artifacts/api-server/src/utils/conciliacao-vincular.ts:
 * - 2+ lançamentos (Modo A):  Δ = extrato − Σ(base líquida)
 * - 1 lançamento (Modo B):    Δ = extrato − max(0, base líquida − quitado_anterior)
 * >0: gap no extrato -> juros (se informados) OU cobertura parcial (juros=0)
 * <0: títulos > extrato -> residual (Modo A 2+) ou pagamento parcial (Modo B)
 * =0: exato
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
    /** Quitado antes deste vínculo. Só é aplicado no Modo B (1 lançamento). */
    quitadoAcumuladoById?: Map<number, string | number>,
) {
    const extratoCents = toCents(valorExtratoAbs);

    return z
        .object({
            gerar_parcial: z.boolean(),
            residuo_lancamento_id: residuoLancamentoIdSchema,
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
                // Alinhado ao backend: juros=0 ⇒ cobertura parcial (incremental OK);
                // juros parciais que não fecham o gap ⇒ erro; juros === Δ ⇒ OK.
                if (somaJurosCents > 0 && somaJurosCents !== deltaCents) {
                    ctx.addIssue({
                        code: "custom",
                        message:
                            "A soma de Juros/Multa deve ser igual ao valor que falta para cobrir o extrato.",
                        path: ["itens"],
                    });
                }
            }

            if (deltaCents < 0) {
                // FALTA (títulos > extrato). Modo A (2+): exige residual explícito.
                // Modo B (1): pagamento parcial multi-linha — não exige residual.
                if (selected.length >= 2) {
                    if (!data.gerar_parcial) {
                        ctx.addIssue({
                            code: "custom",
                            message:
                                'Falta valor para fechar com o extrato. Marque "Gerar movimentação residual" ou ajuste os lançamentos selecionados.',
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
