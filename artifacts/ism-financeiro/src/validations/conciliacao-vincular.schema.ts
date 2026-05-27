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

/** Converte string/number para centavos inteiros a fim de evitar bugs de float no frontend */
function toCents(money: string | number): number {
  if (typeof money === "number") return Math.round(money * 100);
  const apiStr = money.toString().includes(",") ? brMoneyDisplayToApiString(money) : money;
  return Math.round(Number(apiStr) * 100);
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
        if (base === undefined) continue;

        const baseCents = toCents(base);
        const descCents = toCents(it.desconto);
        const acresCents = toCents(it.acrescimo);

        totalVinculadoCents += baseCents - descCents + acresCents;
      }

      const saldoCents = extratoCents - totalVinculadoCents;

      // Se sobrou saldo e o usuário não ativou o resíduo parcial
      if (saldoCents > 0 && !data.gerar_parcial) {
        ctx.addIssue({
          code: "custom",
          message:
            'A soma líquida dos lançamentos selecionados é menor que o valor do extrato. Marque "Gerar resíduo parcial" ou ajuste descontos/acréscimos.',
          path: ["gerar_parcial"],
        });
      }
    });
}
