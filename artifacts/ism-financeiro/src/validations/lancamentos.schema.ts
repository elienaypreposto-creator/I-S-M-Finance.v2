import {z} from "zod";

export const lancamentoStatusEnum = z.enum([
    "pendente",
    "pago",
    "recebido",
    "atrasado",
    "cancelado",
]);

// Tipos de dados de pagamento

export type DadosPagamentoPIX = {
    tipo: "PIX";
    valor: number;
    tipo_chave: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
    chave: string;
};

export type DadosPagamentoTED = {
    tipo: "TED";
    valor: number;
    banco_codigo: string;
    banco_nome: string;
    agencia: string;
    conta: string;
};

export type DadosPagamentoBoleto = {
    tipo: "Boleto";
    valor: number;
    codigo_barras: string;
};

export type DadosPagamentoItem = DadosPagamentoPIX | DadosPagamentoTED | DadosPagamentoBoleto;

// Schema de body da API

export const lancamentoApiBodySchema = z.object({
    tipo: z.enum(["CP", "CR"]),
    vencimento: z.string().trim().min(1),
    competencia: z.string().trim().min(1).nullable().optional(),
    conta_id: z.number().int().positive().nullable().optional(),
    parceiro_id: z.number().int().positive().nullable().optional(),
    descricao: z.string().trim().min(1).nullable().optional(),
    valor: z
        .union([z.string(), z.number()])
        .transform((v) => String(v))
        .refine((v) => {
            const n = Number(v);
            return !isNaN(n) && isFinite(n);
        }, "Valor numérico inválido."),
    status: z.string().trim().min(1).optional(),
    plano_conta_id: z.number().int().positive().nullable().optional(),
    departamento_id: z.number().int().positive().nullable().optional(),
    centro_custo_id: z.number().int().positive().nullable().optional(),
    parcela_atual: z.number().int().positive().optional(),
    total_parcelas: z.number().int().positive().optional(),
    riscos: z.array(z.string()).optional(),
    forma_pagamento: z.string().nullable().optional(),
    dados_pagamento: z.array(z.custom<DadosPagamentoItem>()).nullable().optional(),
});

export type LancamentoApiBody = z.infer<typeof lancamentoApiBodySchema>;

// Helpers de valor BR

export function brMoneyDisplayToDigits(display: string): string {
    return display.replace(/\D/g, "");
}

export function digitsToBrMoneyDisplay(digitsOnly: string): string {
    const d = digitsOnly.replace(/\D/g, "");
    if (!d) return "";
    const padded = d.padStart(3, "0");
    let intRaw = padded.slice(0, -2);
    intRaw = intRaw.replace(/^0+(?=\d)/, "") || "0";
    const dec = padded.slice(-2);
    const intFormatted = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${intFormatted},${dec}`;
}

export function formatValorBrInput(raw: string): string {
    const digits = brMoneyDisplayToDigits(raw);
    return digits ? digitsToBrMoneyDisplay(digits) : "";
}

export function brMoneyDisplayToApiString(display: string): string {
    const digits = brMoneyDisplayToDigits(display);
    if (!digits) return "";
    const padded = digits.padStart(3, "0");
    let intRaw = padded.slice(0, -2);
    intRaw = intRaw.replace(/^0+(?=\d)/, "") || "0";
    const dec = padded.slice(-2);
    return `${intRaw}.${dec}`;
}

export function apiValorToValorBr(valor: string | number | null | undefined): string {
    if (valor === null || valor === undefined) return "";
    const s = String(valor).trim();
    if (!s) return "";
    const normalized = s.replace(",", ".");
    const [intPart, frac = ""] = normalized.split(".");
    const intDigits = (intPart || "0").replace(/\D/g, "") || "0";
    const decDigits = `${frac.replace(/\D/g, "")}00`.slice(0, 2);
    const all = `${intDigits}${decDigits}`;
    return digitsToBrMoneyDisplay(all);
}

// Helpers internos de schema

const optionalIdSelect = z
    .string()
    .refine((v) => v === "" || /^\d+$/.test(v), {message: "Seleção inválida."});

export const competenciaSchema = z
    .string()
    .optional()
    .refine((v) => {
        if (!v || v === "") return true;
        if (!/^\d{2}\/\d{4}$/.test(v)) return false;
        const [mm, yyyy] = v.split("/").map(Number);
        return mm >= 1 && mm <= 12 && yyyy >= 2000 && yyyy <= 2100;
    }, "Competência inválida - use MM/AAAA com mês entre 01 e 12.");

// Schema por item de pagamento (um meio dentro do split)

export const pagamentoItemFormSchema = z
    .object({
        tipo: z.enum(["PIX", "TED", "Boleto"]),
        valorBr: z.string().min(1, "Informe o valor desta parcela."),
        tipo_chave_pix: z
            .enum(["cpf", "cnpj", "email", "telefone", "aleatoria", ""])
            .optional(),
        chave_pix: z.string().optional(),
        banco_codigo: z.string().optional(),
        banco_nome: z.string().optional(),
        banco_agencia: z.string().optional(),
        banco_conta: z.string().optional(),
        boleto_codigo_barras: z.string().optional(),
    })
    .superRefine((item, ctx) => {
        const api = brMoneyDisplayToApiString(item.valorBr);
        if (!api || parseFloat(api) <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "O valor deve ser maior que zero.",
                path: ["valorBr"],
            });
        }
        if (item.tipo === "PIX") {
            if (!item.tipo_chave_pix)
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Selecione o tipo de chave.",
                    path: ["tipo_chave_pix"]
                });
            if (!item.chave_pix?.trim()) {
                ctx.addIssue({code: z.ZodIssueCode.custom, message: "Informe a chave PIX.", path: ["chave_pix"]});
            } else {
                const chave = item.chave_pix.trim();
                const nums = chave.replace(/\D/g, "");
                if (item.tipo_chave_pix === "cpf" && nums.length !== 11)
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "CPF inválido - verifique os 11 dígitos.",
                        path: ["chave_pix"]
                    });
                else if (item.tipo_chave_pix === "cnpj" && nums.length !== 14)
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "CNPJ inválido - verifique os 14 dígitos.",
                        path: ["chave_pix"]
                    });
                else if (item.tipo_chave_pix === "email" && !z.string().email().safeParse(chave).success)
                    ctx.addIssue({code: z.ZodIssueCode.custom, message: "E-mail inválido.", path: ["chave_pix"]});
                else if (item.tipo_chave_pix === "telefone" && (nums.length < 10 || nums.length > 11))
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Telefone deve ter 10 ou 11 dígitos.",
                        path: ["chave_pix"]
                    });
            }
        }
        if (item.tipo === "TED") {
            if (!item.banco_codigo?.trim())
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Informe o código do banco.",
                    path: ["banco_codigo"]
                });
            if (!item.banco_nome?.trim())
                ctx.addIssue({code: z.ZodIssueCode.custom, message: "Informe o nome do banco.", path: ["banco_nome"]});
            if (!item.banco_agencia?.trim())
                ctx.addIssue({code: z.ZodIssueCode.custom, message: "Informe a agência.", path: ["banco_agencia"]});
            if (!item.banco_conta?.trim())
                ctx.addIssue({code: z.ZodIssueCode.custom, message: "Informe a conta.", path: ["banco_conta"]});
        }
        if (item.tipo === "Boleto") {
            if (!item.boleto_codigo_barras?.trim())
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Informe o código de barras.",
                    path: ["boleto_codigo_barras"]
                });
        }
    });

export type PagamentoItemFormValues = z.infer<typeof pagamentoItemFormSchema>;

/** Valor inicial para um novo item de pagamento adicionado via useFieldArray. */
export const pagamentoItemDefault: PagamentoItemFormValues = {
    tipo: "PIX",
    valorBr: "",
    tipo_chave_pix: "",
    chave_pix: "",
    banco_codigo: "",
    banco_nome: "",
    banco_agencia: "",
    banco_conta: "",
    boleto_codigo_barras: "",
};

// Schema do formulário modal

export const lancamentoModalFormSchema = z.object({
    tipo: z.enum(["CP", "CR"]),

    vencimento: z
        .string()
        .min(1, "Informe a data de vencimento.")
        .refine(
            (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T00:00:00").getTime()),
            "Data de vencimento inválida.",
        )
        .refine((v) => {
            const d = new Date(v + "T00:00:00");
            return d >= new Date("2000-01-01") && d <= new Date("2100-12-31");
        }, "Data fora do intervalo permitido."),

    competencia: competenciaSchema,

    parceiro_id: optionalIdSelect,
    descricao: z.string().optional(),

    valorBr: z
        .string()
        .min(1, "Informe o valor.")
        .refine(
            (s) => {
                const api = brMoneyDisplayToApiString(s);
                return api !== "" && /^[0-9]+\.[0-9]{2}$/.test(api);
            },
            "Valor inválido - use o formato 1.234,56.",
        )
        .refine(
            (s) => parseFloat(brMoneyDisplayToApiString(s)) > 0,
            "O valor deve ser maior que R$ 0,00.",
        ),

    status: lancamentoStatusEnum,
    plano_conta_id: optionalIdSelect,
    departamento_id: optionalIdSelect,
    centro_custo_id: optionalIdSelect,
    riscos: z.array(z.string()),

    // Split de pagamento - array vazio = sem forma de pagamento informada (CR ou CP sem detalhe)
    pagamentos: z.array(pagamentoItemFormSchema),
});

export type LancamentoModalFormValues = z.infer<typeof lancamentoModalFormSchema>;

// Tipo de edição (retorno da API → valores iniciais)

export type LancamentoEditItem = {
    id: number;
    tipo: string;
    vencimento: string;
    competencia: string | null;
    parceiro_id: number | null;
    descricao: string | null;
    valor: string | number;
    status: string;
    plano_conta_id: number | null;
    departamento_id?: number | null;
    centro_custo_id?: number | null;
    riscos?: string[];
    forma_pagamento?: string | null;
    // Aceita array (novo formato) ou objeto único (legado) para compatibilidade
    dados_pagamento?: DadosPagamentoItem[] | DadosPagamentoItem | null;
};

function normalizeStatusForForm(tipo: string, status: string): z.infer<typeof lancamentoStatusEnum> {
    const s = status as z.infer<typeof lancamentoStatusEnum>;
    const allowed: z.infer<typeof lancamentoStatusEnum>[] = [
        "pendente", "pago", "recebido", "atrasado", "cancelado",
    ];
    if (allowed.includes(s)) {
        if (tipo === "CR" && s === "pago") return "recebido";
        if (tipo === "CP" && s === "recebido") return "pago";
        return s;
    }
    return "pendente";
}

/**
 * Converte dados_pagamento da API (array ou objeto legado) para o formato do
 * useFieldArray, populando corretamente os campos planos de cada meio de pagamento.
 */
function normalizeDadosPagamentoParaForm(
    dp: DadosPagamentoItem[] | DadosPagamentoItem | null | undefined,
): PagamentoItemFormValues[] {
    if (!dp) return [];
    const items: DadosPagamentoItem[] = Array.isArray(dp) ? dp : [dp];
    return items.map((item): PagamentoItemFormValues => {
        const base: PagamentoItemFormValues = {
            ...pagamentoItemDefault,
            tipo: item.tipo,
            valorBr: apiValorToValorBr(item.valor),
        };
        if (item.tipo === "PIX")
            return {...base, tipo_chave_pix: item.tipo_chave, chave_pix: item.chave};
        if (item.tipo === "TED")
            return {
                ...base,
                banco_codigo: item.banco_codigo,
                banco_nome: item.banco_nome,
                banco_agencia: item.agencia,
                banco_conta: item.conta,
            };
        if (item.tipo === "Boleto")
            return {...base, boleto_codigo_barras: item.codigo_barras};
        return base;
    });
}

export function getLancamentoModalDefaultValues(editItem?: LancamentoEditItem | null): LancamentoModalFormValues {
    const base: LancamentoModalFormValues = {
        tipo: "CP",
        vencimento: "",
        competencia: "",
        parceiro_id: "",
        descricao: "",
        valorBr: "",
        status: "pendente",
        plano_conta_id: "",
        departamento_id: "",
        centro_custo_id: "",
        riscos: [],
        pagamentos: [],
    };

    if (!editItem) return base;

    return {
        ...base,
        tipo: editItem.tipo === "CR" ? "CR" : "CP",
        vencimento: editItem.vencimento ?? "",
        competencia: isoToCompetenciaDisplay(editItem.competencia),
        parceiro_id: editItem.parceiro_id != null ? String(editItem.parceiro_id) : "",
        descricao: editItem.descricao ?? "",
        valorBr: apiValorToValorBr(editItem.valor),
        status: normalizeStatusForForm(editItem.tipo, editItem.status),
        plano_conta_id: editItem.plano_conta_id != null ? String(editItem.plano_conta_id) : "",
        departamento_id: editItem.departamento_id != null ? String(editItem.departamento_id) : "",
        centro_custo_id: editItem.centro_custo_id != null ? String(editItem.centro_custo_id) : "",
        riscos: Array.isArray(editItem.riscos) ? [...editItem.riscos] : [],
        pagamentos: normalizeDadosPagamentoParaForm(editItem.dados_pagamento),
    };
}

/**
 * Converte "MM/YYYY" -> "YYYY-MM-01" (coluna date no PostgreSQL)
 */
function competenciaToIso(value: string | undefined | null): string | null {
    const v = value?.trim();
    if (!v) return null;
    const [mm, yyyy] = v.split("/");
    if (!mm || !yyyy) return null;
    return `${yyyy}-${mm.padStart(2, "0")}-01`;
}

/**
 * Converte "YYYY-MM-DD" da API -> "MM/YYYY" para o CompetenciaPicker
 */
function isoToCompetenciaDisplay(value: string | null | undefined): string {
    const v = value?.trim();
    if (!v) return "";
    const match = v.match(/^(\d{4})-(\d{2})/);
    if (!match) return "";
    return `${match[2]}/${match[1]}`;
}

function buildDadosPagamentoArray(pagamentos: PagamentoItemFormValues[]): DadosPagamentoItem[] {
    return pagamentos.map((p): DadosPagamentoItem => {
        const valor = parseFloat(brMoneyDisplayToApiString(p.valorBr)) || 0;
        if (p.tipo === "PIX") {
            return {
                tipo: "PIX",
                valor,
                tipo_chave: (p.tipo_chave_pix || "aleatoria") as DadosPagamentoPIX["tipo_chave"],
                chave: p.chave_pix?.trim() ?? "",
            };
        }
        if (p.tipo === "TED") {
            return {
                tipo: "TED",
                valor,
                banco_codigo: p.banco_codigo?.trim() ?? "",
                banco_nome: p.banco_nome?.trim() ?? "",
                agencia: p.banco_agencia?.trim() ?? "",
                conta: p.banco_conta?.trim() ?? "",
            };
        }
        return {
            tipo: "Boleto",
            valor,
            codigo_barras: p.boleto_codigo_barras?.trim() ?? "",
        };
    });
}

export function mapModalFormToApiBody(values: LancamentoModalFormValues): LancamentoApiBody {
    const dadosPagamento =
        values.tipo === "CP" && values.pagamentos.length > 0
            ? buildDadosPagamentoArray(values.pagamentos)
            : null;

    return {
        tipo: values.tipo,
        vencimento: values.vencimento.trim(),
        competencia: competenciaToIso(values.competencia),
        parceiro_id: values.parceiro_id === "" ? null : Number(values.parceiro_id),
        descricao: values.descricao?.trim() || null,
        valor: brMoneyDisplayToApiString(values.valorBr),
        status: values.status,
        plano_conta_id: values.plano_conta_id === "" ? null : Number(values.plano_conta_id),
        departamento_id: values.departamento_id === "" ? null : Number(values.departamento_id),
        centro_custo_id: values.centro_custo_id === "" ? null : Number(values.centro_custo_id),
        riscos: values.riscos,
        forma_pagamento: dadosPagamento && dadosPagamento.length > 0 ? dadosPagamento[0].tipo : null,
        dados_pagamento: dadosPagamento,
    };
}
