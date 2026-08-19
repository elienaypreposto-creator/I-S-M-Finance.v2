import {useState, useEffect, useRef} from "react";
import {StatusBadge} from "@/components/shared/status-badge";
import {formatCurrency, formatDate, cn} from "@/lib/utils";
import {DateRangePicker} from "@/components/shared/date-range-picker";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Calendar as CalendarPicker} from "@/components/ui/calendar";
import {format as formatBtn, parseISO} from "date-fns";
import {ptBR} from "date-fns/locale";
import {useForm, Controller} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {
    Plus, Search, Filter, Download,
    Loader2, AlertCircle, X, Calendar, Pencil, Trash2,
    ChevronLeft, ChevronRight, CalendarDays,
    Target, Sparkles,
} from "lucide-react";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {
    lancamentoModalFormSchema,
    getLancamentoModalDefaultValues,
    mapModalFormToApiBody,
    type LancamentoModalFormValues,
    type LancamentoEditItem,
    type DadosPagamentoItem,
} from "@/validations/lancamentos.schema";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type Lancamento = {
    id: number;
    tipo: string;
    vencimento: string;
    competencia: string | null;
    conta_id: number | null;
    conta_nome: string | null;
    parceiro_id: number | null;
    parceiro_nome: string | null;
    descricao: string | null;
    valor: number;
    status: string;
    plano_conta_id: number | null;
    plano_conta_nome: string | null;
    riscos?: string[];
    dados_pagamento?: DadosPagamentoItem[] | null;
};

// successResponse({ data, meta: { total, page, limit }, errors })
type ApiResponse = {
    data: Lancamento[];
    meta: { total: number; page: number; limit: number } | null;
    errors: null;
};
type PlanoConta = { id: number; tipo: string; categoria: string; subcategoria: string | null };

type Parceiro = {
    id: number;
    nome: string;
    tipo_pessoa: string;
    departamento_id: number | null;
    centro_custo_id: number | null;
    forma_pagamento_preferencial: string | null;
    chaves_pix?: Array<{ tipo: string; chave: string }> | null;
    dados_bancarios?: Array<{ banco: string; agencia: string; conta: string }> | null;
};

type Departamento = { id: number; nome: string };
type ContaBancaria = { id: number; nome: string };

// ─── Máscara de valor monetário pt-BR ────────────────────────────────────────

function formatarValor(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const num = parseInt(digits, 10) / 100;
    return num.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// Converte uma string mascarada em pt-BR ("1.234,56") para number (1234.56)
function parseValorBr(v?: string): number {
    if (!v) return 0;
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
}

// ─── Bank badge helpers ───────────────────────────────────────────────────────

const BANK_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
    "itaú": {abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)"},
    "itau": {abbr: "ITÁ", color: "#FF6B00", bg: "rgba(255,107,0,0.18)"},
    "bradesco": {abbr: "BRA", color: "#CC0000", bg: "rgba(204,0,0,0.15)"},
    "santander": {abbr: "SAN", color: "#E50001", bg: "rgba(229,0,1,0.15)"},
    "banco do brasil": {abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)"},
    "bb rende": {abbr: "BB", color: "#FACC15", bg: "rgba(250,204,21,0.15)"},
    "caixa economica": {abbr: "CEF", color: "#1E78C8", bg: "rgba(30,120,200,0.18)"},
    "nubank": {abbr: "NU", color: "#820AD1", bg: "rgba(130,10,209,0.18)"},
    "inter": {abbr: "INT", color: "#FF6600", bg: "rgba(255,102,0,0.15)"},
    "sicoob": {abbr: "SCB", color: "#00703C", bg: "rgba(0,112,60,0.15)"},
    "sicredi": {abbr: "SIC", color: "#009D4F", bg: "rgba(0,157,79,0.15)"},
    "banpará": {abbr: "BNP", color: "#0055A6", bg: "rgba(0,85,166,0.15)"},
    "brb": {abbr: "BRB", color: "#1A6B3A", bg: "rgba(26,107,58,0.18)"},
    "c6": {abbr: "C6", color: "#272D3B", bg: "rgba(120,125,135,0.3)"},
    "mercado pago": {abbr: "MP", color: "#00BCFF", bg: "rgba(0,188,255,0.15)"},
    "pagseguro": {abbr: "PAG", color: "#009B3A", bg: "rgba(0,155,58,0.15)"},
    "stone": {abbr: "STN", color: "#00A868", bg: "rgba(0,168,104,0.15)"},
    "conta empréstimo": {abbr: "EMPR", color: "#F59E0B", bg: "rgba(245,158,11,0.15)"},
    "conta aplicação": {abbr: "APLI", color: "#6366F1", bg: "rgba(99,102,241,0.15)"},
    "a identificar": {abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)"},
    "--": {abbr: "?", color: "#6B7280", bg: "rgba(107,114,128,0.15)"},
};

function getBankBadge(contaNome: string | null) {
    if (!contaNome) return BANK_MAP["a identificar"];
    const lower = contaNome.toLowerCase();
    for (const [key, val] of Object.entries(BANK_MAP)) {
        if (lower.includes(key)) return val;
    }
    const firstWord = contaNome.trim().split(" ")[0].toUpperCase().slice(0, 3);
    return {abbr: firstWord, color: "#94A3B8", bg: "rgba(148,163,184,0.15)"};
}

// ─── Tags de risco ────────────────────────────────────────────────────────────

const RISCO_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
    "Multas e Juros": {
        label: "Multas e Juros",
        color: "#FBBF24",
        bg: "rgba(251,191,36,0.15)",
        border: "rgba(251,191,36,0.35)"
    },
    "Perda de Desconto": {
        label: "Perda de Desconto",
        color: "#FBBF24",
        bg: "rgba(251,191,36,0.15)",
        border: "rgba(251,191,36,0.35)"
    },
    "Restrição de Crédito": {
        label: "Restrição de Crédito",
        color: "#FBBF24",
        bg: "rgba(251,191,36,0.15)",
        border: "rgba(251,191,36,0.35)"
    },
    "Corte de Serviço": {
        label: "Corte de Serviço",
        color: "#FB923C",
        bg: "rgba(251,146,60,0.15)",
        border: "rgba(251,146,60,0.35)"
    },
    "Suspensão de Fornecimento": {
        label: "Suspensão de Fornecimento",
        color: "#FB923C",
        bg: "rgba(251,146,60,0.15)",
        border: "rgba(251,146,60,0.35)"
    },
    "Negativação": {
        label: "Negativação",
        color: "#FB923C",
        bg: "rgba(251,146,60,0.15)",
        border: "rgba(251,146,60,0.35)"
    },
    "Perda de Benefício Fiscal": {
        label: "Perda de Benefício Fiscal",
        color: "#FB923C",
        bg: "rgba(251,146,60,0.15)",
        border: "rgba(251,146,60,0.35)"
    },
    "Protesto": {label: "Protesto", color: "#F87171", bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.35)"},
    "Ação Judicial": {
        label: "Ação Judicial",
        color: "#F87171",
        bg: "rgba(248,113,113,0.15)",
        border: "rgba(248,113,113,0.35)"
    },
    "Dívida Ativa": {
        label: "Dívida Ativa",
        color: "#F87171",
        bg: "rgba(248,113,113,0.15)",
        border: "rgba(248,113,113,0.35)"
    },
    "Quebra de Contrato": {
        label: "Quebra de Contrato",
        color: "#F87171",
        bg: "rgba(248,113,113,0.15)",
        border: "rgba(248,113,113,0.35)"
    },
    "Bloqueio de Contas (Sisbajud)": {
        label: "Bloqueio (Sisbajud)",
        color: "#C084FC",
        bg: "rgba(192,132,252,0.15)",
        border: "rgba(192,132,252,0.35)"
    },
    "Penhora de Bens": {
        label: "Penhora de Bens",
        color: "#C084FC",
        bg: "rgba(192,132,252,0.15)",
        border: "rgba(192,132,252,0.35)"
    },
    "Pedido de Falência": {
        label: "Pedido de Falência",
        color: "#C084FC",
        bg: "rgba(192,132,252,0.15)",
        border: "rgba(192,132,252,0.35)"
    },
    "Impedimento de Certidão": {
        label: "Impedimento de Certidão",
        color: "#C084FC",
        bg: "rgba(192,132,252,0.15)",
        border: "rgba(192,132,252,0.35)"
    },
};

function getRiscoStyle(tag: string) {
    return RISCO_STYLE[tag] ?? {
        label: tag,
        color: "#94A3B8",
        bg: "rgba(148,163,184,0.15)",
        border: "rgba(148,163,184,0.3)"
    };
}

// ─── CompetenciaPicker ────────────────────────────────────────────────────────

function CompetenciaPicker({
                               value,
                               onChange,
                               error,
                           }: {
    value: string;
    onChange: (v: string) => void;
    error?: string;
}) {
    const [open, setOpen] = useState(false);
    const months = [
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];
    const [currentYear, setCurrentYear] = useState(
        value && value.includes("/") ? parseInt(value.split("/")[1]) : new Date().getFullYear()
    );
    const selectedMonthIdx =
        value && value.includes("/") ? parseInt(value.split("/")[0]) - 1 : -1;

    return (
        <div>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "w-full bg-[#1a1c23] border rounded-xl px-4 py-2.5 text-sm text-white flex items-center justify-between hover:border-white/20 transition-all",
                            error ? "border-red-500/60" : "border-white/10"
                        )}
                    >
                        {value || "Selecione..."}
                        <CalendarDays className="w-4 h-4 text-muted-foreground"/>
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    className="bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl p-4 w-72"
                >
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
                                        const monthStr = (i + 1).toString().padStart(2, "0");
                                        onChange(`${monthStr}/${currentYear}`);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "px-3 py-2.5 rounded-lg text-xs font-medium transition-all",
                                        selectedMonthIdx === i && value.includes(currentYear.toString())
                                            ? "bg-primary text-white shadow-lg shadow-primary/30"
                                            : "text-white/60 hover:bg-white/5 hover:text-white"
                                    )}>
                                {m}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-between mt-4 pt-3 border-t border-white/5 gap-2">
                        <button type="button" onClick={() => {
                            onChange("");
                            setOpen(false);
                        }}
                                className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-xs font-bold transition-all">
                            Limpar
                        </button>
                        <button type="button" onClick={() => setOpen(false)}
                                className="px-4 py-1.5 bg-success hover:bg-success/90 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-success/20">
                            Confirmar
                        </button>
                    </div>
                </PopoverContent>
            </Popover>
            {error && <p className="mt-1 text-[10px] text-red-400 font-semibold">{error}</p>}
        </div>
    );
}


function groupPlanoContasPorCategoria(itens: PlanoConta[]): { categoria: string; itens: PlanoConta[] }[] {
    const map = new Map<string, PlanoConta[]>();
    for (const item of itens) {
        const lista = map.get(item.categoria) ?? [];
        lista.push(item);
        map.set(item.categoria, lista);
    }
    return Array.from(map.entries()).map(([categoria, grupoItens]) => ({categoria, itens: grupoItens}));
}

function PlanoContaCombobox({
                                value,
                                onChange,
                                error,
                                planoContas,
                            }: {
    value: string;
    onChange: (v: string) => void;
    error?: string;
    planoContas: PlanoConta[];
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
        queryFn: async () => {
            try {
                const res = await fetch(`${API_URL}/plano-contas?search=${encodeURIComponent(debouncedSearch)}`);
                if (!res.ok) return [];
                const json = await res.json();
                return Array.isArray(json) ? json : (json.data ?? []);
            } catch {
                return [];
            }
        },
        enabled: shouldSearchServer,
    });

    const localFiltered = searchTerm.trim().length === 0
        ? planoContas
        : planoContas.filter((p) => {
            const haystack = `${p.categoria} ${p.subcategoria ?? ""}`.toLowerCase();
            return haystack.includes(searchTerm.trim().toLowerCase());
        });

    const options = shouldSearchServer ? (searchResults ?? []) : localFiltered;
    const grupos = groupPlanoContasPorCategoria(options);
    const selected = planoContas.find((p) => String(p.id) === value);

    const handleSelect = (p: PlanoConta) => {
        onChange(String(p.id));
        setOpen(false);
        setSearchTerm("");
    };

    return (
        <div>
            <Popover open={open} onOpenChange={(next) => {
                setOpen(next);
                if (!next) setSearchTerm("");
            }}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            inputCls(!!error),
                            "flex items-center justify-between text-left font-normal",
                            !selected && "text-muted-foreground/30"
                        )}
                    >
            <span className="truncate">
              {selected
                  ? `${selected.categoria}${selected.subcategoria ? ` — ${selected.subcategoria}` : ""}`
                  : "Indique a categoria contábil..."}
            </span>
                        <Search className="w-4 h-4 text-muted-foreground shrink-0"/>
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    className="bg-[#1a1c23] border border-white/10 rounded-xl shadow-2xl p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
                >
                    <div className="p-2 border-b border-white/5">
                        <div
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/30 border border-white/10 focus-within:border-primary/50 transition-all">
                            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0"/>
                            <input
                                autoFocus
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar categoria ou subcategoria..."
                                className="bg-transparent border-none outline-none text-xs text-white w-full placeholder:text-muted-foreground/40"
                            />
                        </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">
                        <button
                            type="button"
                            onClick={() => {
                                onChange("");
                                setOpen(false);
                                setSearchTerm("");
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs text-muted-foreground hover:bg-white/5 transition-colors border-b border-white/5 mb-1"
                        >
                            Indique a categoria contábil...
                        </button>

                        {shouldSearchServer && isFetching ? (
                            <div
                                className="px-4 py-6 flex items-center justify-center gap-2 text-muted-foreground text-xs">
                                <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                                Buscando...
                            </div>
                        ) : grupos.length === 0 ? (
                            <div className="px-4 py-6 text-center text-muted-foreground text-xs">
                                Nenhuma categoria encontrada.
                            </div>
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
                                                className={cn(
                                                    "w-full text-left pl-8 pr-4 py-1.5 text-xs transition-colors",
                                                    isSelected
                                                        ? "bg-primary/10 text-primary font-semibold"
                                                        : "text-white/70 hover:bg-white/5"
                                                )}
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
            {error && <p className="mt-1 text-[10px] text-red-400 font-semibold">{error}</p>}
        </div>
    );
}

// ─── Risk levels ──────────────────────────────────────────────────────────────

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

// ─── Shared style constants ───────────────────────────────────────────────────

const inputCls = (hasError?: boolean) =>
    cn(
        "w-full bg-[#1a1c23] border rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-muted-foreground/30",
        hasError
            ? "border-red-500/60 focus:border-red-500"
            : "border-white/10 focus:border-primary/50"
    );

const selectCls = (hasError?: boolean) =>
    cn(
        "w-full bg-[#1a1c23] border rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all appearance-none cursor-pointer",
        hasError
            ? "border-red-500/60 focus:border-red-500"
            : "border-white/10 focus:border-primary/50"
    );

const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";

function FieldError({message}: { message?: string }) {
    if (!message) return null;
    return (
        <p className="mt-1 text-[10px] text-red-400 font-semibold flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-red-400"/>
            {message}
        </p>
    );
}

// ─── Métodos de pagamento disponíveis ────────────────────────────────────────

const FORMAS_PAGAMENTO = ["PIX", "Boleto", "TED", "DOC", "Cheque"] as const;

// ─── LancamentoModal ──────────────────────────────────────────────────────────

function LancamentoModal({
                             onClose,
                             onSaved,
                             editItem,
                         }: {
    onClose: () => void;
    onSaved: () => void;
    editItem?: LancamentoEditItem | null;
}) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [riskLevels, setRiskLevels] = useState(BASE_RISK_LEVELS);
    const [showAddTag, setShowAddTag] = useState(false);
    const [newTag, setNewTag] = useState({name: "", level: 1});
    const riskSuggestedRef = useRef(false);
    const [autoFilled, setAutoFilled] = useState(false);

    const {register, handleSubmit, control, watch, setValue, formState: {errors, isSubmitting}} =
        useForm<LancamentoModalFormValues>({
            resolver: zodResolver(lancamentoModalFormSchema),
            defaultValues: getLancamentoModalDefaultValues(editItem),
        });

    const tipo = watch("tipo");
    const vencimento = watch("vencimento");
    const nivelRisco = (watch as any)("nivelRisco") ?? 0;
    const riscos = watch("riscos") ?? [];
    const parceiro_id = watch("parceiro_id");
    const formaPagamento = watch("forma_pagamento") ?? "";
    const isCP = tipo === "CP";

    // ── Desconto / Acréscimo (juros) ─────────────────────────────────────────
    // Campos "extras" no mesmo padrão do nivelRisco, até serem formalizados no schema Zod.
    const descontoBr = (watch as any)("descontoBr") ?? "";
    const acrescimoBr = (watch as any)("acrescimoBr") ?? "";
    const valorBrutoNum = parseValorBr(watch("valorBr"));
    const valorFinal = Math.max(
        valorBrutoNum - parseValorBr(descontoBr) + parseValorBr(acrescimoBr),
        0
    );

    useEffect(() => {
        if (editItem && (editItem as any).desconto) {
            setValue(
                "descontoBr" as any,
                Number((editItem as any).desconto).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })
            );
        }
        if (editItem && (editItem as any).acrescimo) {
            setValue(
                "acrescimoBr" as any,
                Number((editItem as any).acrescimo).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editItem]);

    useEffect(() => {
        if (!editItem?.riscos?.length) return;
        for (const [lvStr, lvData] of Object.entries(BASE_RISK_LEVELS)) {
            if (editItem.riscos.some((r) => lvData.tags.includes(r))) {
                setValue("nivelRisco" as any, Number(lvStr));
                riskSuggestedRef.current = true; // inibe a auto-sugestão por vencimento
                return;
            }
        }
    }, [editItem, setValue]);

    // ── Auto-suggest nível de risco por vencimento ──────────────────────────
    useEffect(() => {
        if (vencimento && !riskSuggestedRef.current) {
            const vcto = new Date(vencimento + "T00:00:00");
            const hoje = new Date();
            const diffDays = Math.floor((hoje.getTime() - vcto.getTime()) / (1000 * 60 * 60 * 24));
            let level = 0;
            if (diffDays >= 1 && diffDays <= 15) level = 1;
            else if (diffDays >= 16 && diffDays <= 30) level = 2;
            else if (diffDays >= 31 && diffDays <= 60) level = 3;
            else if (diffDays > 60) level = 4;
            if (level > 0) {
                setValue("nivelRisco" as any, level);
                riskSuggestedRef.current = true;
            }
        }
    }, [vencimento, setValue]);

    // ── Queries ──────────────────────────────────────────────────────────────

    const {data: parceiros = []} = useQuery<Parceiro[]>({
        queryKey: ["parceiros-modal"],
        queryFn: async () => {
            try {
                const res = await fetch(`${API_URL}/parceiros?all=true`);
                if (!res.ok) return [];
                const json = await res.json();
                return Array.isArray(json) ? json : (json.data ?? []);
            } catch {
                return [];
            }
        },
    });

    const {data: planoContas = []} = useQuery<PlanoConta[]>({
        queryKey: ["plano-contas-modal"],
        queryFn: async () => {
            try {
                const res = await fetch(`${API_URL}/plano-contas`);
                if (!res.ok) return [];
                const json = await res.json();
                return Array.isArray(json) ? json : (json.data ?? []);
            } catch {
                return [];
            }
        },
    });

    const {data: departamentos = []} = useQuery<Departamento[]>({
        queryKey: ["departamentos-modal"],
        queryFn: async () => {
            try {
                const res = await fetch(`${API_URL}/departamentos`);
                if (!res.ok) return [];
                const json = await res.json();
                return Array.isArray(json) ? json : (json.data ?? []);
            } catch {
                return [];
            }
        },
    });

    const {data: contasBancarias = []} = useQuery<ContaBancaria[]>({
        queryKey: ["contas-bancarias-modal"],
        queryFn: async () => {
            try {
                const res = await fetch(`${API_URL}/contas-bancarias`);
                if (!res.ok) return [];
                const json = await res.json();
                return Array.isArray(json) ? json : (json.data ?? []);
            } catch {
                return [];
            }
        },
    });

    // ── Auto-fill ao selecionar parceiro ─────────────────────────────────────
    useEffect(() => {
        if (!parceiro_id) {
            setAutoFilled(false);
            return;
        }

        const parceiro = parceiros.find((p) => String(p.id) === parceiro_id);
        if (!parceiro) return;

        let didFill = false;

        // Forma de pagamento preferencial
        const fp = parceiro.forma_pagamento_preferencial;
        if (fp && FORMAS_PAGAMENTO.includes(fp as any)) {
            setValue("forma_pagamento", fp);
            didFill = true;

            // Chave PIX
            if (fp === "PIX") {
                const pix = parceiro.chaves_pix;
                if (Array.isArray(pix) && pix.length > 0) {
                    setValue("chave_pix", pix[0].chave);
                    didFill = true;
                }
            }

            // Dados bancários (DOC/TED)
            if (fp === "DOC" || fp === "TED") {
                const banco = parceiro.dados_bancarios;
                if (Array.isArray(banco) && banco.length > 0) {
                    setValue("banco_nome", banco[0].banco || "");
                    setValue("banco_agencia", banco[0].agencia || "");
                    setValue("banco_conta", banco[0].conta || "");
                    didFill = true;
                }
            }
        }

        // Departamento padrão do parceiro
        if (parceiro.departamento_id != null) {
            setValue("departamento_id", String(parceiro.departamento_id));
            didFill = true;
        }

        setAutoFilled(didFill);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parceiro_id, parceiros]);

    // ── Limpar campos de pagamento ao trocar forma ────────────────────────────
    useEffect(() => {
        if (formaPagamento !== "PIX") {
            setValue("chave_pix", "");
        }
        if (formaPagamento !== "DOC" && formaPagamento !== "TED") {
            setValue("banco_agencia", "");
            setValue("banco_conta", "");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formaPagamento]);

    // ── Mutation ──────────────────────────────────────────────────────────────

    const mutation = useMutation({
        mutationFn: async (payload: any) => {
            const method = editItem ? "PUT" : "POST";
            const url = editItem ? `${API_URL}/lancamentos/${editItem.id}` : `${API_URL}/lancamentos`;
            const res = await fetch(url, {
                method,
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Erro ao salvar lançamento");
            return res.json();
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["lancamentos"]});
            toast({title: "Sucesso", description: editItem ? "Lançamento atualizado." : "Lançamento criado."});
            onSaved();
        },
        onError: (e: Error) =>
            toast({variant: "destructive", title: "Erro", description: e.message}),
    });

    const onSubmit = (data: LancamentoModalFormValues) => {
        const payload: any = mapModalFormToApiBody(data);

        const valorBruto = parseValorBr((data as any).valorBr);
        const desconto = parseValorBr((data as any).descontoBr);
        const acrescimo = parseValorBr((data as any).acrescimoBr);
        const valorFinalCalc = Math.max(valorBruto - desconto + acrescimo, 0);

        if (isNaN(valorBruto) || valorBruto <= 0) {
            toast({
                variant: "destructive",
                title: "Valor inválido",
                description: "Verifique o campo de valor antes de continuar."
            });
            return;
        }

        // O valor final (já com desconto/acréscimo aplicados) é o que é persistido
        // como valor do lançamento — igual ao comportamento do sistema de referência.
        payload.valor_bruto = valorBruto;
        payload.desconto = desconto;
        payload.acrescimo = acrescimo;
        payload.valor = valorFinalCalc;

        mutation.mutate(payload);
    };

    const handleToggleTag = (tag: string) => {
        setValue("riscos", riscos.includes(tag) ? riscos.filter((t) => t !== tag) : [...riscos, tag]);
    };

    const handleCreateTag = () => {
        if (!newTag.name.trim()) return;
        setRiskLevels((prev) => {
            const lv = prev[newTag.level];
            return {...prev, [newTag.level]: {...lv, tags: [...lv.tags, newTag.name]}};
        });
        setNewTag({name: "", level: newTag.level});
        setShowAddTag(false);
        toast({title: "Tag criada", description: `Tag adicionada ao Nível ${newTag.level}.`});
    };

    const selectedRisk = riskLevels[nivelRisco];
    const [vctoOpen, setVctoOpen] = useState(false);

    // ── UI helper: badge da forma de pagamento ────────────────────────────────
    const FP_STYLE: Record<string, { color: string; bg: string }> = {
        PIX: {color: "#4ADE80", bg: "rgba(74,222,128,0.12)"},
        TED: {color: "#60A5FA", bg: "rgba(96,165,250,0.12)"},
        DOC: {color: "#A78BFA", bg: "rgba(167,139,250,0.12)"},
        Boleto: {color: "#FBBF24", bg: "rgba(251,191,36,0.12)"},
        Cheque: {color: "#94A3B8", bg: "rgba(148,163,184,0.12)"},
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4 overflow-hidden">
            <div
                className="bg-[#121417] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-in">

                {/* Header */}
                <div
                    className="flex items-center justify-between p-6 border-b border-white/5 bg-[#121417] rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-black text-white uppercase tracking-tighter">
                            {editItem ? "Editar Lançamento" : "Novo Lançamento"}
                        </h2>
                        <p className="text-xs text-muted-foreground">Preencha os dados financeiros detalhados</p>
                    </div>
                    <button onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-xl text-muted-foreground hover:text-white transition-all group">
                        <X className="w-5 h-5 group-hover:rotate-90 transition-transform"/>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 overflow-y-auto" noValidate>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                        {/* ── Left: Dados Básicos ── */}
                        <div className="space-y-5">

                            {/* Tipo */}
                            <div>
                                <label className={labelCls}>Tipo de Registro *</label>
                                <Controller name="tipo" control={control} render={({field}) => (
                                    <div className="flex gap-3">
                                        {[
                                            {
                                                v: "CP",
                                                label: "Contas a Pagar",
                                                color: "border-orange-500 bg-orange-500/10 text-orange-400"
                                            },
                                            {
                                                v: "CR",
                                                label: "Contas a Receber",
                                                color: "border-teal-500 bg-teal-500/10 text-teal-400"
                                            },
                                        ].map(({v, label, color}) => (
                                            <button type="button" key={v} onClick={() => field.onChange(v)}
                                                    className={cn(
                                                        "flex-1 py-3 rounded-xl text-sm font-bold border transition-all",
                                                        field.value === v ? `${color} shadow-lg` : "border-white/5 bg-white/5 text-muted-foreground hover:border-white/10"
                                                    )}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                )}/>
                            </div>

                            {/* Vencimento + Competência */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Data de Vencimento *</label>
                                    <Controller name="vencimento" control={control} render={({field}) => (
                                        <Popover open={vctoOpen} onOpenChange={setVctoOpen}>
                                            <PopoverTrigger asChild>
                                                <button type="button"
                                                        className={cn(inputCls(!!errors.vencimento), "flex items-center justify-between text-left font-normal", !field.value && "text-muted-foreground/30")}>
                                                    {field.value ? formatBtn(parseISO(field.value), "dd/MM/yyyy") : "Selecione uma data..."}
                                                    <Calendar className="w-4 h-4 text-muted-foreground"/>
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 border border-white/10" align="start">
                                                <CalendarPicker mode="single"
                                                                selected={field.value ? parseISO(field.value) : undefined}
                                                                onSelect={(date) => {
                                                                    field.onChange(date ? formatBtn(date, "yyyy-MM-dd") : "");
                                                                    setVctoOpen(false);
                                                                }}
                                                                locale={ptBR} initialFocus/>
                                            </PopoverContent>
                                        </Popover>
                                    )}/>
                                    <FieldError message={errors.vencimento?.message}/>
                                </div>
                                <div>
                                    <label className={labelCls}>Mês de Competência</label>
                                    <Controller name="competencia" control={control} render={({field}) => (
                                        <CompetenciaPicker value={field.value ?? ""} onChange={field.onChange}
                                                           error={errors.competencia?.message}/>
                                    )}/>
                                </div>
                            </div>

                            {/* Parceiro */}
                            <div>
                                <label className={labelCls}>Parceiro Comercial</label>
                                <Controller name="parceiro_id" control={control} render={({field}) => (
                                    <select
                                        value={field.value}
                                        onChange={(e) => {
                                            field.onChange(e.target.value);
                                            setAutoFilled(false);
                                        }}
                                        className={selectCls(!!errors.parceiro_id)}
                                    >
                                        <option value="">Selecione quem paga/recebe...</option>
                                        {parceiros.map((p: Parceiro) => (
                                            <option key={p.id} value={p.id}>{p.nome}</option>
                                        ))}
                                    </select>
                                )}/>
                                <FieldError message={errors.parceiro_id?.message}/>

                                {/* Banner de auto-fill */}
                                {autoFilled && (
                                    <div
                                        className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold animate-in fade-in">
                                        <Sparkles className="w-3 h-3 shrink-0"/>
                                        Dados do parceiro preenchidos automaticamente
                                    </div>
                                )}
                            </div>

                            {/* Conta Bancária associa o lançamento à conta de origem/destino */}
                            <div>
                                <label className={labelCls}>Conta Bancária</label>
                                <select {...register("conta_id")} className={selectCls(!!errors.conta_id)}>
                                    <option value="">Nenhuma conta selecionada...</option>
                                    {contasBancarias.map((c: ContaBancaria) => (
                                        <option key={c.id} value={c.id}>{c.nome}</option>
                                    ))}
                                </select>
                                <FieldError message={errors.conta_id?.message}/>
                            </div>

                            {/* Descrição */}
                            <div>
                                <label className={labelCls}>Título / Descrição</label>
                                <input type="text" {...register("descricao")} className={inputCls(!!errors.descricao)}
                                       placeholder="Ex: Manutenção servidor AWS, Aluguel Setembro..."/>
                                <FieldError message={errors.descricao?.message}/>
                            </div>

                            {/* ── Forma de Pagamento ── */}
                            <div>
                                <label className={labelCls}>Forma de Pagamento</label>
                                <Controller name="forma_pagamento" control={control} render={({field}) => (
                                    <div className="flex gap-2 flex-wrap">
                                        {/* Opção "nenhuma" */}
                                        <button
                                            type="button"
                                            onClick={() => field.onChange("")}
                                            className={cn(
                                                "px-3 py-2 rounded-lg text-[11px] font-bold border transition-all",
                                                !field.value
                                                    ? "border-white/30 bg-white/10 text-white"
                                                    : "border-white/5 bg-white/5 text-muted-foreground hover:border-white/10"
                                            )}
                                        >
                                            —
                                        </button>
                                        {FORMAS_PAGAMENTO.map((fp) => {
                                            const s = FP_STYLE[fp] ?? {color: "#94A3B8", bg: "rgba(148,163,184,0.12)"};
                                            const active = field.value === fp;
                                            return (
                                                <button
                                                    key={fp}
                                                    type="button"
                                                    onClick={() => field.onChange(fp)}
                                                    className={cn(
                                                        "px-4 py-2 rounded-lg text-[11px] font-black border transition-all",
                                                        active ? "shadow-md" : "border-white/5 bg-white/5 text-muted-foreground hover:border-white/10 hover:text-white"
                                                    )}
                                                    style={active ? {
                                                        color: s.color,
                                                        background: s.bg,
                                                        borderColor: `${s.color}50`
                                                    } : {}}
                                                >
                                                    {fp}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}/>

                                {/* ── Campo condicional: PIX ── */}
                                {formaPagamento === "PIX" && (
                                    <div
                                        className="mt-3 p-4 bg-black/30 border border-white/8 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span
                                                className="text-[9px] font-black text-green-400/80 uppercase tracking-widest">Chave PIX</span>
                                        </div>
                                        <div>
                                            <input
                                                {...register("chave_pix")}
                                                className={inputCls(!!errors.chave_pix)}
                                                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                                            />
                                            <FieldError message={errors.chave_pix?.message}/>
                                        </div>
                                    </div>
                                )}

                                {/* ── Campo condicional: DOC / TED ── */}
                                {(formaPagamento === "DOC" || formaPagamento === "TED") && (
                                    <div
                                        className="mt-3 p-4 bg-black/30 border border-white/8 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1">
                                        <span
                                            className="text-[9px] font-black text-blue-400/80 uppercase tracking-widest block">Dados Bancários</span>

                                        <div>
                                            <label className={labelCls}>Nome do Banco</label>
                                            <input
                                                {...register("banco_nome")}
                                                className={inputCls(false)}
                                                placeholder="Ex: Itaú, Bradesco, Banco do Brasil..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className={labelCls}>Agência *</label>
                                                <input
                                                    {...register("banco_agencia")}
                                                    className={inputCls(!!errors.banco_agencia)}
                                                    placeholder="0000"
                                                />
                                                <FieldError message={errors.banco_agencia?.message}/>
                                            </div>
                                            <div>
                                                <label className={labelCls}>Conta *</label>
                                                <input
                                                    {...register("banco_conta")}
                                                    className={inputCls(!!errors.banco_conta)}
                                                    placeholder="00000-0"
                                                />
                                                <FieldError message={errors.banco_conta?.message}/>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Informativo: Boleto / Cheque ── */}
                                {(formaPagamento === "Boleto" || formaPagamento === "Cheque") && (
                                    <div
                                        className="mt-3 px-4 py-3 bg-black/20 border border-white/5 rounded-xl animate-in fade-in">
                                        <p className="text-[10px] text-muted-foreground">
                                            {formaPagamento === "Boleto"
                                                ? "Pagamento via boleto bancário — nenhum dado adicional necessário."
                                                : "Pagamento via cheque — nenhum dado adicional necessário."}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Right: Categoria e Valores ── */}
                        <div className="space-y-5">

                            {/* Plano de Contas */}
                            <div>
                                <label className={labelCls}>Classificação (Plano de Contas)</label>
                                <Controller name="plano_conta_id" control={control} render={({field}) => (
                                    <PlanoContaCombobox
                                        value={field.value}
                                        onChange={field.onChange}
                                        error={errors.plano_conta_id?.message}
                                        planoContas={Array.isArray(planoContas) ? planoContas : []}
                                    />
                                )}/>
                            </div>

                            {/* Departamento */}
                            <div>
                                <label className={labelCls}>Centro de Custo / Departamento</label>
                                <select {...register("departamento_id")}
                                        className={selectCls(!!errors.departamento_id)}>
                                    <option value="">Selecione o departamento...</option>
                                    {departamentos.map((d: Departamento) => (
                                        <option key={d.id} value={d.id}>{d.nome}</option>
                                    ))}
                                </select>
                                <FieldError message={(errors as any).departamento_id?.message}/>
                            </div>

                            {/* Valor Bruto + Status */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Valor Bruto (R$) *</label>
                                    <Controller name="valorBr" control={control} render={({field}) => (
                                        <input type="text" inputMode="decimal" value={field.value}
                                               onChange={(e) => field.onChange(formatarValor(e.target.value))}
                                               className={cn(inputCls(!!errors.valorBr), "font-bold text-lg text-primary")}
                                               placeholder="0,00"/>
                                    )}/>
                                    <FieldError message={errors.valorBr?.message}/>
                                </div>
                                <div>
                                    <label className={labelCls}>Status Atual *</label>
                                    <select {...register("status")} className={selectCls(!!errors.status)}>
                                        <option value="pendente">Pendente</option>
                                        {tipo === "CR" ? (
                                            <option value="recebido">Recebido (Pago)</option>
                                        ) : (
                                            <option value="pago">Pago (Liquidado)</option>
                                        )}
                                        <option value="pago_parcial">Pago parcial</option>
                                        <option value="atrasado">Atrasado</option>
                                        <option value="cancelado">Cancelado</option>
                                    </select>
                                    <FieldError message={errors.status?.message}/>
                                </div>
                            </div>

                            {/* Desconto / Acréscimo (Juros) */}
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Desconto (R$)</label>
                                        <Controller name={"descontoBr" as any} control={control} render={({field}) => (
                                            <input type="text" inputMode="decimal" value={field.value ?? ""}
                                                   onChange={(e) => field.onChange(formatarValor(e.target.value))}
                                                   className={cn(inputCls(false), "text-green-400")}
                                                   placeholder="0,00"/>
                                        )}/>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Acréscimo / Juros (R$)</label>
                                        <Controller name={"acrescimoBr" as any} control={control} render={({field}) => (
                                            <input type="text" inputMode="decimal" value={field.value ?? ""}
                                                   onChange={(e) => field.onChange(formatarValor(e.target.value))}
                                                   className={cn(inputCls(false), "text-red-400")}
                                                   placeholder="0,00"/>
                                        )}/>
                                    </div>
                                </div>

                                {(descontoBr || acrescimoBr) && (
                                    <div
                                        className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 animate-in fade-in">
                                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Valor Final</span>
                                        <span className="text-base font-black text-primary">
                                            {valorFinal.toLocaleString("pt-BR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            })}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* ── Risco Cascata - apenas CP ── */}
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

                                    <Controller name={"nivelRisco" as any} control={control} render={({field}) => (
                                        <div className="relative group">
                                            <select
                                                value={String(field.value ?? 0)}
                                                onChange={(e) => {
                                                    const parsed = parseInt(e.target.value, 10);
                                                    const next = isNaN(parsed) ? 0 : parsed;
                                                    field.onChange(next);
                                                    setValue("riscos", []);
                                                    if (next === 0) riskSuggestedRef.current = false;
                                                }}
                                                className={cn(selectCls(), "border-white/5 bg-black/40 font-black tracking-tight hover:border-white/20", selectedRisk?.color || "text-white/40")}>
                                                <option value="0">Sem Risco Definido</option>
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
                                    )}/>

                                    {selectedRisk && (
                                        <div className="space-y-4 animate-in pt-2">
                                            <div
                                                className="flex items-center justify-between border-b border-white/5 pb-2">
                                                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40">
                                                    Tags de Monitoramento
                                                </p>
                                                <button type="button" onClick={() => setShowAddTag(!showAddTag)}
                                                        className={cn(
                                                            "text-[9px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all border",
                                                            showAddTag
                                                                ? "bg-primary/20 border-primary text-primary"
                                                                : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                                        )}>
                                                    <Plus
                                                        className={cn("w-2.5 h-2.5 transition-transform", showAddTag && "rotate-45")}/>
                                                    {showAddTag ? "Cancelar" : "Nova Tag"}
                                                </button>
                                            </div>

                                            {showAddTag && (
                                                <div
                                                    className="flex gap-2 p-1.5 bg-black/60 rounded-xl border border-primary/20 animate-in ring-1 ring-primary/10">
                                                    <input type="text" autoFocus value={newTag.name}
                                                           onChange={(e) => setNewTag((f) => ({
                                                               ...f,
                                                               name: e.target.value.toUpperCase()
                                                           }))}
                                                           placeholder="NOME DA NOVA TAG..."
                                                           className="bg-transparent border-none outline-none text-[10px] font-bold text-white flex-1 px-2"
                                                           onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateTag())}/>
                                                    <button onClick={handleCreateTag} type="button"
                                                            className="text-[10px] font-black bg-primary/20 hover:bg-primary text-primary hover:text-white px-4 py-1.5 rounded-lg transition-all">
                                                        CRIAR
                                                    </button>
                                                </div>
                                            )}

                                            <div
                                                className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                                {selectedRisk.tags.map((tag) => {
                                                    const selected = riscos.includes(tag);
                                                    return (
                                                        <button key={tag} type="button"
                                                                onClick={() => handleToggleTag(tag)}
                                                                className={cn(
                                                                    "px-4 py-2 rounded-xl text-[10px] font-black border transition-all flex items-center gap-2 group/tag",
                                                                    selected
                                                                        ? `${selectedRisk.color.replace("text-", "bg-")}/20 ${selectedRisk.color} border-current shadow-lg shadow-current/5`
                                                                        : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-white"
                                                                )}>
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

                    {/* Footer */}
                    <div
                        className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-6 border-t border-white/5">
                        <button type="button" onClick={onClose}
                                className="w-full sm:w-auto px-10 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 text-sm font-bold transition-all">
                            Cancelar
                        </button>
                        <button type="submit" disabled={mutation.isPending || isSubmitting}
                                className="w-full sm:w-auto px-10 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-black shadow-xl shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {mutation.isPending || isSubmitting ? (
                                <Loader2 className="w-5 h-5 animate-spin"/>
                            ) : editItem ? "Salvar Alterações" : "Concluir Lançamento"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Lancamentos page ─────────────────────────────────────────────────────────

export default function Lancamentos() {
    const [activeTab, setActiveTab] = useState("todos");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [dateStart, setDateStart] = useState("");
    const [dateEnd, setDateEnd] = useState("");
    const [filtroStatus, setFiltroStatus] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<LancamentoEditItem | null>(null);
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const limit = 25;

    const handleSearchChange = (value: string) => {
        setSearch(value);
        clearTimeout((window as any)._searchTimeout);
        (window as any)._searchTimeout = setTimeout(() => {
            setDebouncedSearch(value);
            setPage(1);
        }, 400);
    };

    const tipo = activeTab === "cr" ? "CR" : activeTab === "cp" ? "CP" : undefined;

    const {data, isLoading, isError} = useQuery<ApiResponse>({
        queryKey: ["lancamentos", tipo, debouncedSearch, page, dateStart, dateEnd, filtroStatus],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (tipo) params.set("tipo", tipo);
            if (debouncedSearch) params.set("search", debouncedSearch);
            if (dateStart) params.set("data_inicio", dateStart);
            if (dateEnd) params.set("data_fim", dateEnd);
            if (filtroStatus) params.set("status", filtroStatus);
            params.set("page", String(page));
            params.set("limit", String(limit));
            const res = await fetch(`${API_URL}/lancamentos?${params}`);
            if (!res.ok) throw new Error(`Falha ao buscar lançamentos: ${res.status}`);
            return res.json();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`${API_URL}/lancamentos/${id}`, {method: "DELETE"});
            if (!res.ok) throw new Error("Falha ao excluir");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["lancamentos"]});
            toast({title: "Excluído", description: "Lançamento removido com sucesso."});
        },
        onError: (e: Error) =>
            toast({variant: "destructive", title: "Erro", description: e.message}),
    });

    const handleDelete = async (l: Lancamento) => {
        const label = l.descricao ? `"${l.descricao.toUpperCase()}"` : `lançamento #${l.id}`;
        const ok = await confirm({
            title: `Excluir ${label}?`,
            description: "Esta ação não pode ser desfeita. O lançamento será removido permanentemente.",
            confirmLabel: "Excluir",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(l.id);
    };

    const handleEdit = async (l: Lancamento) => {
        const label = l.descricao ? `"${l.descricao.toUpperCase()}"` : `lançamento #${l.id}`;
        const ok = await confirm({
            title: `Editar ${label}?`,
            description: "Você será direcionado ao formulário de edição deste lançamento.",
            confirmLabel: "Editar",
            cancelLabel: "Cancelar",
            variant: "default",
        });
        if (ok) setEditItem(l as unknown as LancamentoEditItem);
    };

    const lancamentos = data?.data ?? [];
    const total = data?.meta?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    const TABS = [
        {key: "todos", label: "Todos"},
        {key: "cr", label: "C.R"},
        {key: "cp", label: "C.P"},
    ];

    return (
        <div className="flex flex-col gap-2 h-full">
            <ConfirmDialog {...ConfirmDialogProps} />
            {(modalOpen || editItem) && (
                <LancamentoModal
                    onClose={() => {
                        setModalOpen(false);
                        setEditItem(null);
                    }}
                    onSaved={() => {
                        setModalOpen(false);
                        setEditItem(null);
                        queryClient.invalidateQueries({queryKey: ["lancamentos"]});
                    }}
                    editItem={editItem}
                />
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-1 py-2 gap-4">
                <div>
                    <h1 className="text-base font-bold text-white leading-tight">Lançamentos Financeiros</h1>
                    <p className="text-xs text-muted-foreground">Gerencie suas contas a pagar e a receber</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium transition-all">
                        <Download className="w-3.5 h-3.5"/>
                        <span className="hidden xs:inline">Exportar</span>
                    </button>
                    <button onClick={() => setModalOpen(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-all shadow-md shadow-primary/30">
                        <Plus className="w-3.5 h-3.5"/>
                        Novo Lançamento
                    </button>
                </div>
            </div>

            {/* Panel */}
            <div className="glass-panel rounded-2xl flex flex-col overflow-hidden flex-1 min-h-0">
                {/* Toolbar */}
                <div
                    className="px-4 py-2.5 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-black/10">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/5 w-full md:w-auto">
                            {TABS.map(({key, label}) => (
                                <button key={key} onClick={() => {
                                    setActiveTab(key);
                                    setPage(1);
                                }}
                                        className={cn(
                                            "flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-colors",
                                            activeTab === key
                                                ? key === "cr" ? "bg-teal-500/20 text-teal-300 shadow-sm"
                                                    : key === "cp" ? "bg-orange-500/20 text-orange-300 shadow-sm"
                                                        : "bg-white/10 text-white shadow-sm"
                                                : "text-muted-foreground hover:text-white"
                                        )}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        <select value={filtroStatus} onChange={(e) => {
                            setFiltroStatus(e.target.value);
                            setPage(1);
                        }}
                                className="bg-[#1a1c23] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-primary/50 cursor-pointer">
                            <option value="">Status</option>
                            <option value="pendente">Pendente</option>
                            <option value="pago">Pago</option>
                            <option value="recebido">Recebido</option>
                            <option value="pago_parcial">Pago parcial</option>
                            <option value="atrasado">Atrasado</option>
                            <option value="cancelado">Cancelado</option>
                        </select>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <DateRangePicker startDate={dateStart} endDate={dateEnd}
                                             className="w-full md:w-auto justify-start"
                                             onChange={(start: string, end: string) => {
                                                 setDateStart(start);
                                                 setDateEnd(end);
                                                 setPage(1);
                                             }}/>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full xl:w-auto">
                        <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/20 border border-white/5 focus-within:border-primary/50 transition-all flex-1 xl:flex-none">
                            <Search className="w-3.5 h-3.5 text-muted-foreground"/>
                            <input type="text" placeholder="Buscar por descrição..." value={search}
                                   onChange={(e) => handleSearchChange(e.target.value)}
                                   className="bg-transparent border-none outline-none text-xs w-full xl:w-52 placeholder:text-muted-foreground text-white"/>
                        </div>
                        <button
                            className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-muted-foreground hover:text-white">
                            <Filter className="w-4 h-4"/>
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto flex-1 responsive-table-container">
                    <table className="w-full text-left text-xs whitespace-nowrap table-to-cards">
                        <thead className="bg-black/20 text-muted-foreground border-b border-white/5">
                        <tr>
                            <th className="px-3 py-3 font-semibold w-14 text-center">Tipo</th>
                            <th className="px-3 py-3 font-semibold">Vencimento</th>
                            <th className="px-3 py-3 font-semibold">Banco</th>
                            <th className="px-3 py-3 font-semibold">Parceiro</th>
                            <th className="px-3 py-3 font-semibold">Descrição</th>
                            <th className="px-3 py-3 font-semibold">Categoria</th>
                            <th className="px-3 py-3 font-semibold">Riscos</th>
                            <th className="px-3 py-3 font-semibold text-right">R$ Valor</th>
                            <th className="px-3 py-3 font-semibold text-center">Status</th>
                            <th className="px-3 py-3 font-semibold text-right w-16">Ações</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                        {isLoading ? (
                            <tr>
                                <td colSpan={10} className="py-16 text-center">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <Loader2 className="w-7 h-7 animate-spin text-primary"/>
                                        <span className="text-xs">Carregando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : isError ? (
                            <tr>
                                <td colSpan={10} className="py-16 text-center">
                                    <div className="flex flex-col items-center gap-2 text-destructive">
                                        <AlertCircle className="w-7 h-7"/>
                                        <span className="text-xs">Erro ao carregar dados. Verifique se o servidor está ativo.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : lancamentos.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="py-16 text-center text-muted-foreground text-xs">
                                    Nenhum lançamento encontrado.
                                </td>
                            </tr>
                        ) : lancamentos.map((l) => {
                            const bank = getBankBadge(l.conta_nome);
                            const isCR = l.tipo === "CR";
                            const riscos = l.riscos ?? [];

                            return (
                                <tr key={l.id} className="hover:bg-white/[0.04] transition-colors group">
                                    <td className="px-3 py-2.5 text-center" data-label="Tipo">
                      <span className={cn(
                          "inline-block text-[10px] font-black px-2 py-0.5 rounded",
                          isCR
                              ? "bg-teal-500/15 text-teal-300 border border-teal-500/25"
                              : "bg-orange-500/15 text-orange-300 border border-orange-500/25"
                      )}>
                        {l.tipo}
                      </span>
                                    </td>
                                    <td className="px-3 py-2.5" data-label="Vencimento">
                                        <div className="flex items-center gap-1.5 text-white/80 font-medium">
                                            <Calendar className="w-3 h-3 text-muted-foreground shrink-0"/>
                                            {formatDate(l.vencimento)}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5" data-label="Banco">
                      <span title={l.conta_nome || "A identificar"}
                            className="inline-flex items-center justify-center w-9 h-6 rounded text-[10px] font-black leading-none cursor-default"
                            style={{color: bank.color, background: bank.bg, border: `1px solid ${bank.color}40`}}>
                        {bank.abbr}
                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 font-medium text-white max-w-[160px] truncate"
                                        title={l.parceiro_nome || ""} data-label="Parceiro">
                                        {l.parceiro_nome || <span className="text-white/30 italic">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-white/60 max-w-[200px] truncate"
                                        title={l.descricao || ""} data-label="Descrição">
                                        {l.descricao || "—"}
                                    </td>
                                    <td className="px-3 py-2.5 max-w-[140px] truncate" data-label="Categoria">
                                        {l.plano_conta_nome
                                            ? <span
                                                className="text-[10px] bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-white/70">{l.plano_conta_nome}</span>
                                            : <span className="text-white/25 italic text-[10px]">Sem cat.</span>}
                                    </td>
                                    <td className="px-3 py-2.5" data-label="Riscos">
                                        {riscos.length === 0 ? (
                                            <span className="text-white/20 italic text-[10px]">—</span>
                                        ) : (
                                            <div className="flex gap-1 flex-wrap">
                                                {riscos.map((r) => {
                                                    const s = getRiscoStyle(r);
                                                    return (
                                                        <span key={r} title={s.label}
                                                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                              style={{
                                                                  color: s.color,
                                                                  background: s.bg,
                                                                  border: `1px solid ${s.border}`
                                                              }}>
                                {s.label}
                              </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </td>
                                    <td className={cn("px-3 py-2.5 text-right font-bold", isCR ? "text-teal-300" : "text-white/90")}
                                        data-label="Valor">
                                        {isCR ? "" : "- "}{formatCurrency(l.valor).replace("R$", "").trim()}
                                    </td>
                                    <td className="px-3 py-2.5 text-center" data-label="Status">
                                        <StatusBadge status={l.status}/>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center justify-end gap-2">
                                            <button onClick={() => handleEdit(l)}
                                                    className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors touch-target-exempt"
                                                    title="Editar">
                                                <Pencil className="w-4 h-4"/>
                                            </button>
                                            <button onClick={() => handleDelete(l)}
                                                    className="p-2 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors touch-target-exempt"
                                                    title="Excluir">
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div
                    className="px-4 py-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground bg-black/10">
          <span className="order-2 sm:order-1">
            {isLoading ? "..." : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total.toLocaleString("pt-BR")} registros`}
          </span>
                    <div className="flex gap-1 order-1 sm:order-2 w-full sm:w-auto justify-center">
                        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                                className="flex-1 sm:flex-none px-3 py-2 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                            ‹
                        </button>
                        {Array.from({length: Math.min(totalPages, 5)}, (_, i) => {
                            const start = Math.max(1, page - 2);
                            const pageNum = start + i;
                            if (pageNum > totalPages) return null;
                            return (
                                <button key={pageNum} onClick={() => setPage(pageNum)}
                                        className={cn("flex-1 sm:flex-none px-3 py-2 rounded font-medium transition-colors", pageNum === page ? "bg-primary text-white" : "hover:bg-white/5")}>
                                    {pageNum}
                                </button>
                            );
                        })}
                        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                                className="flex-1 sm:flex-none px-3 py-2 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                            ›
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}