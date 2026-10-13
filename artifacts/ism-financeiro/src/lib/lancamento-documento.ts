export const TIPO_DOCUMENTO_VALUES = [
    "nota_fiscal",
    "boleto",
    "fatura",
    "recibo",
    "contrato",
    "guia_imposto",
    "folha",
    "outros",
] as const;

export const TIPOS_DOCUMENTO_LANCAMENTO: {
    value: (typeof TIPO_DOCUMENTO_VALUES)[number];
    label: string;
    abrev: string;
}[] = [
    {value: "nota_fiscal", label: "Nota Fiscal", abrev: "NF"},
    {value: "boleto", label: "Boleto", abrev: "BOL"},
    {value: "fatura", label: "Fatura", abrev: "FAT"},
    {value: "recibo", label: "Recibo", abrev: "REC"},
    {value: "contrato", label: "Contrato", abrev: "CTR"},
    {value: "guia_imposto", label: "Guia de imposto", abrev: "GUIA"},
    {value: "folha", label: "Folha de pagamento", abrev: "FOLHA"},
    {value: "outros", label: "Outros", abrev: "OUT"},
];

export type TipoDocumentoLancamento = (typeof TIPOS_DOCUMENTO_LANCAMENTO)[number]["value"];

export function rotuloTipoDocumento(tipo: string | null | undefined): string {
    return TIPOS_DOCUMENTO_LANCAMENTO.find((t) => t.value === tipo)?.label ?? "";
}

export function prefixoDescricaoLista(
    tipo: string | null | undefined,
    numero: string | null | undefined,
    descricao: string | null | undefined,
): string {
    const abrev = TIPOS_DOCUMENTO_LANCAMENTO.find((t) => t.value === tipo)?.abrev;
    const num = numero?.trim();
    const nome = descricao?.trim() ?? "";
    const prefixo = [abrev, num].filter(Boolean).join(" ");
    if (!prefixo) return nome || "-";
    return nome ? `${prefixo} · ${nome}` : prefixo;
}
