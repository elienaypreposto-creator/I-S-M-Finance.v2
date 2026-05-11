import { z } from "zod";

/** Mesmos valores do enum `status_lancamento` no Postgres. */
export const lancamentoStatusEnum = z.enum([
  "pendente",
  "pago",
  "recebido",
  "atrasado",
  "cancelado",
]);

/** Espelha `createLancamentoBodySchema` do backend (campos enviados no POST/PUT). */
export const lancamentoApiBodySchema = z.object({
  tipo: z.enum(["CP", "CR"]),
  vencimento: z.string().trim().min(1),
  competencia: z.string().trim().min(1).nullable().optional(),
  conta_id: z.number().int().positive().nullable().optional(),
  parceiro_id: z.number().int().positive().nullable().optional(),
  descricao: z.string().trim().min(1).nullable().optional(),
  valor: z.union([z.string(), z.number()]).transform((v) => String(v)),
  status: z.string().trim().min(1).optional(),
  plano_conta_id: z.number().int().positive().nullable().optional(),
  departamento_id: z.number().int().positive().nullable().optional(),
  centro_custo_id: z.number().int().positive().nullable().optional(),
  parcela_atual: z.number().int().positive().optional(),
  total_parcelas: z.number().int().positive().optional(),
  riscos: z.array(z.string()).optional(),
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

/** Normaliza o que o usuário digitou/colar para o padrão de exibição. */
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

/**
 * Formulário do modal: `valorBr` é a máscara BR; demais campos alinhados ao backend.
 */
export const lancamentoModalFormSchema = z.object({
  tipo: z.enum(["CP", "CR"]),
  vencimento: z.string().trim().min(1, "Informe a data de vencimento."),
  competencia: z.string().optional(),
  parceiro_id: optionalIdSelect,
  descricao: z.string().optional(),
  valorBr: z
    .string()
    .min(1, "Informe o valor.")
    .refine((s) => brMoneyDisplayToDigits(s).length > 0, { message: "Informe o valor." })
    .refine((s) => {
      const api = brMoneyDisplayToApiString(s);
      return api !== "" && /^[0-9]+(\.[0-9]{2})$/.test(api);
    }, { message: "Valor inválido." }),
  status: lancamentoStatusEnum,
  plano_conta_id: optionalIdSelect,
  riscos: z.array(z.string()),
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
  riscos?: string[];
};

function normalizeStatusForForm(tipo: string, status: string): z.infer<typeof lancamentoStatusEnum> {
  const s = status as z.infer<typeof lancamentoStatusEnum>;
  const allowed: z.infer<typeof lancamentoStatusEnum>[] = [
    "pendente",
    "pago",
    "recebido",
    "atrasado",
    "cancelado",
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
  };
}
