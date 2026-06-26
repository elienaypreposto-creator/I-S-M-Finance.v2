import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const lancamentoStatusEnum = z.enum([
  "pendente",
  "pago",
  "recebido",
  "atrasado",
  "cancelado",
]);

/** Formas de pagamento suportadas para CP (Card 27). */
export const formaPagamentoEnum = z.enum(["PIX", "TED", "Boleto", ""]);
export type FormaPagamento = z.infer<typeof formaPagamentoEnum>;

// ── Dados de pagamento tipados (espelha o backend) ────────────────────────────

export type DadosPagamentoPIX = {
  tipo: "PIX";
  tipo_chave: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
  chave: string;
};
export type DadosPagamentoTED = {
  tipo: "TED";
  banco_codigo: string;
  banco_nome: string;
  agencia: string;
  conta: string;
};
export type DadosPagamentoBoleto = {
  tipo: "Boleto";
  linha_digitavel: string;
  codigo_barras?: string | null;
};
export type DadosPagamento = DadosPagamentoPIX | DadosPagamentoTED | DadosPagamentoBoleto;

// ── Corpo da API (POST / PUT) ─────────────────────────────────────────────────

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
  dados_pagamento: z
    .custom<DadosPagamento>()
    .nullable()
    .optional(),
});

export type LancamentoApiBody = z.infer<typeof lancamentoApiBodySchema>;

// ── Helpers de valor BR ───────────────────────────────────────────────────────

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

// ── Helpers internos ──────────────────────────────────────────────────────────

const optionalIdSelect = z
  .string()
  .refine((v) => v === "" || /^\d+$/.test(v), { message: "Seleção inválida." });

export const competenciaSchema = z
  .string()
  .optional()
  .refine((v) => {
    if (!v || v === "") return true;
    if (!/^\d{2}\/\d{4}$/.test(v)) return false;
    const [mm, yyyy] = v.split("/").map(Number);
    return mm >= 1 && mm <= 12 && yyyy >= 2000 && yyyy <= 2100;
  }, "Competência inválida — use MM/AAAA com mês entre 01 e 12.");

// ── Schema do formulário modal ────────────────────────────────────────────────

export const lancamentoModalFormSchema = z
  .object({
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

    parceiro_id:   optionalIdSelect,
    descricao:     z.string().optional(),

    valorBr: z
      .string()
      .min(1, "Informe o valor.")
      .refine(
        (s) => {
          const api = brMoneyDisplayToApiString(s);
          return api !== "" && /^[0-9]+\.[0-9]{2}$/.test(api);
        },
        "Valor inválido — use o formato 1.234,56.",
      )
      .refine(
        (s) => parseFloat(brMoneyDisplayToApiString(s)) > 0,
        "O valor deve ser maior que R$ 0,00.",
      ),

    status:        lancamentoStatusEnum,
    plano_conta_id: optionalIdSelect,
    departamento_id: optionalIdSelect,
    centro_custo_id: optionalIdSelect,
    riscos:        z.array(z.string()),

    // ── Pagamento (apenas CP) ────────────────────────────────────────────────
    forma_pagamento: formaPagamentoEnum.optional(),

    // PIX
    tipo_chave_pix: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria", ""]).optional(),
    chave_pix:      z.string().optional(),

    // TED
    banco_codigo:   z.string().optional(),
    banco_nome:     z.string().optional(),
    banco_agencia:  z.string().optional(),
    banco_conta:    z.string().optional(),

    // Boleto
    boleto_linha_digitavel: z.string().optional(),
    boleto_codigo_barras:   z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const fp = data.tipo === "CP" ? data.forma_pagamento : "";

    if (fp === "PIX") {
      if (!data.tipo_chave_pix) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecione o tipo de chave.", path: ["tipo_chave_pix"] });
      }
      if (!data.chave_pix?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a chave PIX.", path: ["chave_pix"] });
      }
    }

    if (fp === "TED") {
      if (!data.banco_codigo?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe o código do banco.", path: ["banco_codigo"] });
      if (!data.banco_nome?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe o nome do banco.", path: ["banco_nome"] });
      if (!data.banco_agencia?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a agência.", path: ["banco_agencia"] });
      if (!data.banco_conta?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe o número da conta.", path: ["banco_conta"] });
    }

    if (fp === "Boleto") {
      if (!data.boleto_linha_digitavel?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a linha digitável.", path: ["boleto_linha_digitavel"] });
      }
    }
  });

export type LancamentoModalFormValues = z.infer<typeof lancamentoModalFormSchema>;

// ── Tipo de edição (retorno da API → valores iniciais) ────────────────────────

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
  dados_pagamento?: DadosPagamento | null;
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

/** Desempacota dados_pagamento (JSONB) nos campos planos do formulário. */
function unpackDadosPagamento(dp: DadosPagamento | null | undefined): Partial<LancamentoModalFormValues> {
  if (!dp) return {};
  if (dp.tipo === "PIX") {
    return { tipo_chave_pix: dp.tipo_chave, chave_pix: dp.chave };
  }
  if (dp.tipo === "TED") {
    return {
      banco_codigo:  dp.banco_codigo,
      banco_nome:    dp.banco_nome,
      banco_agencia: dp.agencia,
      banco_conta:   dp.conta,
    };
  }
  if (dp.tipo === "Boleto") {
    return {
      boleto_linha_digitavel: dp.linha_digitavel,
      boleto_codigo_barras:  dp.codigo_barras ?? "",
    };
  }
  return {};
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
    forma_pagamento: "",
    tipo_chave_pix: "",
    chave_pix: "",
    banco_codigo: "",
    banco_nome: "",
    banco_agencia: "",
    banco_conta: "",
    boleto_linha_digitavel: "",
    boleto_codigo_barras: "",
  };

  if (!editItem) return base;

  const pagamentoCampos = unpackDadosPagamento(editItem.dados_pagamento);
  const fpValue = (editItem.forma_pagamento ?? "") as LancamentoModalFormValues["forma_pagamento"];

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
    forma_pagamento: fpValue,
    ...pagamentoCampos,
  };
}

// ── Constrói dados_pagamento a partir dos campos planos do formulário ─────────

function buildDadosPagamento(values: LancamentoModalFormValues): DadosPagamento | null {
  const fp = values.tipo === "CP" ? values.forma_pagamento : "";
  if (!fp) return null;

  if (fp === "PIX") {
    return {
      tipo: "PIX",
      tipo_chave: (values.tipo_chave_pix || "aleatoria") as DadosPagamentoPIX["tipo_chave"],
      chave: values.chave_pix?.trim() ?? "",
    };
  }
  if (fp === "TED") {
    return {
      tipo: "TED",
      banco_codigo:  values.banco_codigo?.trim() ?? "",
      banco_nome:    values.banco_nome?.trim() ?? "",
      agencia:       values.banco_agencia?.trim() ?? "",
      conta:         values.banco_conta?.trim() ?? "",
    };
  }
  if (fp === "Boleto") {
    return {
      tipo: "Boleto",
      linha_digitavel: values.boleto_linha_digitavel?.trim() ?? "",
      codigo_barras:   values.boleto_codigo_barras?.trim() || null,
    };
  }
  return null;
}

/**
 * Converte o valor de exibição "MM/YYYY" para o formato ISO "YYYY-MM-01"
 * exigido pela coluna `date` do PostgreSQL.
 */
function competenciaToIso(value: string | undefined | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  const [mm, yyyy] = v.split("/");
  if (!mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-01`;
}

/**
 * Converte o valor ISO "YYYY-MM-DD" vindo da API de volta para o formato de
 * exibição "MM/YYYY" usado pelo CompetenciaPicker.
 */
function isoToCompetenciaDisplay(value: string | null | undefined): string {
  const v = value?.trim();
  if (!v) return "";
  // Aceita qualquer YYYY-MM-DD (o dia é ignorado)
  const match = v.match(/^(\d{4})-(\d{2})/);
  if (!match) return "";
  return `${match[2]}/${match[1]}`;
}

export function mapModalFormToApiBody(values: LancamentoModalFormValues): LancamentoApiBody {
  const competenciaTrim = competenciaToIso(values.competencia);

  return {
    tipo: values.tipo,
    vencimento:   values.vencimento.trim(),
    competencia:  competenciaTrim,
    parceiro_id:  values.parceiro_id  === "" ? null : Number(values.parceiro_id),
    descricao:    values.descricao?.trim() || null,
    valor:        brMoneyDisplayToApiString(values.valorBr),
    status:       values.status,
    plano_conta_id:  values.plano_conta_id  === "" ? null : Number(values.plano_conta_id),
    departamento_id: values.departamento_id === "" ? null : Number(values.departamento_id),
    centro_custo_id: values.centro_custo_id === "" ? null : Number(values.centro_custo_id),
    riscos:       values.riscos,
    forma_pagamento: (values.tipo === "CP" && values.forma_pagamento) ? values.forma_pagamento : null,
    dados_pagamento: buildDadosPagamento(values),
  };
}
