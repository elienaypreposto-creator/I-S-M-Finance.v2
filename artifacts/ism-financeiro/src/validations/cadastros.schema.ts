import {z} from "zod";

export const departamentoFormSchema = z.object({
    nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres."),
});

export type DepartamentoFormValues = z.infer<typeof departamentoFormSchema>;

export const TIPOS_CONTA = ["Conta Corrente", "Conta Movimento", "Conta Poupança"] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];

/**
 * Formulário de conta bancária - Wizard 3 passos.
 */
export const contaBancariaFormSchema = z
    .object({
        tipo: z.string().trim().min(1, "Selecione o tipo de conta."),
        nome: z.string().trim().min(1, "Informe o nome da conta."),
        banco: z.string().optional().default(""),
        agencia: z.string().optional().default(""),
        digito_agencia: z.string().optional().default(""),
        conta: z.string().optional().default(""),
        digito_conta: z.string().optional().default(""),
        empresa: z.string().optional().default(""),
        saldo_inicial_br: z
            .string()
            .optional()
            .default("")
            .refine(
                (v) => !v || /^[\d.]*\d,\d{2}$/.test(v.trim()),
                "Saldo inválido - use o formato 1.234,56",
            ),
        data_inicio: z
            .string()
            .min(1, "Informe a data de início dos lançamentos.")
            .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida."),
        cor: z
            .string()
            .regex(/^#[0-9A-Fa-f]{6}$/, "Selecione uma cor válida.")
            .default("#3BA8DC"),
    })
    .superRefine((data, ctx) => {
        const precisaBanco =
            data.tipo === "Conta Corrente" || data.tipo === "Conta Poupança";
        if (precisaBanco) {
            if (!data.banco?.trim())
                ctx.addIssue({code: "custom", message: "Informe o banco.", path: ["banco"]});
            if (!data.agencia?.trim())
                ctx.addIssue({code: "custom", message: "Informe a agência.", path: ["agencia"]});
            if (!data.conta?.trim())
                ctx.addIssue({code: "custom", message: "Informe a conta.", path: ["conta"]});
        }
    });

export type ContaBancariaFormValues = z.infer<typeof contaBancariaFormSchema>;

const docNumeros = (s: string) => s.replace(/\D/g, "");

/** Uma chave PIX dentro de um grupo de dados bancários. */
export const pixKeyFormItemSchema = z.object({
    tipo_chave: z.enum(["cpf", "cnpj", "email", "telefone", "aleatoria"]),
    chave: z.string().min(1, "Chave PIX é obrigatória."),
});
export type PixKeyFormItem = z.infer<typeof pixKeyFormItemSchema>;

/** Uma conta TED dentro de um grupo de dados bancários. */
export const tedContaFormItemSchema = z.object({
    banco_codigo: z.string().min(1, "Código do banco é obrigatório."),
    banco_nome: z.string().min(1, "Nome do banco é obrigatório."),
    agencia: z.string().min(1, "Agência é obrigatória."),
    conta: z.string().min(1, "Conta é obrigatória."),
});
export type TedContaFormItem = z.infer<typeof tedContaFormItemSchema>;

/**
 * Grupo "Conta N": agrupa formasPagamento (PIX e/ou TED) com suas listade chaves/contas. Essa estrutura agrupada é usada pelo formulário
 */
export const contaBancariaFormItemSchema = z
    .object({
        formasPagamento: z.array(z.enum(["PIX", "TED"])).min(1, "Selecione ao menos uma forma de pagamento."),
        pix: z.array(pixKeyFormItemSchema).default([]),
        ted: z.array(tedContaFormItemSchema).default([]),
    })
    .superRefine((item, ctx) => {
        if (item.formasPagamento.includes("PIX")) {
            item.pix.forEach((p, i) => {
                if (!p.tipo_chave)
                    ctx.addIssue({
                        code: "custom",
                        message: "Selecione o tipo de chave.",
                        path: ["pix", i, "tipo_chave"]
                    });
                if (!p.chave.trim()) {
                    ctx.addIssue({code: "custom", message: "Chave PIX é obrigatória.", path: ["pix", i, "chave"]});
                } else {
                    const chave = p.chave.trim();
                    const nums = chave.replace(/\D/g, "");
                    if (p.tipo_chave === "cpf" && nums.length !== 11)
                        ctx.addIssue({
                            code: "custom",
                            message: "CPF inválido - verifique os 11 dígitos.",
                            path: ["pix", i, "chave"]
                        });
                    else if (p.tipo_chave === "cnpj" && nums.length !== 14)
                        ctx.addIssue({
                            code: "custom",
                            message: "CNPJ inválido - verifique os 14 dígitos.",
                            path: ["pix", i, "chave"]
                        });
                    else if (p.tipo_chave === "email" && !z.string().email().safeParse(chave).success)
                        ctx.addIssue({code: "custom", message: "E-mail inválido.", path: ["pix", i, "chave"]});
                    else if (p.tipo_chave === "telefone" && (nums.length < 10 || nums.length > 11))
                        ctx.addIssue({
                            code: "custom",
                            message: "Telefone deve ter 10 ou 11 dígitos.",
                            path: ["pix", i, "chave"]
                        });
                }
            });
        }
        if (item.formasPagamento.includes("TED")) {
            item.ted.forEach((t, i) => {
                if (!t.banco_codigo.trim())
                    ctx.addIssue({
                        code: "custom",
                        message: "Código do banco é obrigatório.",
                        path: ["ted", i, "banco_codigo"]
                    });
                if (!t.banco_nome.trim())
                    ctx.addIssue({
                        code: "custom",
                        message: "Nome do banco é obrigatório.",
                        path: ["ted", i, "banco_nome"]
                    });
                if (!t.agencia.trim())
                    ctx.addIssue({code: "custom", message: "Agência é obrigatória.", path: ["ted", i, "agencia"]});
                if (!t.conta.trim())
                    ctx.addIssue({code: "custom", message: "Conta é obrigatória.", path: ["ted", i, "conta"]});
            });
        }
    });

export type ContaBancariaFormItem = z.infer<typeof contaBancariaFormItemSchema>;

export const parceiroFormSchema = z
    .object({
        tipoPessoa: z.enum(["PF", "PJ"]),
        nomeRazao: z.string().trim().min(1, "Nome é obrigatório."),
        nomeFantasia: z.string().trim().optional().default(""),

        documento: z
            .string()
            .trim()
            .min(1, "CPF/CNPJ é obrigatório.")
            .refine(
                (v) => docNumeros(v).length >= 11,
                "Documento incompleto - verifique os dígitos."
            ),

        departamento_id: z.string().default(""),
        tiposParceiro: z.array(z.string()).min(1, "Selecione ao menos um tipo de parceiro."),
        email: z.string().default(""),
        telefone: z.string().optional().default(""),
        dadosBancarios: z.array(contaBancariaFormItemSchema).default([]),
    })
    .superRefine((data, ctx) => {
        const n = docNumeros(data.documento);
        if (data.tipoPessoa === "PF") {
            if (n.length !== 11)
                ctx.addIssue({code: "custom", message: "CPF deve ter 11 dígitos.", path: ["documento"]});
        } else if (n.length !== 14) {
            ctx.addIssue({code: "custom", message: "CNPJ deve ter 14 dígitos.", path: ["documento"]});
        }

        const mail = data.email.trim();
        if (mail && !z.string().email().safeParse(mail).success) {
            ctx.addIssue({code: "custom", message: "E-mail inválido.", path: ["email"]});
        }
    });

export type ParceiroFormValues = z.infer<typeof parceiroFormSchema>;
