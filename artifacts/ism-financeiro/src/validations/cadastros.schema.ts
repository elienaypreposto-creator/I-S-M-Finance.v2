import { z } from "zod";

export const departamentoFormSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres."),
});

export type DepartamentoFormValues = z.infer<typeof departamentoFormSchema>;

/** Formulário de conta bancária (UI); `saldo_inicial_br` em máscara BR. */
export const contaBancariaFormSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da conta."),
  banco: z.string().optional().default(""),
  agencia: z.string().optional().default(""),
  conta: z.string().optional().default(""),
  tipo: z.string().trim().min(1, "Selecione o tipo de conta."),
  // FIX: aceita vazio (sem saldo inicial) ou o formato BR "1.234,56"
  saldo_inicial_br: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => !v || /^[\d.]*\d,\d{2}$/.test(v.trim()),
      "Saldo inválido — use o formato 1.234,56"
    ),
  cor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Selecione uma cor válida.")
    .default("#3BA8DC"),
});

export type ContaBancariaFormValues = z.infer<typeof contaBancariaFormSchema>;

const docNumeros = (s: string) => s.replace(/\D/g, "");

export const parceiroFormSchema = z
  .object({
    tipoPessoa: z.enum(["PF", "PJ"]),
    nomeRazao: z.string().trim().min(1, "Nome é obrigatório."),

    // FIX: valida dígitos mínimos já no campo, sem esperar o superRefine,
    //      dando feedback imediato ao sair do campo (onBlur/onTouched).
    //      O superRefine ainda verifica o total exato (11 ou 14) conforme tipoPessoa.
    documento: z
      .string()
      .trim()
      .min(1, "CPF/CNPJ é obrigatório.")
      .refine(
        (v) => docNumeros(v).length >= 11,
        "Documento incompleto — verifique os dígitos."
      ),

    departamento_id: z.string().default(""),
    tiposParceiro: z.array(z.string()).min(1, "Selecione ao menos um tipo de parceiro."),
    formaPagamento: z.enum(["PIX", "Boleto", "TED", "DOC", "Cheque"] as const),

    // FIX: string explícita (não undefined) — o default("") garante runtime seguro
    //      e o superRefine usa .trim() sem risco de quebrar.
    email: z.string().default(""),
    telefone: z.string().optional().default(""),

    pixTipoRecebedor: z.enum(["PF", "PJ"]),

    // FIX: normalizado para string vazia por padrão; o superRefine checa quando PIX está ativo.
    pixChave: z.string().default(""),
    agencia: z.string().default(""),
    contaTipo: z.enum(["Corrente", "Poupança"]).default("Corrente"),
    contaNumero: z.string().default(""),
    cpfCnpjBancario: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    // Valida total exato de dígitos conforme PF/PJ
    const n = docNumeros(data.documento);
    if (data.tipoPessoa === "PF") {
      if (n.length !== 11)
        ctx.addIssue({ code: "custom", message: "CPF deve ter 11 dígitos.", path: ["documento"] });
    } else if (n.length !== 14) {
      ctx.addIssue({ code: "custom", message: "CNPJ deve ter 14 dígitos.", path: ["documento"] });
    }

    // E-mail: valida somente se preenchido
    const mail = data.email.trim();
    if (mail && !z.string().email().safeParse(mail).success) {
      ctx.addIssue({ code: "custom", message: "E-mail inválido.", path: ["email"] });
    }

    // Campos condicionais PIX
    if (data.formaPagamento === "PIX") {
      if (!data.pixChave.trim())
        ctx.addIssue({ code: "custom", message: "Informe a chave PIX.", path: ["pixChave"] });
    }

    // Campos condicionais Boleto / TED / DOC
    if (
      data.formaPagamento === "Boleto" ||
      data.formaPagamento === "TED" ||
      data.formaPagamento === "DOC"
    ) {
      const docB = docNumeros(data.cpfCnpjBancario);
      const need = data.pixTipoRecebedor === "PF" ? 11 : 14;
      if (docB.length !== need) {
        ctx.addIssue({
          code: "custom",
          message:
            data.pixTipoRecebedor === "PF"
              ? "CPF do titular com 11 dígitos."
              : "CNPJ com 14 dígitos.",
          path: ["cpfCnpjBancario"],
        });
      }
      if (!data.agencia.trim())
        ctx.addIssue({ code: "custom", message: "Agência é obrigatória.", path: ["agencia"] });
      if (!data.contaNumero.trim())
        ctx.addIssue({
          code: "custom",
          message: "Número da conta é obrigatório.",
          path: ["contaNumero"],
        });
    }
  });

export type ParceiroFormValues = z.infer<typeof parceiroFormSchema>;