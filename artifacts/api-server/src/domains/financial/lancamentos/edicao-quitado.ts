/**
 * Edição de título com quitação (PUT /lancamentos/:id).
 *
 * O dinheiro de um título quitado já passou pela conta: a conciliação (ou a
 * transferência) gravou `valor_quitado`, `data_quitacao` e a conta conforme o
 * valor do título NAQUELE momento. Mudar depois o que define esse valor deixa
 * o título incoerente com o extrato (ex.: valor 1.700, líquido 1.602,50,
 * quitado 1.502,50 e status "pago") sem nenhum aviso.
 *
 * Travados (mudam quanto, em que sentido ou por onde o dinheiro passou):
 *   tipo (CP/CR inverte o sinal no saldo), valor, desconto, juros,
 *   retenções na fonte (mudam o líquido) e conta bancária.
 * Livres (descritivos/classificação, não mexem no dinheiro):
 *   descrição, categoria, departamento, centro de custo, parceiro,
 *   observação, documento, competência, vencimento, riscos, forma de pagamento.
 *   - Parceiro fica livre: o título criado pela linha do extrato nasce sem
 *     parceiro e é classificado depois.
 *   - Vencimento fica livre: o status de um título quitado vem da quitação,
 *     não do vencimento (renegociar o vencimento do restante de um pago
 *     parcial também é legítimo).
 *
 * Quando trava:
 *   - vínculo com linha de extrato  -> desfazer na Conciliação;
 *   - perna de transferência         -> editar/excluir a transferência;
 *   - quitação registrada sem vínculo (legado) -> voltar para Pendente antes
 *     (no mesmo PUT vale: reabrir limpa a quitação e libera os campos).
 */
import {toCents} from "../../../utils/money";
import {CAMPOS_RETENCAO, ROTULO_RETENCAO, type CampoRetencao} from "../../../utils/retencoes";

export const CAMPOS_TRAVADOS_NA_QUITACAO = ["tipo", "valor", "desconto", "juros", ...CAMPOS_RETENCAO, "conta_id"] as const;

export type CampoTravado = (typeof CAMPOS_TRAVADOS_NA_QUITACAO)[number];

export type OrigemQuitacao = "conciliacao" | "transferencia" | "registro";

const ROTULO_CAMPO: Record<CampoTravado, string> = {
    tipo: "tipo",
    valor: "valor",
    desconto: "desconto",
    juros: "juros",
    conta_id: "conta bancária",
    ...(Object.fromEntries(CAMPOS_RETENCAO.map((c) => [c, `retenção de ${ROTULO_RETENCAO[c]}`])) as Record<CampoRetencao, string>),
};

const CAMPOS_EM_CENTAVOS = new Set<CampoTravado>(["valor", "desconto", "juros", ...CAMPOS_RETENCAO]);

/**
 * De onde vem a quitação que trava o título, ou null se ele está livre.
 * `reabrindo` = o mesmo PUT volta o título para aberto e limpa a quitação
 * órfã (só possível sem vínculo e sem transferência).
 */
export function origemQueTrava(args: {
    temVinculoConciliacao: boolean;
    ehTransferencia: boolean;
    quitadoCents: number;
    reabrindo: boolean;
}): OrigemQuitacao | null {
    if (args.temVinculoConciliacao) return "conciliacao";
    if (args.ehTransferencia) return "transferencia";
    if (args.quitadoCents > 0 && !args.reabrindo) return "registro";
    return null;
}

/** Campos travados que o payload realmente muda (o formulário reenvia o título inteiro). */
export function camposTravadosAlterados(
    atual: Partial<Record<CampoTravado, unknown>>,
    payload: Partial<Record<CampoTravado, unknown>>,
): CampoTravado[] {
    return CAMPOS_TRAVADOS_NA_QUITACAO.filter((campo) => {
        const novo = payload[campo];
        if (novo === undefined) return false;
        if (CAMPOS_EM_CENTAVOS.has(campo)) return toCents(novo) !== toCents(atual[campo]);
        if (campo === "conta_id") return (novo ?? null) !== (atual.conta_id ?? null);
        return String(novo) !== String(atual[campo] ?? "");
    });
}

function listar(campos: readonly CampoTravado[]): string {
    const rotulos = campos.map((c) => ROTULO_CAMPO[c]);
    if (rotulos.length <= 1) return rotulos.join("");
    return `${rotulos.slice(0, -1).join(", ")} e ${rotulos[rotulos.length - 1]}`;
}

export function mensagemCamposTravados(origem: OrigemQuitacao, campos: readonly CampoTravado[]): string {
    const alterados = listar(campos);
    const regra = "valor, tipo, conta, desconto, juros e retenções não podem ser alterados";
    switch (origem) {
        case "conciliacao":
            return `Este lançamento foi quitado pela conciliação bancária: ${regra} (alterado: ${alterados}). Para corrigir, desfaça o vínculo na Conciliação e edite o título.`;
        case "transferencia":
            return `Este lançamento faz parte de uma transferência entre contas: ${regra} (alterado: ${alterados}). Para corrigir, edite ou exclua a transferência.`;
        case "registro":
            return `Este lançamento tem pagamento registrado: ${regra} (alterado: ${alterados}). Volte o status para Pendente antes de alterar esses campos.`;
    }
}
