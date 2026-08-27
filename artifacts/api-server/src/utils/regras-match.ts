export type TipoMatchRegra = "contem" | "inicia" | "regex" | "exato";
export type NaturezaRegra = "entrada" | "saida";

export type RegraParaMatch = {
    id: number;
    texto_gatilho: string;
    tipo_match: TipoMatchRegra;
    natureza: NaturezaRegra;
    criar_lancamento_automatico: boolean;
    plano_conta_id: number | null;
    parceiro_id: number | null;
    departamento_id: number | null;
    centro_custo_id: number | null;
    forma_pagamento: string | null;
};

export function naturezaDaLinhaExtrato(
    tipoMovimento: "credito" | "debito",
): NaturezaRegra {
    return tipoMovimento === "credito" ? "entrada" : "saida";
}

export function regraCasaTexto(
    regra: Pick<RegraParaMatch, "texto_gatilho" | "tipo_match">,
    descricao: string | null | undefined,
): boolean {
    const texto = descricao ?? "";
    const gatilho = regra.texto_gatilho;

    switch (regra.tipo_match) {
        case "exato":
            return texto.trim().toLowerCase() === gatilho.trim().toLowerCase();
        case "contem":
            return texto.toLowerCase().includes(gatilho.toLowerCase());
        case "inicia":
            return texto.toLowerCase().startsWith(gatilho.toLowerCase());
        case "regex": {
            try {
                return new RegExp(gatilho, "i").test(texto);
            } catch {
                return false;
            }
        }
        default:
            return false;
    }
}

export function encontrarRegraParaLinha(
    regras: RegraParaMatch[],
    linha: { tipo_movimento: "credito" | "debito"; descricao: string | null | undefined },
): RegraParaMatch | null {
    const natureza = naturezaDaLinhaExtrato(linha.tipo_movimento);
    for (const regra of regras) {
        if (regra.natureza !== natureza) continue;
        if (regraCasaTexto(regra, linha.descricao)) return regra;
    }
    return null;
}
