import {z} from "zod";

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

// Dados Bancários - item plano (todos os campos opcionais exceto `tipo`)
export const dadoBancarioFormItemSchema = z
    .object({
        tipo: z.enum(["PIX", "TED"]),
        tipo_chave: z
            .enum(["cpf", "cnpj", "email", "telefone", "aleatoria"])
            .optional(),
        chave: z.string().default(""),
        banco_codigo: z.string().default(""),
        banco_nome: z.string().default(""),
        agencia: z.string().default(""),
        conta: z.string().default(""),
    })
    .superRefine((item, ctx) => {
        if (item.tipo === "PIX") {
            if (!item.tipo_chave)
                ctx.addIssue({code: "custom", message: "Selecione o tipo de chave.", path: ["tipo_chave"]});
            if (!item.chave.trim())
                ctx.addIssue({code: "custom", message: "Chave PIX é obrigatória.", path: ["chave"]});
        }
        if (item.tipo === "TED") {
            if (!item.banco_codigo.trim())
                ctx.addIssue({code: "custom", message: "Código do banco é obrigatório.", path: ["banco_codigo"]});
            if (!item.banco_nome.trim())
                ctx.addIssue({code: "custom", message: "Nome do banco é obrigatório.", path: ["banco_nome"]});
            if (!item.agencia.trim())
                ctx.addIssue({code: "custom", message: "Agência é obrigatória.", path: ["agencia"]});
            if (!item.conta.trim())
                ctx.addIssue({code: "custom", message: "Conta é obrigatória.", path: ["conta"]});
        }
    });

export type DadoBancarioFormItem = z.infer<typeof dadoBancarioFormItemSchema>;

export const parceiroFormSchema = z
    .object({
        tipoPessoa: z.enum(["PF", "PJ"]),
        nomeRazao: z.string().trim().min(1, "Nome é obrigatório."),

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
        email: z.string().default(""),
        telefone: z.string().optional().default(""),
        dadosBancarios: z.array(dadoBancarioFormItemSchema).default([]),
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