/**
 * Planilha de cadastro de Metas (lógica pura, sem React).
 *
 * Regra de célula: vazio ou zero = "sem meta". O valor 0,00 continua indo para a API
 * (não existe DELETE de meta), mas para cards e contagens só vale meta com valor > 0.
 */
import {brMoneyDisplayToApiString} from "@/validations/lancamentos.schema";

export type MetaCadastro = {
    plano_conta_id: number;
    mes: number;
    valor_projetado: string;
};

export type PlanoContaCadastro = {
    id: number;
    tipo: string;
    ativo: boolean;
};

export type ResumoCadastroMetas = {
    receitas: number;
    saidas: number;
    resultado: number;
    /** Planos ativos com alguma meta > 0 nos meses considerados. */
    categoriasComMeta: number;
    /** Planos ativos (denominador do card). */
    categoriasAtivas: number;
};

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const MESES_EXTENSO = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Valor numérico de uma meta vinda da API ("1500.00"); ausente/inválido → 0. */
export function valorMeta(valor: string | null | undefined): number {
    if (!valor) return 0;
    const n = Number.parseFloat(valor);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Cards da planilha: somam só os meses do filtro (todos, se nenhum) e contam
 * apenas planos ativos com meta > 0 — meta zerada não é meta.
 */
export function resumirCadastroMetas(
    metas: readonly MetaCadastro[],
    planos: readonly PlanoContaCadastro[],
    meses: readonly number[],
): ResumoCadastroMetas {
    const mesesSet = new Set(meses);
    const planoPorId = new Map(planos.map((p) => [p.id, p]));
    const porTipo: Record<string, number> = {receita: 0, custo: 0, despesa: 0};
    const comMeta = new Set<number>();

    for (const m of metas) {
        if (!mesesSet.has(m.mes)) continue;
        const plano = planoPorId.get(m.plano_conta_id);
        if (!plano) continue;
        const v = valorMeta(m.valor_projetado);
        if (plano.tipo in porTipo) porTipo[plano.tipo] += v;
        if (v > 0 && plano.ativo) comMeta.add(plano.id);
    }

    const receitas = porTipo.receita;
    const saidas = porTipo.custo + porTipo.despesa;
    return {
        receitas,
        saidas,
        resultado: receitas - saidas,
        categoriasComMeta: comMeta.size,
        categoriasAtivas: planos.filter((p) => p.ativo).length,
    };
}

/** Texto digitado na célula (máscara pt-BR "1.234,56") → valor da API ("1234.56"); vazio → "0.00". */
export function entradaMetaParaApi(texto: string): string {
    return brMoneyDisplayToApiString(texto) || "0.00";
}

export type AcaoCelulaMeta = "nada" | "salvar" | "remover";

/**
 * O que fazer ao sair da célula.
 * - "nada": valor igual ao atual (inclui abrir e fechar uma célula vazia — não cria meta 0).
 * - "remover": havia meta > 0 e a célula ficou vazia/zero (a tela avisa e oferece desfazer).
 * - "salvar": qualquer outro valor.
 */
export function acaoAoSalvarCelula(valorAtualApi: string | null | undefined, textoDigitado: string): AcaoCelulaMeta {
    const anterior = valorMeta(valorAtualApi);
    const novo = valorMeta(entradaMetaParaApi(textoDigitado));
    if (Math.round(anterior * 100) === Math.round(novo * 100)) return "nada";
    if (novo === 0) return "remover";
    return "salvar";
}

/** Meses do filtro em texto curto: "2026", "Mar 2026", "Jan–Mar 2026", "Jan, Mar, Jun 2026". */
export function rotuloPeriodoMetas(meses: readonly number[], ano: number): string {
    const ordenados = [...new Set(meses)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
    if (ordenados.length === 0 || ordenados.length === 12) return String(ano);
    if (ordenados.length === 1) return `${MESES_CURTOS[ordenados[0] - 1]} ${ano}`;
    const contiguo = ordenados.every((m, i) => i === 0 || m === ordenados[i - 1] + 1);
    if (contiguo) {
        return `${MESES_CURTOS[ordenados[0] - 1]}–${MESES_CURTOS[ordenados[ordenados.length - 1] - 1]} ${ano}`;
    }
    return `${ordenados.map((m) => MESES_CURTOS[m - 1]).join(", ")} ${ano}`;
}

/**
 * Rótulo acessível da célula: "Meta de Vendas / Produtos em Março de 2026: R$ 1.500,00".
 * `valorTexto` já vem tratado pela preferência de ocultar valores; null = sem meta.
 */
const TIPO_NO_ROTULO: Record<string, string> = {receita: "receita", custo: "custo", despesa: "despesa"};

/**
 * Nome da linha para o leitor de tela: "Categoria / Subcategoria (tipo)". O tipo
 * entra sempre, porque receita e despesa podem ter o mesmo nome e as células
 * ficariam com o mesmo aria-label.
 */
export function rotuloLinhaMeta(categoria: string, subcategoria: string | null | undefined, tipo: string): string {
    const nome = subcategoria ? `${categoria} / ${subcategoria}` : categoria;
    return `${nome} (${TIPO_NO_ROTULO[tipo] ?? tipo})`;
}

export function rotuloCelulaMeta(linha: string, mes: number, ano: number, valorTexto: string | null): string {
    const base = `Meta de ${linha} em ${MESES_EXTENSO[mes - 1]} de ${ano}`;
    return `${base}: ${valorTexto ?? "sem meta"}`;
}
