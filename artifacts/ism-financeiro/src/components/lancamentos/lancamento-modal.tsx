import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {
    useForm,
    Controller,
    useFieldArray,
    useWatch,
    type Control,
    type UseFormSetValue,
    type FieldErrors,
} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Calendar as CalendarPicker} from "@/components/ui/calendar";
import {format as formatBtn, parseISO} from "date-fns";
import {ptBR} from "date-fns/locale";
import {cn} from "@/lib/utils";
import {fetchApiData} from "@/lib/api-config";
import {
    maskChavePix,
    mascararCodigoBanco,
    mascararAgencia,
    mascararConta,
    pixKeyMaxLength,
    pixKeyPlaceholder
} from "@/lib/pix-ted-masks.ts";
import {
    formatValorBrInput,
    getLancamentoModalDefaultValues,
    lancamentoModalFormSchema,
    mapModalFormToApiBody,
    pagamentoItemDefault,
    apiValorToValorBr,
    brMoneyDisplayToApiString,
    type LancamentoApiBody,
    type LancamentoEditItem,
    type LancamentoModalFormValues,
    type PagamentoItemFormValues,
} from "@/validations/lancamentos.schema";
import {
    Plus,
    Loader2,
    X,
    Calendar,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
    Target,
    Search,
    Building2,
    CreditCard,
    Trash2,
    Edit2,
    AlertTriangle,
} from "lucide-react";
import {NovoParceiroModal, type ParceiroRow} from "@/pages/cadastros/parceiros";

type PlanoConta = { id: number; tipo: string; categoria: string; subcategoria: string | null };
type Departamento = { id: number; nome: string };
type CentroCusto = { id: number; nome: string; departamento_id: number | null };

/**
 * Dados vindos da linha do extrato bancário (Conciliação) para pré-popular o
 * formulário na criação de um NOVO lançamento — não é edição de um lançamento
 * existente, então não usa `LancamentoEditItem` (que dispara o GET
 * /lancamentos/:id). Usado pelo botão "+" em extrato.tsx (RN-D3).
 */
export type LancamentoPrefill = {
    tipo: "CP" | "CR";
    vencimento: string; // "YYYY-MM-DD"
    valor: number;
    descricao?: string | null;
};

function buildDefaultValuesFromPrefill(prefill: LancamentoPrefill): LancamentoModalFormValues {
    return {
        ...getLancamentoModalDefaultValues(null),
        tipo: prefill.tipo,
        vencimento: prefill.vencimento || "",
        valorBr: apiValorToValorBr(prefill.valor),
        descricao: prefill.descricao ?? "",
    };
}

// Converte uma string mascarada em pt-BR ("1.234,56") para number (1234.56).
// Usado apenas para o cálculo em tempo real do "Valor Atual" (Bruto - Desconto + Juros).
function parseValorBrToNumber(display: string | undefined | null): number {
    const api = brMoneyDisplayToApiString(display ?? "");
    const n = parseFloat(api);
    return isNaN(n) ? 0 : n;
}

// Modal de confirmação genérico e reutilizável, seguindo o padrão visual usado
// em toda a aplicação (ícone no topo, título em negrito, descrição centralizada,
// dois botões lado a lado). Usado aqui para confirmar o cancelamento do
// cadastro/edição quando há alterações não salvas no formulário.
type ConfirmDialogTone = "warning" | "danger" | "info";

function ConfirmDialog({
                           open,
                           icon,
                           tone = "warning",
                           title,
                           description,
                           confirmLabel,
                           cancelLabel = "Cancelar",
                           onConfirm,
                           onCancel,
                       }: {
    open: boolean;
    icon?: React.ReactNode;
    tone?: ConfirmDialogTone;
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    if (!open) return null;

    const toneCls: Record<ConfirmDialogTone, { iconBg: string; iconColor: string; confirmBtn: string }> = {
        warning: {
            iconBg: "bg-yellow-500/10",
            iconColor: "text-yellow-400",
            confirmBtn: "bg-destructive hover:bg-destructive/90",
        },
        danger: {
            iconBg: "bg-destructive/10",
            iconColor: "text-destructive",
            confirmBtn: "bg-destructive hover:bg-destructive/90",
        },
        info: {
            iconBg: "bg-primary/10",
            iconColor: "text-primary",
            confirmBtn: "bg-primary hover:bg-primary/90",
        },
    };
    const t = toneCls[tone];

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div
                className="bg-[#181a20] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col items-center text-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${t.iconBg}`}>
                    {icon ?? <AlertTriangle className={`w-6 h-6 ${t.iconColor}`}/>}
                </div>
                <div className="space-y-1.5">
                    <h3 className="text-base font-black text-white tracking-tight">{title}</h3>
                    {description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                    )}
                </div>
                <div className="flex gap-3 w-full pt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white hover:bg-white/5 text-sm font-bold transition-all"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-all ${t.confirmBtn}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Agrupa os itens de Plano de Contas por `categoria` (mostrada uma única vez,
// como cabeçalho) com cada `subcategoria` indentada logo abaixo - mesmo quando
// categorias diferentes compartilham a mesma subcategoria (ex.: "Aluguel"
// aparecendo tanto em "Despesas Gerais" quanto em "Despesas Financeiros"
// formam dois grupos distintos).
function groupPlanoContasPorCategoria(itens: PlanoConta[]): { categoria: string; itens: PlanoConta[] }[] {
    const map = new Map<string, PlanoConta[]>();
    for (const item of itens) {
        const lista = map.get(item.categoria) ?? [];
        lista.push(item);
        map.set(item.categoria, lista);
    }
    return Array.from(map.entries()).map(([categoria, grupoItens]) => ({categoria, itens: grupoItens}));
}

const BASE_RISK_LEVELS: Record<number, { label: string; color: string; tags: string[] }> = {
    1: {
        label: "Nível 1 - Alerta",
        color: "text-yellow-400",
        tags: ["Multas e Juros", "Perda de Desconto", "Restrição de Crédito"]
    },
    2: {
        label: "Nível 2 - Risco Operacional",
        color: "text-orange-500",
        tags: ["Corte de Serviço", "Suspensão de Fornecimento", "Negativação", "Perda de Benefício Fiscal"]
    },
    3: {
        label: "Nível 3 - Risco Jurídico",
        color: "text-red-500",
        tags: ["Protesto", "Ação Judicial", "Dívida Ativa", "Quebra de Contrato"]
    },
    4: {
        label: "Nível 4 - Risco Crítico",
        color: "text-purple-400",
        tags: ["Bloqueio de Contas (Sisbajud)", "Penhora de Bens", "Pedido de Falência", "Impedimento de Certidão"]
    },
};

function CompetenciaPicker({value, onChange}: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const [currentYear, setCurrentYear] = useState(value?.includes("/") ? parseInt(value.split("/")[1]) : new Date().getFullYear());
    const selectedMonthIdx = value?.includes("/") ? parseInt(value.split("/")[0]) - 1 : -1;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button"
                        className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white flex items-center justify-between hover:border-white/20 transition-all">
                    {value || "Selecione..."}
                    <CalendarDays className="w-4 h-4 text-muted-foreground"/>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start"
                            className="bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl p-4 w-72">
                <div className="flex items-center justify-between mb-4 px-1">
                    <button type="button" onClick={() => setCurrentYear((y) => y - 1)}
                            className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
                        <ChevronLeft className="w-5 h-5"/>
                    </button>
                    <span className="text-sm font-bold text-white tracking-widest">{currentYear}</span>
                    <button type="button" onClick={() => setCurrentYear((y) => y + 1)}
                            className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-colors">
                        <ChevronRight className="w-5 h-5"/>
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {months.map((m, i) => (
                        <button key={m} type="button"
                                onClick={() => {
                                    onChange(`${String(i + 1).padStart(2, "0")}/${currentYear}`);
                                    setOpen(false);
                                }}
                                className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                                    selectedMonthIdx === i && value.includes(String(currentYear))
                                        ? "bg-primary text-white shadow-lg shadow-primary/30"
                                        : "text-white/60 hover:bg-white/5 hover:text-white"
                                }`}>
                            {m}
                        </button>
                    ))}
                </div>
                <div className="flex justify-end mt-4 pt-3 border-t border-white/5">
                    <button type="button" onClick={() => setOpen(false)}
                            className="px-4 py-1.5 bg-success hover:bg-success/90 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-success/20">
                        Confirmar
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ParceiroCombobox({
                              value,
                              onChange,
                              parceiros,
                              search,
                              onSearchChange,
                              onEdit,
                              onCreateNew,
                              isLoading = false,
                          }: {
    value: string;
    onChange: (v: string) => void;
    parceiros: ParceiroRow[];
    search: string;
    onSearchChange: (s: string) => void;
    onEdit: (p: ParceiroRow) => void;
    onCreateNew: () => void;
    isLoading?: boolean;
}) {
    const [open, setOpen] = useState(false);

    const handleOpenChange = (o: boolean) => {
        setOpen(o);
        if (!o) onSearchChange("");
    };

    const selected = parceiros.find((p) => String(p.id) === value);

    const badgeCls = (tipoPessoa: string) =>
        `text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
            tipoPessoa === "PJ" ? "bg-primary/20 text-primary" : "bg-teal-500/20 text-teal-400"
        }`;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between hover:border-white/20 transition-all"
                >
                    {selected ? (
                        <span className="text-white flex items-center gap-2 min-w-0">
                            <span className={badgeCls(selected.tipo_pessoa)}>{selected.tipo_pessoa}</span>
                            <span className="truncate">{selected.nome}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground/40">Selecione o cliente/fornecedor...</span>
                    )}
                    <Search className="w-4 h-4 text-muted-foreground shrink-0 ml-2"/>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={4}
                className="p-0 bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl"
                style={{width: "var(--radix-popover-trigger-width)"}}
            >
                {/* Barra de busca */}
                <div className="p-3 border-b border-white/5">
                    <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                        <Search className="w-4 h-4 text-muted-foreground shrink-0"/>
                        <input
                            autoFocus
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Buscar por nome..."
                            className="bg-transparent text-sm text-white outline-none w-full placeholder:text-muted-foreground/40"
                        />
                    </div>
                </div>

                {/* Lista de resultados */}
                <div className="max-h-56 overflow-y-auto">
                    {isLoading ? (
                        <p className="px-4 py-3 text-xs text-muted-foreground text-center animate-pulse">Buscando...</p>
                    ) : parceiros.length === 0 ? (
                        <>
                            <p className="px-4 py-3 text-xs text-muted-foreground text-center">
                                {search ? `Nenhum resultado para "${search}"` : "Nenhum parceiro encontrado"}
                            </p>
                            {/* "Nenhum" aparece só no empty-state para permitir desselecionar */}
                            <button
                                type="button"
                                onClick={() => {
                                    onChange("");
                                    setOpen(false);
                                }}
                                className="w-full text-left px-4 py-2.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors italic"
                            >
                                Nenhum (sem parceiro)
                            </button>
                        </>
                    ) : (
                        parceiros.map((p) => (
                            /* Linha com botão de edição inline */
                            <div
                                key={p.id}
                                className={`flex items-center justify-between px-4 py-2.5 transition-colors cursor-pointer hover:bg-white/5 ${
                                    String(p.id) === value ? "bg-primary/10" : ""
                                }`}
                                onClick={() => {
                                    onChange(String(p.id));
                                    setOpen(false);
                                }}
                            >
                                <span
                                    className={`text-sm flex items-center gap-2 min-w-0 ${String(p.id) === value ? "text-primary" : "text-white"}`}>
                                    <span className={badgeCls(p.tipo_pessoa)}>{p.tipo_pessoa}</span>
                                    <span className="truncate">{p.nome}</span>
                                </span>
                                <button
                                    type="button"
                                    title="Editar parceiro"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onEdit(p);
                                        setOpen(false);
                                    }}
                                    className="ml-2 p-1 shrink-0 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                                >
                                    <Edit2 className="w-3.5 h-3.5"/>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Botão de quick create */}
                <div className="p-2 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => {
                            onCreateNew();
                            setOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-primary/10 rounded-lg font-semibold transition-all"
                    >
                        <Plus className="w-3.5 h-3.5"/>
                        Cadastrar Novo Cliente/Fornecedor
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ─── PlanoContaCombobox ───────────────────────────────────────────────────────
// Campo de busca para Classificação (Plano de Contas), seguindo o mesmo
// padrão visual do ParceiroCombobox acima. Enquanto o termo digitado tem
// menos de 3 caracteres, filtra localmente na lista já carregada (`planoContas`,
// recebida via prop); a partir de 3 caracteres, dispara (com debounce de
// 200ms) uma busca no servidor via GET /plano-contas?search=<termo>. A lista
// é sempre agrupada por categoria (cabeçalho em negrito, subcategorias
// indentadas embaixo).
function PlanoContaCombobox({
                                value,
                                onChange,
                                planoContas,
                                error,
                            }: {
    value: string;
    onChange: (v: string) => void;
    planoContas: PlanoConta[];
    error?: string;
}) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Debounce de 200ms
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 200);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const shouldSearchServer = debouncedSearch.length >= 3;

    const {data: searchResults, isFetching} = useQuery<PlanoConta[]>({
        queryKey: ["plano-contas-search", debouncedSearch],
        queryFn: () => fetchApiData<PlanoConta[]>(`/plano-contas?search=${encodeURIComponent(debouncedSearch)}`),
        enabled: shouldSearchServer,
    });

    // Enquanto não há termo suficiente para acionar o servidor, filtra
    // localmente na lista já carregada (útil para 1-2 caracteres, sem bater
    // no servidor a cada tecla digitada).
    const localFiltered = searchTerm.trim().length === 0
        ? planoContas
        : planoContas.filter((p) => {
            const haystack = `${p.categoria} ${p.subcategoria ?? ""}`.toLowerCase();
            return haystack.includes(searchTerm.trim().toLowerCase());
        });

    const options = shouldSearchServer ? (searchResults ?? []) : localFiltered;
    const grupos = groupPlanoContasPorCategoria(options);
    const selected = planoContas.find((p) => String(p.id) === value);

    const handleOpenChange = (o: boolean) => {
        setOpen(o);
        if (!o) setSearchTerm("");
    };

    const handleSelect = (p: PlanoConta) => {
        onChange(String(p.id));
        setOpen(false);
        setSearchTerm("");
    };

    return (
        <div>
            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={`w-full bg-[#1a1c23] border rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between hover:border-white/20 transition-all ${
                            error ? "border-red-500/60" : "border-white/10"
                        }`}
                    >
                        <span className={selected ? "text-white truncate" : "text-muted-foreground/40"}>
                            {selected
                                ? `${selected.categoria}${selected.subcategoria ? ` — ${selected.subcategoria}` : ""}`
                                : "Indique a categoria contábil..."}
                        </span>
                        <Search className="w-4 h-4 text-muted-foreground shrink-0 ml-2"/>
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    sideOffset={4}
                    className="p-0 bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl"
                    style={{width: "var(--radix-popover-trigger-width)"}}
                >
                    {/* Barra de busca */}
                    <div className="p-3 border-b border-white/5">
                        <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                            <Search className="w-4 h-4 text-muted-foreground shrink-0"/>
                            <input
                                autoFocus
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar categoria ou subcategoria..."
                                className="bg-transparent text-sm text-white outline-none w-full placeholder:text-muted-foreground/40"
                            />
                        </div>
                    </div>

                    {/* Lista de resultados - agrupada por categoria */}
                    <div className="max-h-64 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setOpen(false);
                                setSearchTerm("");
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                            Indique a categoria contábil...
                        </button>

                        {shouldSearchServer && isFetching ? (
                            <p className="px-4 py-3 text-xs text-muted-foreground text-center animate-pulse">Buscando...</p>
                        ) : grupos.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-muted-foreground text-center">Nenhuma categoria
                                encontrada.</p>
                        ) : (
                            grupos.map((grupo) => (
                                <div key={grupo.categoria} className="py-1">
                                    {/* Cabeçalho da categoria - mostrado uma única vez por grupo */}
                                    <p className="px-4 py-1 text-[11px] font-bold text-white uppercase tracking-wide">
                                        {grupo.categoria}
                                    </p>
                                    {grupo.itens.map((item) => {
                                        const isSelected = String(item.id) === value;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleSelect(item)}
                                                className={`w-full text-left pl-8 pr-4 py-1.5 text-xs transition-colors ${
                                                    isSelected
                                                        ? "bg-primary/10 text-primary font-semibold"
                                                        : "text-white/70 hover:bg-white/5"
                                                }`}
                                            >
                                                {item.subcategoria || item.categoria}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>
            {error && <p className="text-[10px] text-destructive mt-1 font-medium">{error}</p>}
        </div>
    );
}

// Sub-componente isolado para campos PIX

type PagamentoPixSectionProps = {
    index: number;
    control: Control<LancamentoModalFormValues>;
    setValue: UseFormSetValue<LancamentoModalFormValues>;
    errors: FieldErrors<LancamentoModalFormValues>;
};

function PagamentoPixSection({index, control, setValue, errors}: PagamentoPixSectionProps) {
    const tipoChave = useWatch({control, name: `pagamentos.${index}.tipo_chave_pix`}) ?? "";
    const itemErr = errors.pagamentos?.[index];

    const innerLbl = "text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block";
    const innerInp = "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
    const innerSel = "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer [&>option]:bg-[#141720]";
    const errCls = "text-[10px] text-destructive mt-1 font-medium";

    return (
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className={innerLbl}>Tipo de Chave *</label>
                <Controller
                    name={`pagamentos.${index}.tipo_chave_pix`}
                    control={control}
                    render={({field}) => (
                        <select
                            value={field.value ?? ""}
                            onChange={(e) => {
                                field.onChange(e.target.value);
                                setValue(`pagamentos.${index}.chave_pix`, "", {shouldDirty: true});
                            }}
                            onBlur={field.onBlur}
                            className={innerSel}
                        >
                            <option value="">Selecione...</option>
                            <option value="cpf">CPF</option>
                            <option value="cnpj">CNPJ</option>
                            <option value="email">E-mail</option>
                            <option value="telefone">Telefone</option>
                            <option value="aleatoria">Chave Aleatória</option>
                        </select>
                    )}
                />
                {itemErr?.tipo_chave_pix && <p className={errCls}>{itemErr.tipo_chave_pix.message}</p>}
            </div>
            <div>
                <label className={innerLbl}>Chave PIX *</label>
                <Controller
                    name={`pagamentos.${index}.chave_pix`}
                    control={control}
                    render={({field}) => (
                        <input
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(maskChavePix(e.target.value, tipoChave))}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            maxLength={pixKeyMaxLength(tipoChave)}
                            placeholder={pixKeyPlaceholder(tipoChave)}
                            className={innerInp}
                        />
                    )}
                />
                {itemErr?.chave_pix && <p className={errCls}>{itemErr.chave_pix.message}</p>}
            </div>
        </div>
    );
}

const pmtCellInputCls =
    "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/30";
const pmtCellSelectCls =
    "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer [&>option]:bg-[#1a1c23]";
const pmtErrCls = "text-[11px] text-destructive mt-1";

type PagamentoPIXRowProps = {
    index: number;
    control: Control<LancamentoModalFormValues>;
    setValue: UseFormSetValue<LancamentoModalFormValues>;
    removePagamento: (index: number) => void;
    errors: FieldErrors<LancamentoModalFormValues>;
};

function PagamentoPIXRow({index, control, setValue, removePagamento, errors}: PagamentoPIXRowProps) {
    const tipoChave = useWatch({control, name: `pagamentos.${index}.tipo_chave_pix`}) ?? "";
    const itemErr = errors.pagamentos?.[index];

    return (
        <tr className="border-t border-white/5">
            <td className="px-3 py-2 align-top">
                <Controller
                    name={`pagamentos.${index}.tipo_chave_pix`}
                    control={control}
                    render={({field}) => (
                        <select
                            value={field.value ?? ""}
                            onChange={(e) => {
                                field.onChange(e.target.value);
                                setValue(`pagamentos.${index}.chave_pix`, "", {shouldDirty: true});
                            }}
                            onBlur={field.onBlur}
                            className={pmtCellSelectCls}
                        >
                            <option value="">Selecione...</option>
                            <option value="cpf">CPF</option>
                            <option value="cnpj">CNPJ</option>
                            <option value="email">E-mail</option>
                            <option value="telefone">Telefone</option>
                            <option value="aleatoria">Chave Aleatória</option>
                        </select>
                    )}
                />
                {itemErr?.tipo_chave_pix && <p className={pmtErrCls}>{itemErr.tipo_chave_pix.message}</p>}
            </td>
            <td className="px-3 py-2 align-top">
                <Controller
                    name={`pagamentos.${index}.chave_pix`}
                    control={control}
                    render={({field}) => (
                        <input
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(maskChavePix(e.target.value, tipoChave))}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            maxLength={pixKeyMaxLength(tipoChave)}
                            placeholder={pixKeyPlaceholder(tipoChave)}
                            className={pmtCellInputCls}
                        />
                    )}
                />
                {itemErr?.chave_pix && <p className={pmtErrCls}>{itemErr.chave_pix.message}</p>}
            </td>
            <td className="px-2 py-2 align-top text-right w-[40px]">
                <button
                    type="button"
                    onClick={() => removePagamento(index)}
                    className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                    title="Remover chave PIX"
                >
                    <Trash2 className="w-3.5 h-3.5"/>
                </button>
            </td>
        </tr>
    );
}

type LancamentoModalProps = {
    onClose: () => void;
    /** Chamado após salvar com sucesso. No modo de criação (sem `editItem`),
     *  recebe o registro criado (com `id`) — útil para quem abriu o modal em
     *  contexto de Conciliação vincular a linha do extrato em seguida. No
     *  modo edição, é chamado sem argumento. */
    onSaved: (created?: { id: number }) => void;
    editItem?: LancamentoEditItem | null;
    /** Pré-preenche o formulário para uma NOVA criação (não é edição).
     *  Ignorado se `editItem` estiver presente. Usado pela tela de
     *  Conciliação ao criar um lançamento a partir de uma linha do extrato
     *  (RN-D3, botão "+"). */
    prefill?: LancamentoPrefill;
};

export function LancamentoModal({onClose, onSaved, editItem, prefill}: LancamentoModalProps) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [riskLevels, setRiskLevels] = useState(BASE_RISK_LEVELS);
    const [showAddTag, setShowAddTag] = useState(false);
    const [newTag, setNewTag] = useState({name: "", level: 1});
    const [nivelRisco, setNivelRisco] = useState(0);
    const [searchParceiro, setSearchParceiro] = useState("");

    // Controla a exibição do modal "Cancelar cadastro?" quando o usuário
    // tenta fechar/cancelar um formulário que já possui alterações não salvas
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    type ParceiroSubModal = { mode: "create" } | { mode: "edit"; data: ParceiroRow };
    const [parceiroSubModal, setParceiroSubModal] = useState<ParceiroSubModal | null>(null);

    // Só é edição de um lançamento já existente quando `editItem` foi passado
    // (criação nova e criação via prefill de conciliação NÃO mostram
    // Desconto/Juros — esses campos só fazem sentido para ajustar um título
    // já lançado, na aba Lançamentos).
    const isEditing = !!editItem;

    // Garante que o `reset()` vindo do fetch completo (`editItemFull`) só
    // sobrescreve o formulário quando uma busca REALMENTE NOVA chegou (não a
    // cada re-render). Guardamos pelo timestamp da busca (`dataUpdatedAt`),
    // não pelo id: guardar só pelo id quebra a reabertura do MESMO
    // lançamento, porque o React Query mostra primeiro o valor antigo em
    // cache (mesmo id) e só depois chega a versão atualizada do servidor -
    // um guard "por id" bloquearia essa segunda atualização e o formulário
    // ficaria preso no Desconto/Juros salvos antes da última edição.
    const hydratedAtRef = useRef<number>(0);

    function buildInitialValues(): LancamentoModalFormValues {
        if (editItem) return getLancamentoModalDefaultValues(editItem);
        if (prefill) return buildDefaultValuesFromPrefill(prefill);
        return getLancamentoModalDefaultValues(null);
    }

    const form = useForm<LancamentoModalFormValues>({
        resolver: zodResolver(lancamentoModalFormSchema),
        defaultValues: buildInitialValues(),
    });

    const {
        register,
        handleSubmit,
        control,
        watch,
        setValue,
        reset,
        formState: {errors, isDirty},
    } = form;

    const {data: editItemFull, dataUpdatedAt} = useQuery<LancamentoEditItem>({
        queryKey: ["lancamento-edit", editItem?.id],
        queryFn: () => fetchApiData<LancamentoEditItem>(`/lancamentos/${editItem!.id}`),
        enabled: !!editItem?.id,
        staleTime: 0,
        // Evita que um refetch automático (ex.: ao voltar o foco pra
        // aba/janela) dispare o reset() abaixo enquanto o usuário edita.
        refetchOnWindowFocus: false,
    });

    const vencimento = watch("vencimento");
    const tipo = watch("tipo");
    const status = watch("status");
    const riscos = watch("riscos");
    const departamento_id = watch("departamento_id");
    const isCP = tipo === "CP";

    // ── Valor Bruto / Desconto / Juros → Valor Atual (calculado em tempo real) ──
    const valorBr = watch("valorBr");
    const descontoBr = watch("descontoBr") ?? "";
    const jurosBr = watch("jurosBr") ?? "";
    const valorAtual = Math.max(
        parseValorBrToNumber(valorBr) - parseValorBrToNumber(descontoBr) + parseValorBrToNumber(jurosBr),
        0
    );

    const {fields: pagamentosFields, append: appendPagamento, remove: removePagamento} = useFieldArray({
        control,
        name: "pagamentos",
    });

    const pagamentosWatched = (watch("pagamentos") ?? []) as Array<{ tipo: string }>;
    const pixEntries = pagamentosFields.map((f, i) => ({f, i})).filter(({i}) => pagamentosWatched[i]?.tipo === "PIX");
    const tedEntries = pagamentosFields.map((f, i) => ({f, i})).filter(({i}) => pagamentosWatched[i]?.tipo === "TED");
    const boletoEntries = pagamentosFields.map((f, i) => ({
        f,
        i
    })).filter(({i}) => pagamentosWatched[i]?.tipo === "Boleto");

    function handlePagamentoTipoChange(index: number, newTipo: PagamentoItemFormValues["tipo"]) {
        setValue(`pagamentos.${index}.tipo`, newTipo, {shouldDirty: true});
        setValue(`pagamentos.${index}.tipo_chave_pix`, "");
        setValue(`pagamentos.${index}.chave_pix`, "");
        setValue(`pagamentos.${index}.banco_codigo`, "");
        setValue(`pagamentos.${index}.banco_nome`, "");
        setValue(`pagamentos.${index}.banco_agencia`, "");
        setValue(`pagamentos.${index}.banco_conta`, "");
        setValue(`pagamentos.${index}.boleto_codigo_barras`, "");
    }

    // Tenta fechar o modal: se o formulário tiver alterações não salvas,
    // exibe a confirmação antes de descartar; caso contrário, fecha direto.
    function handleRequestClose() {
        if (isDirty) {
            setShowCancelConfirm(true);
        } else {
            onClose();
        }
    }

    // Reset ao abrir / mudar item (usa dados da lista - sem pagamentos ainda,
    // ou dados de pré-preenchimento vindos da Conciliação)
    useEffect(() => {
        reset(buildInitialValues());
        // Libera a hidratação do editItemFull para o próximo lançamento
        // aberto (ver useEffect abaixo).
        hydratedAtRef.current = 0;
        setNivelRisco(0);
        setRiskLevels(BASE_RISK_LEVELS);
        setShowAddTag(false);
        setShowCancelConfirm(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editItem, prefill, reset]);

    // Hidrata o formulário com os dados completos (`editItemFull`, incluindo
    // dados_pagamento) assim que uma busca NOVA chegar do servidor — tanto a
    // primeira quanto qualquer uma vinda de uma invalidação explícita (ex.:
    // depois de salvar). Usar `dataUpdatedAt` em vez do id evita dois
    // problemas opostos: (1) reabrir o MESMO lançamento não fica preso nos
    // dados antigos que o React Query mostra primeiro a partir do cache, e
    // (2) um refetch por foco de janela no meio da edição não sobrescreve o
    // que o usuário digitou (isso já está coberto por `refetchOnWindowFocus:
    // false` acima, então aqui só filtramos re-renders sem busca nova).
    useEffect(() => {
        if (editItemFull && dataUpdatedAt !== hydratedAtRef.current) {
            reset(getLancamentoModalDefaultValues(editItemFull));
            hydratedAtRef.current = dataUpdatedAt;
        }
    }, [editItemFull, dataUpdatedAt, reset]);

    // Sincroniza status ao mudar tipo

    useEffect(() => {
        if (tipo === "CR" && status === "pago") setValue("status", "recebido", {shouldValidate: true});
        if (tipo === "CP" && status === "recebido") setValue("status", "pago", {shouldValidate: true});
    }, [tipo, status, setValue]);

    // Sugestão automática de nível de risco

    useEffect(() => {
        if (vencimento && nivelRisco === 0) {
            const vcto = new Date(vencimento + "T00:00:00");
            const diffDays = Math.floor((Date.now() - vcto.getTime()) / 86_400_000);
            let level = 0;
            if (diffDays >= 1 && diffDays <= 15) level = 1;
            else if (diffDays >= 16 && diffDays <= 30) level = 2;
            else if (diffDays >= 31 && diffDays <= 60) level = 3;
            else if (diffDays > 60) level = 4;
            setNivelRisco(level);
        }
    }, [vencimento, nivelRisco]);

    const {data: parceiros = [], isFetching: isFetchingParceiros} = useQuery<ParceiroRow[]>({
        queryKey: ["parceiros-modal", searchParceiro],
        queryFn: () => {
            const qs = new URLSearchParams({page: "1", limit: "20"});
            if (searchParceiro.trim()) qs.set("search", searchParceiro.trim());
            return fetchApiData<ParceiroRow[]>(`/parceiros?${qs.toString()}`);
        },
    });

    const {data: planoContas = []} = useQuery<PlanoConta[]>({
        queryKey: ["plano-contas-modal"],
        queryFn: () => fetchApiData<PlanoConta[]>("/plano-contas"),
    });

    const {data: departamentos = []} = useQuery<Departamento[]>({
        queryKey: ["departamentos-modal"],
        queryFn: () => fetchApiData<Departamento[]>("/departamentos"),
    });

    const {data: centrosCusto = []} = useQuery<CentroCusto[]>({
        queryKey: ["centros-custo-modal"],
        queryFn: () => fetchApiData<CentroCusto[]>("/centros-custos"),
        retry: false,
    });

    // Filtra centros de custo pelo departamento selecionado
    const centrosCustoFiltrado = departamento_id
        ? centrosCusto.filter((cc) => cc.departamento_id === Number(departamento_id))
        : centrosCusto;

    const mutation = useMutation({
        mutationFn: (body: LancamentoApiBody) => {
            if (editItem) return fetchApiData<{ id: number }>(`/lancamentos/${editItem.id}`, {
                method: "PUT",
                body: JSON.stringify(body)
            });
            // AJUSTAR se a API embrulhar a resposta (ex.: { lancamento: { id } }):
            // troque para fetchApiData<{ lancamento: { id: number } }> e ajuste
            // o onSuccess abaixo (resp.lancamento.id em vez de resp.id).
            return fetchApiData<{ id: number }>(`/lancamentos`, {method: "POST", body: JSON.stringify(body)});
        },
        onSuccess: (resp) => {
            void queryClient.invalidateQueries({queryKey: ["lancamentos"]});
            // Invalida o cache do fetch-por-ID também - sem isso, reabrir o
            // MESMO lançamento logo em seguida poderia (dependendo do
            // timing) reutilizar dados desatualizados antes do refetch.
            if (editItem?.id) {
                void queryClient.invalidateQueries({queryKey: ["lancamento-edit", editItem.id]});
            }
            toast({title: "Sucesso", description: editItem ? "Lançamento atualizado." : "Lançamento criado."});
            onSaved(editItem ? undefined : resp);
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro",
                description: e instanceof Error ? e.message : "Não foi possível salvar o lançamento."
            });
        },
    });

    const onSubmit = (values: LancamentoModalFormValues) => mutation.mutate(mapModalFormToApiBody(values));

    // Handlers de risco

    const handleToggleTag = (tag: string) => {
        const exists = riscos.includes(tag);
        setValue("riscos", exists ? riscos.filter((t) => t !== tag) : [...riscos, tag], {
            shouldDirty: true,
            shouldValidate: true
        });
    };

    const handleCreateTag = () => {
        if (!newTag.name) return;
        setRiskLevels((prev) => {
            const lv = prev[newTag.level];
            return {...prev, [newTag.level]: {...lv, tags: [...lv.tags, newTag.name]}};
        });
        setNewTag({name: "", level: newTag.level});
        setShowAddTag(false);
        toast({title: "Tag criada", description: `Tag adicionada ao Nível ${newTag.level}.`});
    };

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
    const innerInputCls =
        "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/30";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
    const innerLabelCls = "text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block";
    const selectCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer [&>option]:bg-[#1a1c23]";
    const innerSelectCls =
        "w-full bg-[#141720] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer [&>option]:bg-[#141720]";
    const errorCls = "text-[10px] text-destructive mt-1 font-medium";

    const selectedRisk = riskLevels[nivelRisco];

    return createPortal(
        <>
            {/* Sub-modal de parceiro - z-[60] sobrepõe o modal de lançamentos */}
            {parceiroSubModal && (
                <NovoParceiroModal
                    key={parceiroSubModal.mode === "edit" ? parceiroSubModal.data.id : "new-parceiro"}
                    initialData={parceiroSubModal.mode === "edit" ? parceiroSubModal.data : null}
                    onClose={() => setParceiroSubModal(null)}
                    onSaved={() => {
                        void queryClient.invalidateQueries({queryKey: ["parceiros-modal"]});
                    }}
                />
            )}

            {/* Confirmação de cancelamento - só aparece se o formulário tiver alterações não salvas */}
            <ConfirmDialog
                open={showCancelConfirm}
                tone="warning"
                title="Cancelar cadastro?"
                description="As informações preenchidas serão perdidas. Deseja realmente cancelar?"
                confirmLabel="Sim, cancelar"
                cancelLabel="Não, continuar"
                onCancel={() => setShowCancelConfirm(false)}
                onConfirm={() => {
                    setShowCancelConfirm(false);
                    onClose();
                }}
            />

            <div
                className="fixed inset-0 z-[65] flex items-start justify-center bg-black/70 backdrop-blur-md p-4 pt-16 overflow-hidden">
                <div
                    className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">

                    {/* Header */}
                    <div
                        className="flex items-center justify-between p-6 border-b border-white/5 bg-[#121417] rounded-t-2xl">
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tighter">
                                {editItem ? "Editar Lançamento" : "Novo Lançamento"}
                            </h2>
                            <p className="text-xs text-muted-foreground">Preencha os dados financeiros detalhados</p>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Valor Atual - fixo durante toda a edição (Bruto - Desconto + Juros) */}
                            {isEditing && (
                                <div className="text-right">
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Valor
                                        Atual</p>
                                    <p className="text-xl font-black text-primary leading-tight">
                                        {valorAtual.toLocaleString("pt-BR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2
                                        })}
                                    </p>
                                </div>
                            )}
                            <button type="button" onClick={handleRequestClose}
                                    className="p-2 hover:bg-white/5 rounded-xl text-muted-foreground hover:text-white transition-all group">
                                <X className="w-5 h-5 group-hover:rotate-90 transition-transform"/>
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 overflow-y-auto">

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                            <div className="space-y-5">

                                {/* Tipo */}
                                <div>
                                    <label className={labelCls}>Tipo de Registro *</label>
                                    <div className="flex gap-3">
                                        {[
                                            {
                                                v: "CP" as const,
                                                label: "Contas a Pagar",
                                                color: "border-orange-500 bg-orange-500/10 text-orange-400"
                                            },
                                            {
                                                v: "CR" as const,
                                                label: "Contas a Receber",
                                                color: "border-teal-500 bg-teal-500/10 text-teal-400"
                                            },
                                        ].map(({v, label, color}) => (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => {
                                                    setValue("tipo", v, {shouldValidate: true, shouldDirty: true});
                                                    // Limpeza síncrona: CR não tem formas de pagamento
                                                    if (v === "CR") setValue("pagamentos", []);
                                                }}
                                                className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                                                    tipo === v ? `${color} shadow-lg` : "border-white/5 bg-white/5 text-muted-foreground hover:border-white/10"
                                                }`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {errors.tipo && <p className={errorCls}>{errors.tipo.message}</p>}
                                </div>

                                {/* Vencimento + Competência */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Data de Vencimento *</label>
                                        <Controller name="vencimento" control={control} render={({field}) => (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <button type="button"
                                                            className={cn(inputCls, "flex items-center justify-between text-left", !field.value && "text-muted-foreground/30")}>
                                                        {field.value ? formatBtn(parseISO(field.value), "dd/MM/yyyy") : "Selecione uma data..."}
                                                        <Calendar className="w-4 h-4 text-muted-foreground"/>
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 border border-white/10"
                                                                align="start">
                                                    <CalendarPicker
                                                        mode="single"
                                                        selected={field.value ? parseISO(field.value) : undefined}
                                                        onSelect={(date) => field.onChange(date ? formatBtn(date, "yyyy-MM-dd") : "")}
                                                        locale={ptBR}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        )}/>
                                        {errors.vencimento && <p className={errorCls}>{errors.vencimento.message}</p>}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Mês de Competência</label>
                                        <Controller name="competencia" control={control} render={({field}) => (
                                            <CompetenciaPicker value={field.value || ""} onChange={field.onChange}/>
                                        )}/>
                                    </div>
                                </div>

                                {/* Cliente/Fornecedor - Combobox com busca */}
                                <div>
                                    <label className={labelCls}>Cliente / Fornecedor</label>
                                    <Controller name="parceiro_id" control={control} render={({field}) => (
                                        <ParceiroCombobox
                                            value={field.value}
                                            onChange={field.onChange}
                                            parceiros={parceiros}
                                            search={searchParceiro}
                                            onSearchChange={setSearchParceiro}
                                            isLoading={isFetchingParceiros}
                                            onEdit={(p) => setParceiroSubModal({mode: "edit", data: p})}
                                            onCreateNew={() => setParceiroSubModal({mode: "create"})}
                                        />
                                    )}/>
                                    {errors.parceiro_id && <p className={errorCls}>{errors.parceiro_id.message}</p>}
                                </div>

                                {/* Descrição */}
                                <div>
                                    <label className={labelCls}>Título / Descrição</label>
                                    <input type="text" {...register("descricao")} className={inputCls}
                                           placeholder="Ex: Manutenção servidor AWS, Aluguel Setembro..."/>
                                </div>

                                {/* Departamento */}
                                <div>
                                    <label className={labelCls}>
                                        <Building2 className="w-3 h-3 inline mr-1"/> Departamento
                                    </label>
                                    <select {...register("departamento_id")} className={selectCls}
                                            onChange={(e) => {
                                                setValue("departamento_id", e.target.value, {shouldDirty: true});
                                                setValue("centro_custo_id", "", {shouldDirty: true});
                                            }}>
                                        <option value="">Selecione o departamento...</option>
                                        {departamentos.map((d) => (
                                            <option key={d.id} value={d.id}>{d.nome}</option>
                                        ))}
                                    </select>
                                    {errors.departamento_id &&
                                        <p className={errorCls}>{errors.departamento_id.message}</p>}
                                </div>
                            </div>

                            {/* ── Coluna direita ──────────────────────────────────────────── */}
                            <div className="space-y-5">

                                {/* Classificação (Plano de Contas) - combobox com busca:
                                    debounce de 200ms, busca no servidor a partir de 3 caracteres,
                                    resultados agrupados por categoria */}
                                <div>
                                    <label className={labelCls}>Classificação (Plano de Contas)</label>
                                    <Controller name="plano_conta_id" control={control} render={({field}) => (
                                        <PlanoContaCombobox
                                            value={field.value}
                                            onChange={field.onChange}
                                            planoContas={planoContas}
                                            error={errors.plano_conta_id?.message}
                                        />
                                    )}/>
                                </div>

                                {/* Valor + Status */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Valor Previsto (R$)</label>
                                        <Controller name="valorBr" control={control} render={({field}) => (
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                value={field.value}
                                                onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                                                onBlur={field.onBlur}
                                                name={field.name}
                                                ref={field.ref}
                                                className={`${inputCls} font-bold text-lg text-primary`}
                                                placeholder="0,00"
                                            />
                                        )}/>
                                        {errors.valorBr && <p className={errorCls}>{errors.valorBr.message}</p>}
                                    </div>
                                    <div>
                                        <label className={labelCls}>Status Atual</label>
                                        <select {...register("status")} className={selectCls}>
                                            <option value="pendente">Pendente</option>
                                            {tipo === "CR"
                                                ? <option value="recebido">Recebido (Liquidado)</option>
                                                : <option value="pago">Pago (Liquidado)</option>
                                            }
                                            <option value="pago_parcial">Pago parcial</option>
                                            <option value="atrasado">Atrasado</option>
                                            <option value="cancelado">Cancelado</option>
                                        </select>
                                        {errors.status && <p className={errorCls}>{errors.status.message}</p>}
                                    </div>
                                </div>

                                {/* Desconto / Juros - só na EDIÇÃO de um lançamento já existente.
                                    Ajustam o valor líquido do título (Valor Atual, exibido no
                                    cabeçalho do modal) sem alterar o Valor Previsto/de face acima. */}
                                {isEditing && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelCls}>Desconto (R$)</label>
                                            <Controller name="descontoBr" control={control} render={({field}) => (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    value={field.value ?? ""}
                                                    onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                                                    onBlur={field.onBlur}
                                                    name={field.name}
                                                    ref={field.ref}
                                                    className={cn(inputCls, "text-green-400")}
                                                    placeholder="0,00"
                                                />
                                            )}/>
                                            {errors.descontoBr && <p className={errorCls}>{errors.descontoBr.message}</p>}
                                        </div>
                                        <div>
                                            <label className={labelCls}>Juros / Acréscimo (R$)</label>
                                            <Controller name="jurosBr" control={control} render={({field}) => (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    value={field.value ?? ""}
                                                    onChange={(e) => field.onChange(formatValorBrInput(e.target.value))}
                                                    onBlur={field.onBlur}
                                                    name={field.name}
                                                    ref={field.ref}
                                                    className={cn(inputCls, "text-red-400")}
                                                    placeholder="0,00"
                                                />
                                            )}/>
                                            {errors.jurosBr && <p className={errorCls}>{errors.jurosBr.message}</p>}
                                        </div>
                                    </div>
                                )}

                                {/* Centro de Custo (filtrado por departamento) */}
                                <div>
                                    <label className={labelCls}>Centro de Custo</label>
                                    <select {...register("centro_custo_id")} className={selectCls}
                                            disabled={centrosCustoFiltrado.length === 0}>
                                        <option value="">
                                            {centrosCustoFiltrado.length === 0
                                                ? departamento_id ? "Nenhum centro de custo neste departamento" : "Selecione um departamento primeiro..."
                                                : "Selecione o centro de custo..."}
                                        </option>
                                        {centrosCustoFiltrado.map((cc) => (
                                            <option key={cc.id} value={cc.id}>{cc.nome}</option>
                                        ))}
                                    </select>
                                    {errors.centro_custo_id &&
                                        <p className={errorCls}>{errors.centro_custo_id.message}</p>}
                                </div>

                                {/* Riscos (apenas CP) */}
                                {isCP && (
                                    <div
                                        className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4 shadow-inner">
                                        <div className="flex items-center justify-between">
                                            <label className={labelCls}>Vulnerabilidade / Nível de Risco</label>
                                            <div
                                                className="flex items-center gap-1 text-[9px] font-black text-primary uppercase">
                                                <Target className="w-3 h-3"/> Sugestão Ativa
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <select
                                                value={nivelRisco}
                                                onChange={(e) => {
                                                    setNivelRisco(parseInt(e.target.value, 10));
                                                    setValue("riscos", [], {shouldDirty: true});
                                                }}
                                                className={`${selectCls} border-white/5 bg-black/40 font-black tracking-tight ${selectedRisk?.color || "text-white/40"} hover:border-white/20`}>
                                                <option value={0}>Sem Risco Definido</option>
                                                {Object.entries(riskLevels).map(([lv, data]) => (
                                                    <option key={lv} value={lv}
                                                            className="bg-[#1a1c23] py-2">{data.label}</option>
                                                ))}
                                            </select>
                                            <div
                                                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground group-hover:text-white transition-colors">
                                                <ChevronRight className="w-4 h-4 rotate-90"/>
                                            </div>
                                        </div>

                                        {selectedRisk && (
                                            <div className="space-y-4 animate-in pt-2">
                                                <div
                                                    className="flex items-center justify-between border-b border-white/5 pb-2">
                                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40">Tags
                                                        de Monitoramento</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAddTag(!showAddTag)}
                                                        className={`text-[9px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all border ${
                                                            showAddTag ? "bg-primary/20 border-primary text-primary" : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                                        }`}>
                                                        <Plus
                                                            className={`w-2.5 h-2.5 transition-transform ${showAddTag ? "rotate-45" : ""}`}/>
                                                        {showAddTag ? "Cancelar" : "Nova Tag"}
                                                    </button>
                                                </div>
                                                {showAddTag && (
                                                    <div
                                                        className="flex gap-2 p-1.5 bg-black/60 rounded-xl border border-primary/20 animate-in ring-1 ring-primary/10">
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            value={newTag.name}
                                                            onChange={(e) => setNewTag((f) => ({
                                                                ...f,
                                                                name: e.target.value.toUpperCase()
                                                            }))}
                                                            placeholder="NOME DA NOVA TAG..."
                                                            className="bg-transparent border-none outline-none text-[10px] font-bold text-white flex-1 px-2"
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    e.preventDefault();
                                                                    handleCreateTag();
                                                                }
                                                            }}
                                                        />
                                                        <button type="button" onClick={handleCreateTag}
                                                                className="text-[10px] font-black bg-primary/20 hover:bg-primary text-primary hover:text-white px-4 py-1.5 rounded-lg transition-all">
                                                            CRIAR
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2">
                                                    {selectedRisk.tags.map((tag) => {
                                                        const selected = riscos.includes(tag);
                                                        return (
                                                            <button
                                                                key={tag}
                                                                type="button"
                                                                onClick={() => handleToggleTag(tag)}
                                                                className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all flex items-center gap-2 group/tag ${
                                                                    selected
                                                                        ? `${selectedRisk.color.replace("text-", "bg-")}/20 ${selectedRisk.color} border-current shadow-lg shadow-current/5`
                                                                        : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-white"
                                                                }`}>
                                                                {tag}
                                                                {selected &&
                                                                    <X className="w-2.5 h-2.5 opacity-50 group-hover/tag:opacity-100"/>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Formas de Pagamento - sub-seções modulares por tipo */}
                        {isCP && (
                            <div className="border border-white/10 rounded-2xl p-5 space-y-3 bg-white/[0.02]">
                                {/* Cabeçalho com botões de adição por tipo */}
                                <div className="flex items-center justify-between flex-wrap gap-y-2">
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-primary"/>
                                        <label className={`${labelCls} mb-0`}>Formas de Pagamento</label>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button type="button"
                                                onClick={() => appendPagamento({...pagamentoItemDefault, tipo: "PIX"})}
                                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold transition-colors">
                                            <Plus className="w-3 h-3"/> PIX
                                        </button>
                                        <button type="button"
                                                onClick={() => appendPagamento({...pagamentoItemDefault, tipo: "TED"})}
                                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold transition-colors">
                                            <Plus className="w-3 h-3"/> TED
                                        </button>
                                        <button type="button"
                                                onClick={() => appendPagamento({
                                                    ...pagamentoItemDefault,
                                                    tipo: "Boleto"
                                                })}
                                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold transition-colors">
                                            <Plus className="w-3 h-3"/> Boleto
                                        </button>
                                    </div>
                                </div>

                                {pagamentosFields.length === 0 ? (
                                    <p className="text-xs text-muted-foreground/50 text-center py-3">
                                        Nenhuma forma de pagamento. Use os botões acima para adicionar PIX, TED ou
                                        Boleto.
                                    </p>
                                ) : (
                                    <div className="space-y-3">

                                        {/* Sub-bloco PIX */}
                                        {pixEntries.length > 0 && (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span
                                                        className="text-xs text-muted-foreground">Tipo de Chave PIX</span>
                                                    <button type="button"
                                                            onClick={() => appendPagamento({
                                                                ...pagamentoItemDefault,
                                                                tipo: "PIX"
                                                            })}
                                                            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold">
                                                        <Plus className="w-3 h-3"/> Adicionar Chave
                                                    </button>
                                                </div>
                                                <div
                                                    className="bg-black/10 border border-white/10 rounded-lg overflow-hidden">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-black/20">
                                                        <tr>
                                                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tipo
                                                                de Chave
                                                            </th>
                                                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Chave</th>
                                                            <th className="px-2 py-2 w-[40px]"/>
                                                        </tr>
                                                        </thead>
                                                        <tbody>
                                                        {pixEntries.map(({f, i}) => (
                                                            <PagamentoPIXRow
                                                                key={f.id}
                                                                index={i}
                                                                control={control}
                                                                setValue={setValue}
                                                                removePagamento={removePagamento}
                                                                errors={errors}
                                                            />
                                                        ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Sub-bloco TED */}
                                        {tedEntries.length > 0 && (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs text-muted-foreground">Contas TED</span>
                                                    <button type="button"
                                                            onClick={() => appendPagamento({
                                                                ...pagamentoItemDefault,
                                                                tipo: "TED"
                                                            })}
                                                            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold">
                                                        <Plus className="w-3 h-3"/> Adicionar Conta TED
                                                    </button>
                                                </div>
                                                <div
                                                    className="bg-black/10 border border-white/10 rounded-lg overflow-hidden">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-black/20">
                                                        <tr>
                                                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Cód.</th>
                                                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Nome
                                                                do Banco
                                                            </th>
                                                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Agência</th>
                                                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Conta</th>
                                                            <th className="px-2 py-2 w-[40px]"/>
                                                        </tr>
                                                        </thead>
                                                        <tbody>
                                                        {tedEntries.map(({f, i}) => {
                                                            const itemErr = errors.pagamentos?.[i];
                                                            return (
                                                                <tr key={f.id} className="border-t border-white/5">
                                                                    <td className="px-3 py-2 align-top w-[90px]">
                                                                        <Controller
                                                                            name={`pagamentos.${i}.banco_codigo`}
                                                                            control={control} render={({field}) => (
                                                                            <input value={field.value ?? ""}
                                                                                   onChange={(e) => field.onChange(mascararCodigoBanco(e.target.value))}
                                                                                   onBlur={field.onBlur} ref={field.ref}
                                                                                   inputMode="numeric"
                                                                                   className={pmtCellInputCls}
                                                                                   placeholder="033"/>
                                                                        )}/>
                                                                        {itemErr?.banco_codigo &&
                                                                            <p className={pmtErrCls}>{itemErr.banco_codigo.message}</p>}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top">
                                                                        <input {...register(`pagamentos.${i}.banco_nome`)}
                                                                               className={pmtCellInputCls}
                                                                               placeholder="Ex: Santander"/>
                                                                        {itemErr?.banco_nome &&
                                                                            <p className={pmtErrCls}>{itemErr.banco_nome.message}</p>}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top w-[110px]">
                                                                        <Controller
                                                                            name={`pagamentos.${i}.banco_agencia`}
                                                                            control={control} render={({field}) => (
                                                                            <input value={field.value ?? ""}
                                                                                   onChange={(e) => field.onChange(mascararAgencia(e.target.value))}
                                                                                   onBlur={field.onBlur} ref={field.ref}
                                                                                   inputMode="numeric"
                                                                                   className={pmtCellInputCls}
                                                                                   placeholder="0000-0"/>
                                                                        )}/>
                                                                        {itemErr?.banco_agencia &&
                                                                            <p className={pmtErrCls}>{itemErr.banco_agencia.message}</p>}
                                                                    </td>
                                                                    <td className="px-3 py-2 align-top w-[120px]">
                                                                        <Controller name={`pagamentos.${i}.banco_conta`}
                                                                                    control={control}
                                                                                    render={({field}) => (
                                                                                        <input value={field.value ?? ""}
                                                                                               onChange={(e) => field.onChange(mascararConta(e.target.value))}
                                                                                               onBlur={field.onBlur}
                                                                                               ref={field.ref}
                                                                                               inputMode="numeric"
                                                                                               className={pmtCellInputCls}
                                                                                               placeholder="00000-0"/>
                                                                                    )}/>
                                                                        {itemErr?.banco_conta &&
                                                                            <p className={pmtErrCls}>{itemErr.banco_conta.message}</p>}
                                                                    </td>
                                                                    <td className="px-2 py-2 align-top text-right w-[40px]">
                                                                        <button type="button"
                                                                                onClick={() => removePagamento(i)}
                                                                                className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                                                                                title="Remover conta TED">
                                                                            <Trash2 className="w-3.5 h-3.5"/>
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Sub-bloco Boleto */}
                                        {boletoEntries.length > 0 && (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs text-muted-foreground">Boletos</span>
                                                    <button type="button"
                                                            onClick={() => appendPagamento({
                                                                ...pagamentoItemDefault,
                                                                tipo: "Boleto"
                                                            })}
                                                            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold">
                                                        <Plus className="w-3 h-3"/> Adicionar Boleto
                                                    </button>
                                                </div>
                                                <div
                                                    className="bg-black/10 border border-white/10 rounded-lg overflow-hidden">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-black/20">
                                                        <tr>
                                                            <th className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Código
                                                                de Barras
                                                            </th>
                                                            <th className="px-2 py-2 w-[40px]"/>
                                                        </tr>
                                                        </thead>
                                                        <tbody>
                                                        {boletoEntries.map(({f, i}) => {
                                                            const itemErr = errors.pagamentos?.[i];
                                                            return (
                                                                <tr key={f.id} className="border-t border-white/5">
                                                                    <td className="px-3 py-2 align-top">
                                                                        <input {...register(`pagamentos.${i}.boleto_codigo_barras`)}
                                                                               className={pmtCellInputCls}
                                                                               placeholder="00000000000000000000000000000000000000000000"/>
                                                                        {itemErr?.boleto_codigo_barras &&
                                                                            <p className={pmtErrCls}>{itemErr.boleto_codigo_barras.message}</p>}
                                                                    </td>
                                                                    <td className="px-2 py-2 align-top text-right w-[40px]">
                                                                        <button type="button"
                                                                                onClick={() => removePagamento(i)}
                                                                                className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors"
                                                                                title="Remover boleto">
                                                                            <Trash2 className="w-3.5 h-3.5"/>
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                )}
                            </div>
                        )}

                        {/* Largura natural, alinhados à direita */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                            <button type="button" onClick={handleRequestClose}
                                    className="px-6 py-2.5 rounded-xl border border-white/10 text-white hover:bg-white/5 text-sm font-bold transition-all">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={mutation.isPending}
                                className="px-8 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-black shadow-xl shadow-primary/25 transition-all disabled:opacity-50 flex items-center gap-2">
                                {mutation.isPending ? <Loader2
                                    className="w-5 h-5 animate-spin"/> : editItem ? "Salvar Alterações" : "Concluir Lançamento"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>,
        document.body,
    );
}