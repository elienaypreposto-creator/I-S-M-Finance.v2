import { z } from "zod";

/** Mesmos valores do enum `status_lancamento` no Postgres. */
export const lancamentoStatusEnum = z.enum([
  "pendente",
  "pago",
  "recebido",
  "atrasado",
  "cancelado",
]);

export const formaPagamentoEnum = z.enum(["PIX", "Boleto", "TED", "DOC", "Cheque", ""]);
export type FormaPagamento = z.infer<typeof formaPagamentoEnum>;

/** Espelha `createLancamentoBodySchema` do backend (campos enviados no POST/PUT). */
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
  chave_pix: z.string().nullable().optional(),
  banco_nome: z.string().nullable().optional(),
  banco_agencia: z.string().nullable().optional(),
  banco_conta: z.string().nullable().optional(),
});

export type LancamentoApiBody = z.infer<typeof lancamentoApiBodySchema>;

/** Somente dígitos (centavos implicitamente nos 2 últimos algarismos). */
export function brMoneyDisplayToDigits(display: string): string {
  return display.replace(/\D/g, "");
}

/** Formata dígitos como moeda BRL (ex.: 185000 → "1.850,00"). */
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

/** Normaliza o que o usuário digitou/colou para o padrão de exibição. */
export function formatValorBrInput(raw: string): string {
  const digits = brMoneyDisplayToDigits(raw);
  return digits ? digitsToBrMoneyDisplay(digits) : "";
}

/**
 * Converte exibição BR (ex.: "1.850,00") para string decimal limpa exigida pela API (ex.: "1850.00").
 */
export function brMoneyDisplayToApiString(display: string): string {
  const digits = brMoneyDisplayToDigits(display);
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  let intRaw = padded.slice(0, -2);
  intRaw = intRaw.replace(/^0+(?=\d)/, "") || "0";
  const dec = padded.slice(-2);
  return `${intRaw}.${dec}`;
}

/** Preenche o campo `valorBr` a partir do valor vindo da API (string ou number). */
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
  }, "Competência inválida — use MM/AAAA com mês entre 01 e 12 (ex: 07/2025)");


export const lancamentoModalFormSchema = z
  .object({
    tipo: z.enum(["CP", "CR"]),

    vencimento: z
      .string()
      .min(1, "Informe a data de vencimento.")
      .refine((v) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
        const d = new Date(v + "T00:00:00");
        return !isNaN(d.getTime());
      }, "Data de vencimento inválida.")
      .refine((v) => {
        const d = new Date(v + "T00:00:00");
        return d >= new Date("2000-01-01") && d <= new Date("2100-12-31");
      }, "Data fora do intervalo permitido (01/01/2000 a 31/12/2100)."),

    competencia: competenciaSchema,

    parceiro_id: optionalIdSelect,
    descricao: z.string().optional(),

    valorBr: z
      .string()
      .min(1, "Informe o valor.")
      .refine((s) => {
        const api = brMoneyDisplayToApiString(s);
        return api !== "" && /^[0-9]+\.[0-9]{2}$/.test(api);
      }, "Valor inválido — use o formato 1.234,56.")
      .refine((s) => {
        const api = brMoneyDisplayToApiString(s);
        return parseFloat(api) > 0;
      }, "O valor deve ser maior que R$ 0,00."),

    status: lancamentoStatusEnum,
    plano_conta_id: optionalIdSelect,
    riscos: z.array(z.string()),

    // ── Pagamento ────────────────────────────────────────────────────────────
    forma_pagamento: z.string().optional(),
    chave_pix:    z.string().optional(),
    banco_nome:   z.string().optional(),
    banco_agencia: z.string().optional(),
    banco_conta:  z.string().optional(),

    // ── Classificação interna ────────────────────────────────────────────────
    departamento_id: optionalIdSelect,
  })
  .superRefine((data, ctx) => {
    const fp = data.forma_pagamento;

    if (fp === "PIX") {
      if (!data.chave_pix?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe a chave PIX.",
          path: ["chave_pix"],
        });
      }
    }

    if (fp === "DOC" || fp === "TED") {
      if (!data.banco_agencia?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe a agência.",
          path: ["banco_agencia"],
        });
      }
      if (!data.banco_conta?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe o número da conta.",
          path: ["banco_conta"],
        });
      }
    }
  });

export type LancamentoModalFormValues = z.infer<typeof lancamentoModalFormSchema>;

export function getLancamentoModalDefaultValues(editItem?: LancamentoEditItem | null): LancamentoModalFormValues {
  if (!editItem) {
    return {
      tipo: "CP",
      vencimento: "",
      competencia: "",
      parceiro_id: "",
      descricao: "",
      valorBr: "",
      status: "pendente",
      plano_conta_id: "",
      riscos: [],
      forma_pagamento: "",
      chave_pix: "",
      banco_nome: "",
      banco_agencia: "",
      banco_conta: "",
      departamento_id: "",
    };
  }

  return {
    tipo: editItem.tipo === "CR" ? "CR" : "CP",
    vencimento: editItem.vencimento ?? "",
    competencia: editItem.competencia ?? "",
    parceiro_id: editItem.parceiro_id != null ? String(editItem.parceiro_id) : "",
    descricao: editItem.descricao ?? "",
    valorBr: apiValorToValorBr(editItem.valor),
    status: normalizeStatusForForm(editItem.tipo, editItem.status),
    plano_conta_id: editItem.plano_conta_id != null ? String(editItem.plano_conta_id) : "",
    riscos: Array.isArray(editItem.riscos) ? [...editItem.riscos] : [],
    forma_pagamento: editItem.forma_pagamento ?? "",
    chave_pix: editItem.chave_pix ?? "",
    banco_nome: editItem.banco_nome ?? "",
    banco_agencia: editItem.banco_agencia ?? "",
    banco_conta: editItem.banco_conta ?? "",
    departamento_id: editItem.departamento_id != null ? String(editItem.departamento_id) : "",
  };
}

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
  riscos?: string[];
  forma_pagamento?: string | null;
  chave_pix?: string | null;
  banco_nome?: string | null;
  banco_agencia?: string | null;
  banco_conta?: string | null;
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

export function mapModalFormToApiBody(values: LancamentoModalFormValues): LancamentoApiBody {
  const competenciaTrim = values.competencia?.trim();
  const fp = values.forma_pagamento;

  return {
    tipo: values.tipo,
    vencimento: values.vencimento.trim(),
    competencia: competenciaTrim ? competenciaTrim : null,
    parceiro_id: values.parceiro_id === "" ? null : Number(values.parceiro_id),
    descricao: values.descricao?.trim() ? values.descricao.trim() : null,
    valor: brMoneyDisplayToApiString(values.valorBr),
    status: values.status,
    plano_conta_id: values.plano_conta_id === "" ? null : Number(values.plano_conta_id),
    riscos: values.riscos,
    forma_pagamento: fp || null,
    chave_pix:     fp === "PIX"             ? (values.chave_pix?.trim()    || null) : null,
    banco_nome:    (fp === "DOC" || fp === "TED") ? (values.banco_nome?.trim()  || null) : null,
    banco_agencia: (fp === "DOC" || fp === "TED") ? (values.banco_agencia?.trim() || null) : null,
    banco_conta:   (fp === "DOC" || fp === "TED") ? (values.banco_conta?.trim()  || null) : null,
    departamento_id: values.departamento_id === "" ? null : Number(values.departamento_id),
  };
}