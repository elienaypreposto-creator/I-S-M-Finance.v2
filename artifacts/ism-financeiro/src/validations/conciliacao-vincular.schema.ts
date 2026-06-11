import { z } from "zod";
import { brMoneyDisplayToApiString } from "./lancamentos.schema";

const itemSchema = z.object({
  lancamento_id: z.number().int().positive(),
  selecionado: z.boolean(),
  desconto: z.string().transform((v) => v || "0,00"),
  acrescimo: z.string().transform((v) => v || "0,00"),
});

export type VincularItemForm = z.infer<typeof itemSchema>;
export type VincularFormValues = { gerar_parcial: boolean; itens: VincularItemForm[] };

/**
 * Converte string/number para centavos inteiros.
 * FIX: retorna null se o valor for inválido (NaN, string corrompida),
 *      permitindo que o chamador trate o caso explicitamente
 *      em vez de propagar NaN silenciosamente pela aritmética.
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

export function buildVincularFormSchema(
  valorExtratoAbs: string | number,
  lancamentosValorById: Map<number, string | number>,
) {
  const extratoCents = toCents(valorExtratoAbs);

  return z
    .object({
      gerar_parcial: z.boolean(),
      itens: z.array(itemSchema),
    })
    .superRefine((data, ctx) => {
      // Guarda contra valor de extrato inválido (dado corrompido vindo da API)
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

      let totalVinculadoCents = 0;
      for (const it of selected) {
        const base = lancamentosValorById.get(it.lancamento_id);

        // FIX: Map miss explícito — lançamento selecionado não encontrado nos dados locais.
        //      Erro sinalizado em vez de skip silencioso que distorceria o total.
        if (base === undefined) {
          ctx.addIssue({
            code: "custom",
            message: `Lançamento #${it.lancamento_id} não encontrado. Recarregue a página.`,
            path: ["itens"],
          });
          return;
        }

        const baseCents  = toCents(base);
        const descCents  = toCents(it.desconto);
        const acresCents = toCents(it.acrescimo);

        // FIX: qualquer valor NaN nos campos de desconto/acréscimo interrompe o cálculo
        if (baseCents === null || descCents === null || acresCents === null) {
          ctx.addIssue({
            code: "custom",
            message: "Valor de desconto ou acréscimo inválido. Verifique os campos.",
            path: ["itens"],
          });
          return;
        }

        totalVinculadoCents += baseCents - descCents + acresCents;
      }

      const saldoCents = extratoCents - totalVinculadoCents;

      // Saldo positivo: lançamentos não cobrem o extrato — exige resíduo parcial
      if (saldoCents > 0 && !data.gerar_parcial) {
        ctx.addIssue({
          code: "custom",
          message:
            'A soma líquida dos lançamentos selecionados é menor que o valor do extrato. Marque "Gerar resíduo parcial" ou ajuste descontos/acréscimos.',
          path: ["gerar_parcial"],
        });
      }

      // FIX: saldo negativo: lançamentos ultrapassam o extrato — sempre é um erro,
      //      independente do flag gerar_parcial.
      if (saldoCents < 0) {
        ctx.addIssue({
          code: "custom",
          message:
            "A soma líquida dos lançamentos selecionados ultrapassa o valor do extrato. Ajuste os descontos/acréscimos ou desmarque itens.",
          path: ["itens"],
        });
      }
    });
}