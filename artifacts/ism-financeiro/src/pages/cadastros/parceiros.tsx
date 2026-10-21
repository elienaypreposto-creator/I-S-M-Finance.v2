import {tenantQueryKey} from "@/lib/tenant-query";
import {useEffect, useMemo, useRef, useState} from "react";
import {
    useForm,
    useWatch,
    Controller,
    useFieldArray,
    type Control,
    type UseFormRegister,
    type UseFormSetValue,
    type FieldErrors,
} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {PageHeader} from "@/components/shared/page-header";
import {SelectCampo} from "@/components/ui/select-campo";
import {BotaoBloquear, BotaoEditar, BotaoExcluir} from "@/components/shared/botoes-acao";
import {
    Plus,
    Search,
    Download,
    Trash2,
    CheckCircle,
    X,
    AlertTriangle,
    Landmark,
} from "lucide-react";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData, ApiError} from "@/lib/api-config";
import {
    parceiroFormSchema,
    type ParceiroFormValues,
    type ContaBancariaFormItem,
    type PixKeyFormItem,
    type TedContaFormItem,
} from "@/validations/cadastros.schema";
import {exportToExcel} from "@/lib/export";
import {
    maskChavePix,
    mascararCodigoBanco,
    mascararAgencia,
    mascararConta,
    pixKeyMaxLength,
    pixKeyPlaceholder
} from "@/lib/pix-ted-masks.ts";
import {TableSkeleton} from "@/components/shared/table-skeleton";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {Modal, ModalBody, ModalFooter, ModalForm, ModalHeader, ModalSpinner, modalBtnPrimaryCls, modalBtnSecondaryCls, modalGridCls} from "@/components/ui/modal-responsivo";
import {hojeIsoLocal} from "@/lib/datas";
import {
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    EmptyContent,
} from "@/components/ui/empty";
import {
    CampoBusca,
    FiltrosAtivos,
    FiltrosPopover,
    useFiltrosNaUrl,
    type DefinicaoFiltro,
} from "@/components/shared/filtros";

const tiposParceiroOptions = [
    "Cliente",
    "Fornecedor",
    "Sócio(a)",
    "Participante Societário(a)",
    "Funcionário(a)",
    "Prestador(a) de Serviços PJ",
];

const TIPO_PARCEIRO_STYLE: Record<string, { bg: string; text: string; border: string }> = {
    "Cliente": {bg: "bg-teal-500/15", text: "text-teal-300", border: "border-teal-500/30"},
    "Fornecedor": {bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/30"},
    "Sócio(a)": {bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30"},
    "Participante Societário(a)": {bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-500/30"},
    "Funcionário(a)": {bg: "bg-sky-500/15", text: "text-sky-300", border: "border-sky-500/30"},
    "Prestador(a) de Serviços PJ": {bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30"},
};

function getTipoStyle(tipo: string) {
    return TIPO_PARCEIRO_STYLE[tipo] ?? {bg: "bg-white/10", text: "text-white/70", border: "border-white/10"};
}

function mascararDocumento(valor: string, tipo: "PJ" | "PF") {
    const n = valor.replace(/\D/g, "");
    if (tipo === "PF") {
        return n.slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }
    return n.slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function mascararTelefone(valor: string) {
    const n = valor.replace(/\D/g, "");
    return n.slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function docNumeros(s: string) {
    return s.replace(/\D/g, "");
}

type DepartamentoRow = { id: number; nome: string };

export type ParceiroRow = {
    id: number;
    tipo_pessoa: string;
    cpf_cnpj: string | null;
    nome: string;
    nome_fantasia: string | null;
    email: string | null;
    telefone: string | null;
    forma_pagamento_preferencial: string | null;
    tipos: unknown;
    departamento_id: number | null;
    centro_custo_id: number | null;
    status: string | null;
    ativo: boolean;
    bloqueado: boolean;
    chaves_pix: unknown;
    dados_bancarios: unknown;
};

function tiposArray(t: unknown): string[] {
    return Array.isArray(t) ? (t as string[]) : [];
}

function resolveStatus(p: ParceiroRow): "ativo" | "inativo" {
    if (p.status) return p.status === "inativo" ? "inativo" : "ativo";
    return p.ativo && !p.bloqueado ? "ativo" : "inativo";
}

// Converte o array plano vindo da API (itens {tipo:"PIX",...} | {tipo:"TED",...})
// em um único grupo "Conta" com múltiplas chaves PIX e múltiplas contas TED.
function dadosBancariosFromApi(
    dados_bancarios: unknown,
    chaves_pix: unknown,
    tipoPessoa: "PF" | "PJ",
): ContaBancariaFormItem[] {
    const pix: PixKeyFormItem[] = [];
    const ted: TedContaFormItem[] = [];
    const dbanc = dados_bancarios as Array<Record<string, unknown>> | null;

    if (dbanc && Array.isArray(dbanc)) {
        for (const item of dbanc) {
            if (item.tipo === "PIX") {
                pix.push({
                    tipo_chave: (item.tipo_chave as PixKeyFormItem["tipo_chave"]) ?? "cnpj",
                    chave: String(item.chave ?? ""),
                });
            } else if (item.tipo === "TED") {
                ted.push({
                    banco_codigo: String(item.banco_codigo ?? ""),
                    banco_nome: String(item.banco_nome ?? ""),
                    agencia: String(item.agencia ?? ""),
                    conta: String(item.conta ?? ""),
                });
            } else if (item.banco) {
                // Migração do formato legado: { banco: "TED", agencia, conta }
                ted.push({
                    banco_codigo: "",
                    banco_nome: String(item.banco ?? ""),
                    agencia: String(item.agencia ?? ""),
                    conta: String(item.conta ?? ""),
                });
            }
        }
    }

    // Migração de chaves_pix legadas
    if (pix.length === 0) {
        const cpix = chaves_pix as Array<{ tipo: string; chave: string }> | null;
        if (cpix && Array.isArray(cpix) && cpix.length > 0) {
            pix.push({
                tipo_chave: tipoPessoa === "PJ" ? "cnpj" : "cpf",
                chave: cpix[0].chave,
            });
        }
    }

    if (pix.length === 0 && ted.length === 0) return [];

    const formasPagamento: ("PIX" | "TED")[] = [];
    if (pix.length > 0) formasPagamento.push("PIX");
    if (ted.length > 0) formasPagamento.push("TED");

    return [{formasPagamento, pix, ted}];
}

function parceiroRowToFormValues(p: ParceiroRow): ParceiroFormValues {
    const tipo = (p.tipo_pessoa === "PF" ? "PF" : "PJ") as "PF" | "PJ";
    const rawDoc = docNumeros(String(p.cpf_cnpj ?? ""));

    return {
        tipoPessoa: tipo,
        nomeRazao: p.nome,
        nomeFantasia: p.nome_fantasia ?? "",
        documento: rawDoc ? mascararDocumento(rawDoc, tipo) : "",
        departamento_id: p.departamento_id ? String(p.departamento_id) : "",
        tiposParceiro: tiposArray(p.tipos),
        email: p.email || "",
        telefone: p.telefone ? mascararTelefone(p.telefone) : "",
        dadosBancarios: dadosBancariosFromApi(p.dados_bancarios, p.chaves_pix, tipo),
    };
}

// Achata os grupos de "Conta" de volta para o array plano esperado pela API,
// preservando total compatibilidade com o formato já persistido no banco.
// `statusAtual` preserva o ciclo de vida (ativo/bloqueado) já existente no
// registro quando estamos editando, para que salvar o cadastro nunca
// reative/desbloqueie um parceiro sem que o usuário tenha pedido isso.
function parceiroFormToApiBody(values: ParceiroFormValues, statusAtual?: { ativo: boolean; bloqueado: boolean }) {
    const dig = docNumeros(values.documento);
    const deptRaw = values.departamento_id?.trim() ?? "";

    const dados_bancarios = values.dadosBancarios.flatMap((grupo) => {
        const pixItems = grupo.formasPagamento.includes("PIX")
            ? grupo.pix.map((p) => ({tipo: "PIX" as const, tipo_chave: p.tipo_chave, chave: p.chave}))
            : [];
        const tedItems = grupo.formasPagamento.includes("TED")
            ? grupo.ted.map((t) => ({
                tipo: "TED" as const,
                banco_codigo: t.banco_codigo,
                banco_nome: t.banco_nome,
                agencia: t.agencia,
                conta: t.conta,
            }))
            : [];
        return [...pixItems, ...tedItems];
    });

    return {
        tipo_pessoa: values.tipoPessoa,
        cpf_cnpj: dig || null,
        nome: values.nomeRazao.trim(),
        nome_fantasia: values.nomeFantasia?.trim() || null,
        email: values.email?.trim() || null,
        telefone: docNumeros(values.telefone ?? "") || null,
        tipos: values.tiposParceiro,
        departamento_id: deptRaw ? Number(deptRaw) : null,
        centro_custo_id: null as number | null,
        ativo: statusAtual ? statusAtual.ativo : true,
        bloqueado: statusAtual ? statusAtual.bloqueado : false,
        dados_bancarios,
    };
}

const defaultParceiroForm: ParceiroFormValues = {
    tipoPessoa: "PJ",
    nomeRazao: "",
    nomeFantasia: "",
    documento: "",
    departamento_id: "",
    tiposParceiro: [],
    email: "",
    telefone: "",
    dadosBancarios: [],
};

const defaultContaBancaria: ContaBancariaFormItem = {
    formasPagamento: ["PIX"],
    pix: [{tipo_chave: "cnpj", chave: ""}],
    ted: [],
};

const PIX_TIPO_CHAVE_OPTIONS: { value: PixKeyFormItem["tipo_chave"] & string; label: string }[] = [
    {value: "cpf", label: "CPF"},
    {value: "cnpj", label: "CNPJ"},
    {value: "email", label: "E-mail"},
    {value: "telefone", label: "Telefone"},
    {value: "aleatoria", label: "Chave Aleatória"},
];

// Helpers de estilo reutilizados pelos sub-componentes
const innerFieldCls = (hasError?: boolean) =>
    `w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors ${
        hasError ? "border-destructive/60 focus:border-destructive" : "border-white/10"
    }`;

type ErrRecord = Record<string, { message?: string } | undefined>;

// ─── Linha de uma chave PIX dentro da tabela ────────────────────────────────
function PixKeyRow({contaIndex, pixIndex, control, setValue, remove, canRemove, errs}: {
    contaIndex: number;
    pixIndex: number;
    control: Control<ParceiroFormValues>;
    setValue: UseFormSetValue<ParceiroFormValues>;
    remove: (index: number) => void;
    canRemove: boolean;
    errs?: ErrRecord;
}) {
    const tipoChave = useWatch({control, name: `dadosBancarios.${contaIndex}.pix.${pixIndex}.tipo_chave`}) ?? "";

    return (
        <tr className="border-t border-white/5">
            <td className="px-3 py-2 align-top">
                <Controller
                    name={`dadosBancarios.${contaIndex}.pix.${pixIndex}.tipo_chave`}
                    control={control}
                    render={({field}) => (
                        <SelectCampo
                            value={field.value ?? ""}
                            aria-label="Tipo de chave PIX"
                            onBlur={field.onBlur}
                            onChange={(value) => {
                                field.onChange(value);
                                setValue(`dadosBancarios.${contaIndex}.pix.${pixIndex}.chave`, "", {shouldDirty: true});
                            }}
                            opcoes={PIX_TIPO_CHAVE_OPTIONS.map((o) => ({value: o.value, label: o.label}))}
                        />
                    )}
                />
                {errs?.tipo_chave?.message && (
                    <p className="text-xs text-destructive mt-1">{errs.tipo_chave.message}</p>
                )}
            </td>
            <td className="px-3 py-2 align-top">
                <Controller
                    name={`dadosBancarios.${contaIndex}.pix.${pixIndex}.chave`}
                    control={control}
                    render={({field}) => (
                        <input
                            value={field.value}
                            onChange={(e) => field.onChange(maskChavePix(e.target.value, tipoChave))}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            maxLength={pixKeyMaxLength(tipoChave)}
                            placeholder={pixKeyPlaceholder(tipoChave)}
                            className={innerFieldCls(!!errs?.chave)}
                        />
                    )}
                />
                {errs?.chave?.message && (
                    <p className="text-xs text-destructive mt-1">{errs.chave.message}</p>
                )}
            </td>
            <td className="px-2 py-2 align-top text-right w-[40px]">
                {canRemove && (
                    <button type="button" onClick={() => remove(pixIndex)}
                            className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title="Remover chave">
                        <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                )}
            </td>
        </tr>
    );
}

// ─── Linha de uma conta TED dentro da tabela ────────────────────────────────
// Código do banco, agência e conta recebem máscara (apenas dígitos, com
// dígito verificador separado por hífen em agência/conta). Nome do banco
// permanece livre.
function TedContaRow({contaIndex, tedIndex, control, register, remove, canRemove, errs}: {
    contaIndex: number;
    tedIndex: number;
    control: Control<ParceiroFormValues>;
    register: UseFormRegister<ParceiroFormValues>;
    remove: (index: number) => void;
    canRemove: boolean;
    errs?: ErrRecord;
}) {
    return (
        <tr className="border-t border-white/5">
            <td className="px-3 py-2 align-top w-[90px]">
                <Controller
                    name={`dadosBancarios.${contaIndex}.ted.${tedIndex}.banco_codigo`}
                    control={control}
                    render={({field}) => (
                        <input
                            value={field.value}
                            onChange={(e) => field.onChange(mascararCodigoBanco(e.target.value))}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            inputMode="numeric"
                            className={innerFieldCls(!!errs?.banco_codigo)}
                            placeholder="033"
                        />
                    )}
                />
                {errs?.banco_codigo?.message && (
                    <p className="text-xs text-destructive mt-1">{errs.banco_codigo.message}</p>
                )}
            </td>
            <td className="px-3 py-2 align-top">
                <input
                    {...register(`dadosBancarios.${contaIndex}.ted.${tedIndex}.banco_nome`)}
                    className={innerFieldCls(!!errs?.banco_nome)}
                    placeholder="Ex: Santander"
                />
                {errs?.banco_nome?.message && (
                    <p className="text-xs text-destructive mt-1">{errs.banco_nome.message}</p>
                )}
            </td>
            <td className="px-3 py-2 align-top w-[110px]">
                <Controller
                    name={`dadosBancarios.${contaIndex}.ted.${tedIndex}.agencia`}
                    control={control}
                    render={({field}) => (
                        <input
                            value={field.value}
                            onChange={(e) => field.onChange(mascararAgencia(e.target.value))}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            inputMode="numeric"
                            className={innerFieldCls(!!errs?.agencia)}
                            placeholder="0000-0"
                        />
                    )}
                />
                {errs?.agencia?.message && (
                    <p className="text-xs text-destructive mt-1">{errs.agencia.message}</p>
                )}
            </td>
            <td className="px-3 py-2 align-top w-[130px]">
                <Controller
                    name={`dadosBancarios.${contaIndex}.ted.${tedIndex}.conta`}
                    control={control}
                    render={({field}) => (
                        <input
                            value={field.value}
                            onChange={(e) => field.onChange(mascararConta(e.target.value))}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            inputMode="numeric"
                            className={innerFieldCls(!!errs?.conta)}
                            placeholder="00000-0"
                        />
                    )}
                />
                {errs?.conta?.message && (
                    <p className="text-xs text-destructive mt-1">{errs.conta.message}</p>
                )}
            </td>
            <td className="px-2 py-2 align-top text-right w-[40px]">
                {canRemove && (
                    <button type="button" onClick={() => remove(tedIndex)}
                            className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title="Remover conta TED">
                        <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                )}
            </td>
        </tr>
    );
}

type ContaBancariaGroupProps = {
    index: number;
    control: Control<ParceiroFormValues>;
    register: UseFormRegister<ParceiroFormValues>;
    setValue: UseFormSetValue<ParceiroFormValues>;
    remove: (index: number) => void;
    errors: FieldErrors<ParceiroFormValues>;
};

// Grupo "Conta N": permite selecionar PIX e/ou TED simultaneamente,
// cada um com 1 ou mais valores (chaves PIX / contas TED).
function ContaBancariaGroup({index, control, register, setValue, remove, errors}: ContaBancariaGroupProps) {
    const formasPagamento = (useWatch({
        control,
        name: `dadosBancarios.${index}.formasPagamento`
    }) ?? []) as ("PIX" | "TED")[];

    const {fields: pixFields, append: appendPix, remove: removePix} = useFieldArray({
        control,
        name: `dadosBancarios.${index}.pix`,
    });
    const {fields: tedFields, append: appendTed, remove: removeTed} = useFieldArray({
        control,
        name: `dadosBancarios.${index}.ted`,
    });

    const errs = (
        errors.dadosBancarios as unknown as
            | Record<number, {
            formasPagamento?: { message?: string };
            pix?: Record<number, ErrRecord>;
            ted?: Record<number, ErrRecord>;
        } | undefined>
            | undefined
    )?.[index];

    function toggleForma(forma: "PIX" | "TED") {
        const checked = formasPagamento.includes(forma);
        const next = checked ? formasPagamento.filter((f) => f !== forma) : [...formasPagamento, forma];
        setValue(`dadosBancarios.${index}.formasPagamento`, next, {shouldDirty: true, shouldValidate: true});

        if (!checked) {
            // Ao habilitar a forma, garante ao menos um valor pronto para preencher
            if (forma === "PIX" && pixFields.length === 0) appendPix({tipo_chave: "cnpj", chave: ""});
            if (forma === "TED" && tedFields.length === 0) appendTed({
                banco_codigo: "",
                banco_nome: "",
                agencia: "",
                conta: ""
            });
        } else {
            // Ao desabilitar, limpa os valores para não enviar dados obsoletos
            if (forma === "PIX") setValue(`dadosBancarios.${index}.pix`, [], {shouldDirty: true});
            if (forma === "TED") setValue(`dadosBancarios.${index}.ted`, [], {shouldDirty: true});
        }
    }

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white/80">Conta {index + 1}</span>
                <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                    title="Remover conta"
                >
                    <Trash2 className="w-3.5 h-3.5"/>
                </button>
            </div>

            {/* Formas de pagamento - multi-seleção (PIX e TED podem ficar ativos juntos) */}
            <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Formas de Pagamento</label>
                <div className="flex gap-2">
                    {(["PIX", "TED"] as const).map((f) => {
                        const checked = formasPagamento.includes(f);
                        return (
                            <button
                                key={f}
                                type="button"
                                onClick={() => toggleForma(f)}
                                aria-pressed={checked}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                    checked
                                        ? "bg-primary text-white border-primary"
                                        : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                                }`}
                            >
                                {checked && <CheckCircle className="w-3.5 h-3.5"/>}
                                {f}
                            </button>
                        );
                    })}
                </div>
                {errs?.formasPagamento?.message && (
                    <p className="text-xs text-destructive mt-1">{errs.formasPagamento.message}</p>
                )}
            </div>

            {/* Chaves PIX (1 ou mais) */}
            {formasPagamento.includes("PIX") && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Tipo de Chave PIX</span>
                        <button
                            type="button"
                            onClick={() => appendPix({tipo_chave: "cnpj", chave: ""})}
                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold"
                        >
                            <Plus className="w-3 h-3"/> Adicionar Chave
                        </button>
                    </div>
                    <div className="bg-black/10 border border-white/10 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-black/20">
                            <tr>
                                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo
                                    de Chave
                                </th>
                                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Chave</th>
                                <th className="px-2 py-2 w-[40px]"/>
                            </tr>
                            </thead>
                            <tbody>
                            {pixFields.map((field, pixIndex) => (
                                <PixKeyRow
                                    key={field.id}
                                    contaIndex={index}
                                    pixIndex={pixIndex}
                                    control={control}
                                    setValue={setValue}
                                    remove={removePix}
                                    canRemove={pixFields.length > 1}
                                    errs={errs?.pix?.[pixIndex]}
                                />
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Contas TED (1 ou mais) */}
            {formasPagamento.includes("TED") && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Contas TED</span>
                        <button
                            type="button"
                            onClick={() => appendTed({banco_codigo: "", banco_nome: "", agencia: "", conta: ""})}
                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold"
                        >
                            <Plus className="w-3 h-3"/> Adicionar Conta TED
                        </button>
                    </div>
                    <div className="bg-black/10 border border-white/10 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-black/20">
                            <tr>
                                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Cód.</th>
                                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome
                                    do Banco
                                </th>
                                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Agência</th>
                                <th className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Conta</th>
                                <th className="px-2 py-2 w-[40px]"/>
                            </tr>
                            </thead>
                            <tbody>
                            {tedFields.map((field, tedIndex) => (
                                <TedContaRow
                                    key={field.id}
                                    contaIndex={index}
                                    tedIndex={tedIndex}
                                    control={control}
                                    register={register}
                                    remove={removeTed}
                                    canRemove={tedFields.length > 1}
                                    errs={errs?.ted?.[tedIndex]}
                                />
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {formasPagamento.length === 0 && (
                <p className="text-xs text-muted-foreground">Selecione ao menos uma forma de pagamento para esta
                    conta.</p>
            )}
        </div>
    );
}

export function NovoParceiroModal({onClose, initialData, onSaved, returnFocusTo}: {
    onClose: () => void;
    initialData?: ParceiroRow | null;
    onSaved?: () => void;
    /** Para onde devolver o foco ao fechar (padrão: quem abriu o modal). */
    returnFocusTo?: () => HTMLElement | null | undefined;
}) {
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const [showConfirmCancel, setShowConfirmCancel] = useState(false);
    const isEdit = !!initialData;

    const {data: departamentos = []} = useQuery({
        queryKey: tenantQueryKey("departamentos"),
        queryFn: () => fetchApiData<DepartamentoRow[]>("/departamentos"),
    });

    const form = useForm<ParceiroFormValues>({
        resolver: zodResolver(parceiroFormSchema),
        mode: "onTouched",
        defaultValues: isEdit ? parceiroRowToFormValues(initialData) : defaultParceiroForm,
    });

    const {
        register,
        control,
        handleSubmit,
        watch,
        setValue,
        reset,
        trigger,
        formState: {errors, isDirty},
    } = form;

    const {fields, append, remove} = useFieldArray({control, name: "dadosBancarios"});

    useEffect(() => {
        if (isEdit && initialData) reset(parceiroRowToFormValues(initialData));
        else reset(defaultParceiroForm);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tipoPessoa = watch("tipoPessoa");
    const tiposParceiro = watch("tiposParceiro");

    // Revalida o documento ao trocar PF/PJ, mas nunca na primeira renderização:
    // caso contrário, um formulário novo (documento vazio) já nasceria mostrando
    // "CPF é obrigatório" antes mesmo do usuário tocar no campo.
    const isFirstRenderRef = useRef(true);
    useEffect(() => {
        if (isFirstRenderRef.current) {
            isFirstRenderRef.current = false;
            return;
        }
        void trigger("documento");
    }, [tipoPessoa, trigger]);

    const saveMutation = useMutation({
        mutationFn: (values: ParceiroFormValues) => {
            const body = parceiroFormToApiBody(
                values,
                isEdit ? {ativo: initialData.ativo, bloqueado: initialData.bloqueado} : undefined,
            );
            if (isEdit)
                return fetchApiData<ParceiroRow>(`/parceiros/${initialData.id}`, {
                    method: "PUT",
                    body: JSON.stringify(body)
                });
            return fetchApiData<ParceiroRow>("/parceiros", {method: "POST", body: JSON.stringify(body)});
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("parceiros")});
            toast({
                title: isEdit ? "Parceiro atualizado" : "Parceiro cadastrado",
                description: "O registro foi salvo com sucesso.",
            });
            onSaved?.();
            reset(defaultParceiroForm);
            onClose();
        },
        onError: (e: unknown) => {
            if (e instanceof ApiError && e.status === 409) {
                toast({
                    variant: "destructive",
                    title: "Edição bloqueada",
                    description: e.message,
                    duration: 8000,
                });
                return;
            }
            toast({
                variant: "destructive",
                title: "Erro ao salvar",
                description: e instanceof Error ? e.message : String(e),
            });
        },
    });

    const handleCancel = () => {
        if (isDirty) setShowConfirmCancel(true);
        else onClose();
    };

    const fieldCls = (hasError?: boolean) =>
        `w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors ${
            hasError ? "border-destructive/60 focus:border-destructive" : "border-white/10"
        }`;
    const labelCls = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block";

    return (
        <Modal onClose={handleCancel} returnFocusTo={returnFocusTo}>
            <ModalHeader title={`${isEdit ? "Editar Cadastro" : "Novo Cadastro"} - Clientes/Fornecedores`}/>

            <ModalForm onSubmit={handleSubmit((v) => saveMutation.mutate(v))} noValidate>
                <ModalBody>
                    <div className={modalGridCls}>
                        {/* Tipo de Pessoa */}
                        <div role="group" aria-labelledby="parceiro-tipo-pessoa-label">
                            <span id="parceiro-tipo-pessoa-label" className={labelCls}>Tipo de Pessoa *</span>
                            <Controller
                                name="tipoPessoa"
                                control={control}
                                render={({field}) => (
                                    <div className="flex gap-2">
                                        {(["PF", "PJ"] as const).map((t) => (
                                            <button key={t} type="button"
                                                    aria-pressed={field.value === t}
                                                    onClick={() => {
                                                        field.onChange(t);
                                                        setValue("documento", "", {shouldDirty: true});
                                                    }}
                                                    className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${
                                                        field.value === t ? "bg-primary text-white border-primary" : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                                                    }`}>
                                                {t === "PF" ? "Pessoa Física (PF)" : "Pessoa Jurídica (PJ)"}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            />
                        </div>

                        {/* Nome / Razão social */}
                        <div>
                            <label htmlFor="parceiro-nome" className={labelCls}>
                                {tipoPessoa === "PF" ? "Nome Completo *" : "Razão Social / Nome Fantasia *"}
                            </label>
                            <input id="parceiro-nome" {...register("nomeRazao")} className={fieldCls(!!errors.nomeRazao)}
                                   aria-invalid={!!errors.nomeRazao}
                                   placeholder={tipoPessoa === "PF" ? "Ex: João da Silva" : "Ex: Tech Solutions S.A."}/>
                            {errors.nomeRazao &&
                                <p className="text-xs text-destructive mt-1">{errors.nomeRazao.message}</p>}
                        </div>

                        {/* Documento */}
                        <div>
                            <label htmlFor="parceiro-documento" className={labelCls}>
                                {tipoPessoa === "PF" ? "CPF *" : "CNPJ *"}
                            </label>
                            <Controller name="documento" control={control} render={({field}) => (
                                <input id="parceiro-documento" value={field.value}
                                       onChange={(e) => field.onChange(mascararDocumento(e.target.value, tipoPessoa as "PF" | "PJ"))}
                                       onBlur={field.onBlur}
                                       aria-invalid={!!errors.documento}
                                       className={fieldCls(!!errors.documento)}
                                       placeholder={tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}/>
                            )}/>
                            {errors.documento &&
                                <p className="text-xs text-destructive mt-1">{errors.documento.message}</p>}
                        </div>

                        {/* Nome Fantasia - apenas para PJ */}
                        {tipoPessoa === "PJ" && (
                            <div>
                                <label htmlFor="parceiro-fantasia" className={labelCls}>Nome Fantasia</label>
                                <input
                                    id="parceiro-fantasia"
                                    {...register("nomeFantasia")}
                                    className={fieldCls(!!errors.nomeFantasia)}
                                    placeholder="Ex: Soluções Tech"
                                />
                                {errors.nomeFantasia && (
                                    <p className="text-xs text-destructive mt-1">{errors.nomeFantasia.message}</p>
                                )}
                            </div>
                        )}

                        {/* E-mail */}
                        <div>
                            <label htmlFor="parceiro-email" className={labelCls}>E-mail</label>
                            <input id="parceiro-email" {...register("email")} type="email" className={fieldCls(!!errors.email)}
                                   aria-invalid={!!errors.email}
                                   placeholder="email@exemplo.com.br"/>
                            {errors.email &&
                                <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                        </div>

                        {/* Telefone */}
                        <div>
                            <label htmlFor="parceiro-telefone" className={labelCls}>Telefone</label>
                            <Controller name="telefone" control={control} render={({field}) => (
                                <input id="parceiro-telefone" value={field.value}
                                       onChange={(e) => field.onChange(mascararTelefone(e.target.value))}
                                       onBlur={field.onBlur}
                                       aria-invalid={!!errors.telefone}
                                       className={fieldCls(!!errors.telefone)} placeholder="(11) 99999-0000"/>
                            )}/>
                            {errors.telefone &&
                                <p className="text-xs text-destructive mt-1">{errors.telefone.message}</p>}
                        </div>

                        {/* Departamento */}
                        <div>
                            <label htmlFor="parceiro-departamento" className={labelCls}>Lotação / Departamento</label>
                            <Controller
                                name="departamento_id"
                                control={control}
                                render={({field}) => (
                                    <SelectCampo
                                        id="parceiro-departamento"
                                        value={field.value ?? ""}
                                        permitirVazio
                                        placeholder="Selecione..."
                                        onBlur={field.onBlur}
                                        onChange={field.onChange}
                                        opcoes={departamentos.map((d) => ({value: String(d.id), label: d.nome}))}
                                    />
                                )}
                            />
                        </div>

                        {/* Tipos de Parceiro */}
                        <div className="col-span-full" role="group" aria-labelledby="parceiro-tipos-label">
                            <span id="parceiro-tipos-label" className={labelCls}>Tipo de Parceiro *</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                                {tiposParceiroOptions.map((t) => {
                                    const style = getTipoStyle(t);
                                    const checked = tiposParceiro.includes(t);
                                    return (
                                        <label key={t}
                                               className={`flex items-center gap-2 cursor-pointer p-3 rounded-xl border transition-all ${
                                                   checked ? `${style.bg} ${style.border} border` : "border-white/10 hover:border-primary/40 hover:bg-primary/5"
                                               }`}>
                                            <input type="checkbox" checked={checked}
                                                   onChange={() => {
                                                       const next = checked ? tiposParceiro.filter((x) => x !== t) : [...tiposParceiro, t];
                                                       setValue("tiposParceiro", next, {
                                                           shouldValidate: true,
                                                           shouldDirty: true,
                                                           shouldTouch: true
                                                       });
                                                   }}
                                                   className="accent-primary w-4 h-4"/>
                                            <span
                                                className={`text-sm font-medium ${checked ? style.text : "text-white"}`}>{t}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {errors.tiposParceiro &&
                                <p className="text-xs text-destructive mt-1">{errors.tiposParceiro.message}</p>}
                        </div>

                        {/* ── Dados Bancários ──────────────────────────────────────── */}
                        <div className="col-span-full">
                            <div className="flex items-center justify-between mb-3">
                                <span
                                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <Landmark aria-hidden="true" className="w-3.5 h-3.5"/> Dados Bancários
                                </span>
                                <button
                                    type="button"
                                    onClick={() => append({...defaultContaBancaria})}
                                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
                                >
                                    <Plus aria-hidden="true" className="w-3.5 h-3.5"/> Adicionar Conta
                                </button>
                            </div>

                            {fields.length === 0 ? (
                                <div className="border border-dashed border-white/10 rounded-xl p-5 text-center">
                                    <Landmark aria-hidden="true" className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2"/>
                                    <p className="text-xs text-muted-foreground">Nenhuma conta cadastrada. Clique em
                                        "Adicionar Conta" para incluir PIX e/ou TED.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
                                    {fields.map((field, index) => (
                                        <ContaBancariaGroup
                                            key={field.id}
                                            index={index}
                                            control={control}
                                            register={register}
                                            setValue={setValue}
                                            remove={remove}
                                            errors={errors}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </ModalBody>

                <ModalFooter hint="* Campos obrigatórios · Esc fecha">
                    <button type="button" onClick={handleCancel} className={modalBtnSecondaryCls}>Cancelar</button>
                    <button type="submit" disabled={saveMutation.isPending} className={modalBtnPrimaryCls}>
                        {saveMutation.isPending ? <ModalSpinner/> : isEdit ? "Salvar Alterações" : "Salvar Cadastro"}
                    </button>
                </ModalFooter>
            </ModalForm>

            {/* Confirmação curta (AlertDialog compacto, acima do modal). */}
            <ConfirmDialog
                open={showConfirmCancel}
                title="Cancelar cadastro?"
                description="As informações preenchidas serão perdidas. Deseja realmente cancelar?"
                confirmLabel="Sim, cancelar"
                cancelLabel="Não, continuar"
                variant="destructive"
                icon={AlertTriangle}
                onCancel={() => setShowConfirmCancel(false)}
                onConfirm={() => {
                    setShowConfirmCancel(false);
                    reset(defaultParceiroForm);
                    onClose();
                }}
            />
        </Modal>
    );
}

const DEFINICOES_FILTRO_PARCEIROS: DefinicaoFiltro[] = [
    {
        chave: "status",
        rotulo: "Status",
        tipo: "select",
        placeholder: "Todos",
        opcoes: [
            {valor: "ativo", rotulo: "Ativo"},
            {valor: "inativo", rotulo: "Inativo"},
        ],
    },
    {
        chave: "tipo",
        rotulo: "Tipo de parceiro",
        tipo: "select",
        placeholder: "Todos",
        opcoes: tiposParceiroOptions.map((t) => ({valor: t, rotulo: t})),
    },
    {
        chave: "tipo_pessoa",
        rotulo: "Pessoa",
        tipo: "select",
        placeholder: "PF e PJ",
        opcoes: [
            {valor: "PF", rotulo: "Pessoa física (PF)"},
            {valor: "PJ", rotulo: "Pessoa jurídica (PJ)"},
        ],
    },
];

export default function Parceiros() {
    const queryClient = useQueryClient();
    const {toast} = useToast();
    // Busca e filtros na URL; todos aplicados na API (GET /parceiros).
    const filtros = useFiltrosNaUrl(DEFINICOES_FILTRO_PARCEIROS);
    const search = filtros.ler("q");
    const debouncedSearch = search;
    const paramsFiltro = new URLSearchParams(filtros.valores).toString();
    const [showModal, setShowModal] = useState(false);
    const [editingParceiro, setEditingParceiro] = useState<ParceiroRow | null>(null);
    const {confirm, ConfirmDialogProps} = useConfirm();

    const {data: departamentos = []} = useQuery({
        queryKey: tenantQueryKey("departamentos"),
        queryFn: () => fetchApiData<DepartamentoRow[]>("/departamentos"),
    });

    const deptNomeById = useMemo(() => new Map(departamentos.map((d) => [d.id, d.nome])), [departamentos]);

    const {data: parceirosLista = [], isLoading} = useQuery({
        queryKey: tenantQueryKey("parceiros", debouncedSearch, paramsFiltro),
        queryFn: () => {
            const q = debouncedSearch.trim();
            const qs = new URLSearchParams(paramsFiltro);
            qs.set("limit", "200");
            qs.set("page", "1");
            if (q) qs.set("search", q);
            return fetchApiData<ParceiroRow[]>(`/parceiros?${qs.toString()}`);
        },
    });

    // Altera apenas o status (ciclo de vida) - sempre permitido mesmo com vínculos
    const toggleStatusMutation = useMutation({
        mutationFn: ({id, status}: { id: number; status: "ativo" | "inativo" }) =>
            fetchApiData<ParceiroRow>(`/parceiros/${id}`, {
                method: "PUT",
                body: JSON.stringify({status}),
            }),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("parceiros")});
            toast({
                title: variables.status === "ativo" ? "Parceiro ativado" : "Parceiro inativado",
                description: "O status foi atualizado com sucesso.",
            });
        },
        onError: (e: unknown) => {
            toast({variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e)});
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) =>
            fetchApiData<{ deleted?: boolean }>(`/parceiros/${id}`, {method: "DELETE"}),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("parceiros")});
            toast({title: "Parceiro removido", description: "O cadastro foi excluído."});
        },
        onError: (e: unknown) => {
            if (e instanceof ApiError && e.status === 409) {
                toast({
                    variant: "destructive",
                    title: "Exclusão bloqueada",
                    description:
                        "Este parceiro possui lançamentos vinculados e não pode ser excluído. Use a opção \"Inativar\" para desativá-lo sem perder o histórico.",
                    duration: 8000,
                });
                return;
            }
            toast({
                variant: "destructive",
                title: "Erro ao excluir",
                description: e instanceof Error ? e.message : String(e)
            });
        },
    });

    const handleDelete = async (p: ParceiroRow) => {
        const ok = await confirm({
            title: `Excluir "${p.nome.toUpperCase()}"?`,
            description: "Esta ação não pode ser desfeita. O cadastro será removido permanentemente.",
            confirmLabel: "Excluir",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(p.id);
    };

    const handleEdit = async (p: ParceiroRow) => {
        const ok = await confirm({
            title: `Editar "${p.nome.toUpperCase()}"?`,
            description: "Você será direcionado ao formulário de edição deste cadastro.",
            confirmLabel: "Editar",
            cancelLabel: "Cancelar",
            variant: "default",
        });
        if (ok) setEditingParceiro(p);
    };

    const handleToggleAtivo = async (p: ParceiroRow) => {
        const isAtivo = resolveStatus(p) === "ativo";
        const ok = await confirm({
            title: isAtivo ? `Inativar "${p.nome}"?` : `Ativar "${p.nome}"?`,
            description: isAtivo
                ? "O parceiro não aparecerá nas listagens de lançamentos. O histórico financeiro é preservado."
                : "O parceiro voltará a ficar disponível para novos lançamentos.",
            confirmLabel: isAtivo ? "Inativar" : "Ativar",
            cancelLabel: "Cancelar",
            variant: isAtivo ? "destructive" : "default",
        });
        if (ok) {
            toggleStatusMutation.mutate({id: p.id, status: isAtivo ? "inativo" : "ativo"});
        }
    };

    const getDocDisplay = (p: ParceiroRow) => {
        if (!p.cpf_cnpj) return "-";
        const tipo = (p.tipo_pessoa === "PF" ? "PF" : "PJ") as "PF" | "PJ";
        return mascararDocumento(String(p.cpf_cnpj).replace(/\D/g, ""), tipo);
    };

    const EXPORT_COLUMNS_PARCEIROS = [
        {header: "Tipo Pessoa", key: "tipo_pessoa", width: 12},
        {header: "Nome / Razão", key: "nome", width: 40},
        {header: "CPF / CNPJ", key: "cpf_cnpj_fmt", width: 22},
        {header: "Tipos Parceiro", key: "tipos_fmt", width: 34},
        {header: "Departamento", key: "dept_nome", width: 26},
        {header: "Status", key: "status_fmt", width: 12},
    ];

    function handleExportParceiros() {
        const rows = parceirosLista.map((p) => ({
            tipo_pessoa: p.tipo_pessoa,
            nome: p.nome,
            cpf_cnpj_fmt: getDocDisplay(p),
            tipos_fmt: tiposArray(p.tipos).join(", ") || "-",
            dept_nome: p.departamento_id ? (deptNomeById.get(p.departamento_id) ?? "-") : "-",
            status_fmt: resolveStatus(p) === "ativo" ? "Ativo" : "Inativo",
        })) as Record<string, unknown>[];

        exportToExcel(`Parceiros_${hojeIsoLocal()}`, rows, EXPORT_COLUMNS_PARCEIROS);
    }

    return (
        <div className="space-y-6">
            <ConfirmDialog {...ConfirmDialogProps} />

            {(showModal || editingParceiro) && (
                <NovoParceiroModal
                    key={editingParceiro?.id ?? "new"}
                    initialData={editingParceiro ?? undefined}
                    onClose={() => {
                        setShowModal(false);
                        setEditingParceiro(null);
                    }}
                />
            )}

            <PageHeader
                title="Clientes / Fornecedores"
                description="Cadastro de clientes, fornecedores, funcionários, sócios e parceiros"
                actions={
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleExportParceiros}
                            disabled={parceirosLista.length === 0 || isLoading}
                            title="Exportar XLSX"
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                            <Download className="w-4 h-4"/> Exportar XLSX
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
                            <Plus className="w-4 h-4"/> Cadastrar Novo
                        </button>
                    </div>
                }
            />

            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
                    <div className="flex items-center gap-3">
                        <FiltrosPopover
                            definicoes={DEFINICOES_FILTRO_PARCEIROS}
                            valores={filtros.valores}
                            contagem={filtros.contagem}
                            onAplicar={filtros.aplicar}
                        />
                        <span className="text-xs text-muted-foreground">
                            {isLoading ? "…" : `${parceirosLista.length} cadastros`}
                        </span>
                    </div>
                    <CampoBusca
                        valor={search}
                        onBuscar={(termo) => filtros.atualizar({q: termo || null})}
                        placeholder="Buscar por nome ou CPF/CNPJ..."
                        rotulo="Buscar clientes e fornecedores por nome ou CPF/CNPJ"
                    />
                </div>

                <FiltrosAtivos
                    chips={filtros.chips}
                    onRemover={filtros.remover}
                    onLimparTodos={filtros.limpar}
                    anuncio={isLoading ? "" : `${parceirosLista.length} ${parceirosLista.length === 1 ? "cadastro encontrado" : "cadastros encontrados"}`}
                />

                {isLoading && <TableSkeleton rows={6} columns={7}/>}

                {!isLoading && parceirosLista.length === 0 && (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Search className="text-muted-foreground/40"/>
                            </EmptyMedia>
                            <EmptyTitle className="text-white">
                                {search || filtros.contagem > 0 ? "Nenhum resultado encontrado" : "Nenhum parceiro cadastrado"}
                            </EmptyTitle>
                            <EmptyDescription>
                                {search || filtros.contagem > 0
                                    ? search
                                        ? `Não encontramos cadastros para "${search}" com os filtros aplicados. Tente outro termo.`
                                        : "Nenhum cadastro com os filtros aplicados."
                                    : "Cadastre clientes, fornecedores e parceiros para usar nos lançamentos."}
                            </EmptyDescription>
                        </EmptyHeader>
                        {!search && filtros.contagem === 0 && (
                            <EmptyContent>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(true)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                                >
                                    <Plus className="w-4 h-4"/>
                                    Cadastrar Novo
                                </button>
                            </EmptyContent>
                        )}
                    </Empty>
                )}

                {!isLoading && parceirosLista.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-black/20 text-muted-foreground">
                            <tr>
                                <th className="px-5 py-3 font-medium w-16 text-center">Tipo</th>
                                <th className="px-5 py-3 font-medium">Nome / Razão Social</th>
                                <th className="px-5 py-3 font-medium">CPF / CNPJ</th>
                                <th className="px-5 py-3 font-medium">Tipo de Parceiro</th>
                                <th className="px-5 py-3 font-medium">Lotação</th>
                                <th className="px-5 py-3 font-medium text-center">Status</th>
                                <th className="px-5 py-3 font-medium text-right">Ações</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                            {parceirosLista.map((p) => {
                                const tipoUi = p.tipo_pessoa === "PJ" ? "PJ" : "PF";
                                const isAtivo = resolveStatus(p) === "ativo";
                                const lotacao = p.departamento_id ? deptNomeById.get(p.departamento_id) ?? "-" : "-";
                                const tipos = tiposArray(p.tipos);
                                return (
                                    <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-5 py-4 text-center">
                        <span
                            className={`text-xs font-bold px-2 py-1 rounded ${tipoUi === "PJ" ? "bg-primary/20 text-primary" : "bg-teal-500/20 text-teal-400"}`}>
                          {tipoUi}
                        </span>
                                        </td>
                                        <td className="px-5 py-4 font-semibold text-white">{p.nome}</td>
                                        <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{getDocDisplay(p)}</td>
                                        <td className="px-5 py-4">
                                            <div className="flex gap-1 flex-wrap">
                                                {tipos.length === 0 ? (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                ) : (
                                                    tipos.map((t) => {
                                                        const s = getTipoStyle(t);
                                                        return (
                                                            <span key={t}
                                                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                                  {t}
                                </span>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-muted-foreground text-sm">{lotacao}</td>
                                        <td className="px-5 py-4 text-center">
                        <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${isAtivo ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                          {isAtivo ? "Ativo" : "Inativo"}
                        </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <BotaoEditar onClick={() => handleEdit(p)}/>
                                                <BotaoBloquear
                                                    bloqueado={!isAtivo}
                                                    title={isAtivo ? "Inativar" : "Ativar"}
                                                    onClick={() => handleToggleAtivo(p)}
                                                />
                                                <BotaoExcluir onClick={() => handleDelete(p)}/>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}