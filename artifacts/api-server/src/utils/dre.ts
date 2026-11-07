/**
 * Linhas da DRE gerencial.
 *
 * Cada conta do plano diz em que linha entra (`plano_contas.grupo_dre`). Sem grupo
 * explícito, vale o tipo da conta (receita, custo, despesa). Sem plano, vale a
 * natureza do título: entrada é receita, saída é despesa.
 * "fora" = movimento que não é resultado (empréstimo, aporte, investimento,
 * retenção de terceiros repassada) e não entra na DRE.
 */
import {sql, type SQL} from "drizzle-orm";
import {lancamentosTable} from "@workspace/db/schema";

/**
 * Valor de cada título quitado na DRE pelo caixa: o que entrou/saiu no banco
 * (`valor_quitado`, ou `valor` se vier nulo), a mesma base do Fluxo de Caixa e do
 * Contábil, mais as retenções na fonte do título fechado (`retencoes`: a receita/despesa
 * é o bruto da nota). Soma por título, pela `data_quitacao`.
 *
 * Antes descontava `juros` do quitado (regra do realizado das metas): os juros pagos
 * sumiam da DRE (não há linha de despesa financeira) e um título com `juros` igual ao
 * quitado (R$ 9,00 de tarifa em 16/07/2026 no clone) entrava como zero, abrindo
 * diferença com o Fluxo de Caixa.
 */
export function sqlValorDreCaixa(retencoes: SQL): SQL {
    return sql`COALESCE(${lancamentosTable.valor_quitado}, ${lancamentosTable.valor}) + ${retencoes}`;
}

export const GRUPOS_DRE = ["receita", "deducao", "custo", "despesa", "fora"] as const;
export type GrupoDre = (typeof GRUPOS_DRE)[number];

const ehGrupoDre = (v: unknown): v is GrupoDre =>
    typeof v === "string" && (GRUPOS_DRE as readonly string[]).includes(v);

export function grupoDreDoLancamento(args: {
    tipoLancamento: string;
    grupoDre?: string | null;
    tipoPlano?: string | null;
}): GrupoDre {
    if (ehGrupoDre(args.grupoDre)) return args.grupoDre;
    const tipoPlano = (args.tipoPlano ?? "").toLowerCase();
    if (tipoPlano === "receita" || tipoPlano === "custo" || tipoPlano === "despesa") return tipoPlano;
    return args.tipoLancamento === "CR" ? "receita" : "despesa";
}

/**
 * Valor que o título soma na sua linha (positivo = aumenta a linha).
 * Receita cresce com entradas; deduções, custos e despesas crescem com saídas.
 * Movimento no sentido contrário (devolução de venda, estorno de despesa) abate.
 */
export function valorNaLinhaDreCents(grupo: GrupoDre, tipoLancamento: string, cents: number): number {
    if (grupo === "fora") return 0;
    const entrada = tipoLancamento === "CR";
    if (grupo === "receita") return entrada ? cents : -cents;
    return entrada ? -cents : cents;
}
