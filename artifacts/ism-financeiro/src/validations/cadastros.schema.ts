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
  saldo_inicial_br: z.string().optional().default(""),
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
    documento: z.string().trim().min(1, "CPF/CNPJ é obrigatório."),
    departamento_id: z.string().default(""),
    tiposParceiro: z.array(z.string()).min(1, "Selecione ao menos um tipo de parceiro."),
    formaPagamento: z.enum(["PIX", "Boleto", "TED", "DOC", "Cheque"] as const),
    email: z.string().default(""),
    telefone: z.string().optional().default(""),
    pixTipoRecebedor: z.enum(["PF", "PJ"]),
    pixChave: z.string().optional().default(""),
    agencia: z.string().optional().default(""),
    contaTipo: z.enum(["Corrente", "Poupança"]).default("Corrente"),
    contaNumero: z.string().optional().default(""),
    cpfCnpjBancario: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    const n = docNumeros(data.documento);
    if (data.tipoPessoa === "PF") {
      if (n.length !== 11) ctx.addIssue({ code: "custom", message: "CPF deve ter 11 dígitos.", path: ["documento"] });
    } else if (n.length !== 14) {
      ctx.addIssue({ code: "custom", message: "CNPJ deve ter 14 dígitos.", path: ["documento"] });
    }

    const mail = data.email.trim();
    if (mail && !z.string().email().safeParse(mail).success) {
      ctx.addIssue({ code: "custom", message: "E-mail inválido.", path: ["email"] });
    }

    if (data.formaPagamento === "PIX") {
      const ch = data.pixChave.trim();
      if (!ch) ctx.addIssue({ code: "custom", message: "Informe a chave PIX.", path: ["pixChave"] });
    }

    if (data.formaPagamento === "Boleto" || data.formaPagamento === "TED" || data.formaPagamento === "DOC") {
      const docB = docNumeros(data.cpfCnpjBancario);
      const need = data.pixTipoRecebedor === "PF" ? 11 : 14;
      if (docB.length !== need) {
        ctx.addIssue({
          code: "custom",
          message: data.pixTipoRecebedor === "PF" ? "CPF do titular com 11 dígitos." : "CNPJ com 14 dígitos.",
          path: ["cpfCnpjBancario"],
        });
      }
      if (!data.agencia.trim()) ctx.addIssue({ code: "custom", message: "Agência é obrigatória.", path: ["agencia"] });
      if (!data.contaNumero.trim()) ctx.addIssue({ code: "custom", message: "Número da conta é obrigatório.", path: ["contaNumero"] });
    }
  });

export type ParceiroFormValues = z.infer<typeof parceiroFormSchema>;
