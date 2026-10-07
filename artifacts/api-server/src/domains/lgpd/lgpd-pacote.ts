import {COLUNAS_OMITIDAS_NO_EXPORT} from "./lgpd-tables";

export type PacoteExportacao = {
    versao: 1;
    gerado_em: string;
    nota: string;
    empresa: Record<string, unknown>;
    usuarios_vinculados: Record<string, unknown>[];
    tabelas: Record<string, Record<string, unknown>[]>;
    extratos_arquivos: {
        extrato_id: unknown;
        arquivo_nome: unknown;
        arquivo_hash: unknown;
        periodo_inicio: unknown;
        periodo_fim: unknown;
        linhas: Record<string, unknown>[];
    }[];
};

export function valorJson(valor: unknown): unknown {
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === "bigint") return valor.toString();
    if (Array.isArray(valor)) return valor.map(valorJson);
    if (valor && typeof valor === "object") {
        const saida: Record<string, unknown> = {};
        for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
            saida[chave] = valorJson(item);
        }
        return saida;
    }
    return valor;
}

export function omitirColunas(tabela: string, linha: Record<string, unknown>): Record<string, unknown> {
    const omitir = new Set(COLUNAS_OMITIDAS_NO_EXPORT[tabela] ?? []);
    if (omitir.size === 0) return linha;
    const saida: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(linha)) {
        if (!omitir.has(chave)) saida[chave] = valor;
    }
    return saida;
}

/** Monta o JSON portátil. Quem chama já leu as linhas da empresa; aqui não há SQL. */
export function comporPacoteExportacao(input: {
    empresa: Record<string, unknown>;
    tabelas: Record<string, Record<string, unknown>[]>;
    usuarios: Record<string, unknown>[];
    geradoEm: string;
}): PacoteExportacao {
    const tabelas: Record<string, Record<string, unknown>[]> = {};
    for (const [nome, linhas] of Object.entries(input.tabelas)) {
        tabelas[nome] = linhas.map((linha) => omitirColunas(nome, valorJson(linha) as Record<string, unknown>));
    }

    const extratos = tabelas.extratos ?? [];
    const linhasExtrato = tabelas.extrato_linhas ?? [];

    return {
        versao: 1,
        gerado_em: input.geradoEm,
        nota: "O OFX original não é guardado. extratos_arquivos agrupa as linhas importadas por ficheiro.",
        empresa: valorJson(input.empresa) as Record<string, unknown>,
        usuarios_vinculados: input.usuarios.map((linha) => {
            const copia = valorJson(linha) as Record<string, unknown>;
            delete copia.senha_hash;
            delete copia.senha_unica_hash;
            return copia;
        }),
        tabelas,
        extratos_arquivos: extratos.map((extrato) => ({
            extrato_id: extrato.id,
            arquivo_nome: extrato.arquivo_nome ?? null,
            arquivo_hash: extrato.arquivo_hash ?? null,
            periodo_inicio: extrato.periodo_inicio ?? null,
            periodo_fim: extrato.periodo_fim ?? null,
            linhas: linhasExtrato.filter((linha) => linha.extrato_id === extrato.id),
        })),
    };
}
