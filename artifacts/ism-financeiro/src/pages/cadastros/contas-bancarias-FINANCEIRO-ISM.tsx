import {useEffect, useMemo, useState, useRef} from "react";
import {useForm, Controller} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {PageHeader} from "@/components/shared/page-header";
import {
    Plus,
    Landmark,
    Eye,
    EyeOff,
    CheckCircle,
    AlertCircle,
    X,
    Pencil,
    Lock,
    Unlock,
    Loader2,
    Trash2,
    PiggyBank,
    PackageOpen,
    CheckCircle2,
    Search,
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
    ChevronDown,
    Info,
} from "lucide-react";
import {formatCurrency, cn} from "@/lib/utils";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {
    contaBancariaFormSchema,
    type ContaBancariaFormValues,
    TIPOS_CONTA,
} from "@/validations/cadastros.schema";
import {
    apiValorToValorBr,
    brMoneyDisplayToApiString,
    formatValorBrInput,
} from "@/validations/lancamentos.schema";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ContaBancaria = {
    id: number;
    nome: string;
    banco: string | null;
    agencia: string | null;
    conta: string | null;
    tipo: string;
    status: string;
    cor: string;
    saldo_inicial: number | string;
    saldo_atual: number | string;
    data_inicio?: string | null;
};

type StepStatus = "pending" | "active" | "completed";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toCents(v: string | number): number {
    if (typeof v === "number") return Math.round(v * 100);
    const str = String(v).replace(",", ".");
    return Math.round(Number(str) * 100);
}

function maskAgencia(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    return digits;
}

function maskConta(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 1) return digits;
    return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

function normalizeSearch(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

// Data máxima permitida (hoje), formatada dd/mm/aaaa
function getTodayIso(): string {
    return new Date().toISOString().split("T")[0];
}

function formatDateBr(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

// ─── Tipos de conta disponíveis (derivados do schema canônico) ────────────────
const TIPO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    "Conta Corrente": Landmark,
    "Conta Movimento": PackageOpen,
    "Conta Poupança": PiggyBank,
};

// Ordem de exibição no Passo 1 (Corrente -> Poupança -> Movimento)
const ACCOUNT_TYPES = (
    ["Conta Corrente", "Conta Poupança", "Conta Movimento"] as const
).map((value) => ({
    value,
    label: value === "Conta Movimento" ? "Conta Movimento (Caixinha)" : value,
    Icon: TIPO_ICONS[value] ?? Landmark,
}));

// Único tipo que não exige banco/agência/conta (renderiza apenas o campo Nome)
const TIPO_SEM_BANCO = "Conta Movimento" as const;

// Lista de bancos brasileiros mais comuns (código FEBRABAN + nome + sigla/cor
// de fallback + caminho do logo local em /public/logos-bancos). Os arquivos
// devem ser colocados em public/logos-bancos/<codigo>.svg (ou .png). Se o
// arquivo não existir ou falhar ao carregar, o componente BancoLogo cai
// automaticamente no badge colorido com a sigla.
const BANCOS_BR = [
    {
        codigo: "001",
        nome: "Banco do Brasil",
        sigla: "BB",
        cor: "#0033A0",
        texto: "#FFEF00",
        logo: "/logos-bancos/001.svg"
    },
    {codigo: "033", nome: "Santander", sigla: "SA", cor: "#EC0000", texto: "#FFFFFF", logo: "/logos-bancos/033.svg"},
    {
        codigo: "104",
        nome: "Caixa Econômica Federal",
        sigla: "CX",
        cor: "#0070AD",
        texto: "#FF6600",
        logo: "/logos-bancos/104.svg"
    },
    {codigo: "237", nome: "Bradesco", sigla: "BR", cor: "#CC092F", texto: "#FFFFFF", logo: "/logos-bancos/237.svg"},
    {
        codigo: "341",
        nome: "Itaú Unibanco",
        sigla: "IT",
        cor: "#EC7000",
        texto: "#003087",
        logo: "/logos-bancos/341.svg"
    },
    {codigo: "260", nome: "Nubank", sigla: "NU", cor: "#8A05BE", texto: "#FFFFFF", logo: "/logos-bancos/260.svg"},
    {codigo: "077", nome: "Banco Inter", sigla: "IN", cor: "#FF7A00", texto: "#FFFFFF", logo: "/logos-bancos/077.svg"},
    {
        codigo: "290",
        nome: "PagBank (PagSeguro)",
        sigla: "PB",
        cor: "#00C650",
        texto: "#FFFFFF",
        logo: "/logos-bancos/290.svg"
    },
    {codigo: "323", nome: "Mercado Pago", sigla: "MP", cor: "#00AAEF", texto: "#FFFFFF", logo: "/logos-bancos/323.svg"},
    {codigo: "336", nome: "Banco C6", sigla: "C6", cor: "#000000", texto: "#FFC800", logo: "/logos-bancos/336.svg"},
    {codigo: "756", nome: "Sicoob", sigla: "SI", cor: "#003641", texto: "#7DB92B", logo: "/logos-bancos/756.svg"},
    {codigo: "748", nome: "Sicredi", sigla: "SC", cor: "#6DC122", texto: "#00331E", logo: "/logos-bancos/748.svg"},
    {codigo: "422", nome: "Banco Safra", sigla: "SF", cor: "#00205B", texto: "#FFFFFF", logo: "/logos-bancos/422.svg"},
    {
        codigo: "070",
        nome: "BRB - Banco de Brasília",
        sigla: "BRB",
        cor: "#00833E",
        texto: "#FFC629",
        logo: "/logos-bancos/070.svg"
    },
    {
        codigo: "212",
        nome: "Banco Original",
        sigla: "OR",
        cor: "#00D084",
        texto: "#0B3D2E",
        logo: "/logos-bancos/212.svg"
    },
    {
        codigo: "655",
        nome: "Banco Votorantim (BV)",
        sigla: "BV",
        cor: "#FF5F00",
        texto: "#FFFFFF",
        logo: "/logos-bancos/655.svg"
    },
    {
        codigo: "208",
        nome: "Banco BTG Pactual",
        sigla: "BTG",
        cor: "#0A0A0A",
        texto: "#FFFFFF",
        logo: "/logos-bancos/208.svg"
    },
    {
        codigo: "197",
        nome: "Stone Pagamentos",
        sigla: "ST",
        cor: "#00A868",
        texto: "#FFFFFF",
        logo: "/logos-bancos/197.svg"
    },
    {codigo: "380", nome: "PicPay", sigla: "PP", cor: "#21C25E", texto: "#FFFFFF", logo: "/logos-bancos/380.svg"},
    {
        codigo: "102",
        nome: "XP Investimentos",
        sigla: "XP",
        cor: "#000000",
        texto: "#FFCE00",
        logo: "/logos-bancos/102.svg"
    },
] as const;

const ITEMS_PER_PAGE = 8;

// Paleta de cores do passo "Cor de Identificação": ao invés de mostrar as 20
// cores dos bancos (que têm muita repetição de família — 6 tons de verde, 4
// de azul, 3 de preto, 3 de laranja etc.), agrupamos cada cor pelo matiz (hue)
// e mostramos só 1 representante por família (a primeira que aparecer, na
// ordem de BANCOS_BR). O azul neutro #3BA8DC é sempre incluído à parte, pois
// representa "sem banco vinculado" e não uma marca específica.
function hexParaHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            default:
                h = (r - g) / d + 4;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
}

// Classifica a cor em "fatias" de 20° de matiz (mais granular que famílias
// largas tipo "verde"/"azul"), para permitir mais cores distintas na paleta
// sem cair em tons quase idênticos. Preto/cinza é tratado à parte por
// saturação/luminosidade, já que hue não é significativo nesses casos.
function familiaDeCor(hex: string): string {
    const [hue, s, l] = hexParaHsl(hex);
    if (s < 15 || l < 8) return "preto-cinza";
    return String(Math.floor(hue / 20) * 20);
}

// Cores extras 
const CORES_EXTRAS: { nome: string; cor: string }[] = [
    {nome: "Amarelo", cor: "#EAB308"},
    {nome: "Amarelo-oliva", cor: "#ACC91D"},
    {nome: "Verde-grama", cor: "#33931F"},
    {nome: "Verde-esmeralda escuro", cor: "#257E34"},
    {nome: "Teal", cor: "#0D9488"},
    {nome: "Cinza-ardósia", cor: "#64748B"},
    {nome: "Índigo", cor: "#4F46E5"},
    {nome: "Violeta", cor: "#7C3AED"},
    {nome: "Magenta-violeta", cor: "#BD28A4"},
    {nome: "Vinho/Carmesim", cor: "#BE123C"},
    {nome: "Rosa/Magenta", cor: "#EC4899"},
];

const COLOR_PALETTE: string[] = (() => {
    const familiasVistas = new Set<string>();
    const paleta: string[] = ["#3BA8DC"]; // cor padrão neutra (sem banco vinculado)
    for (const b of BANCOS_BR) {
        const familia = familiaDeCor(b.cor);
        if (!familiasVistas.has(familia)) {
            familiasVistas.add(familia);
            paleta.push(b.cor);
        }
    }
    for (const extra of CORES_EXTRAS) {
        const familia = familiaDeCor(extra.cor);
        if (!familiasVistas.has(familia)) {
            familiasVistas.add(familia);
            paleta.push(extra.cor);
        }
    }
    return paleta;
})();

// ─── Logo do Banco (logo real via arquivo local em /public/logos-bancos
function BancoLogo({
                       banco,
                       size = 32,
                   }: {
    banco?: string | null;
    size?: number;
}) {
    const found = BANCOS_BR.find((b) => b.nome === banco);
    const [imgFailed, setImgFailed] = useState(false);

    // Reseta o estado de erro sempre que o banco muda (ex: ao trocar seleção)
    useEffect(() => {
        setImgFailed(false);
    }, [banco]);

    if (!found) {
        return (
            <div
                className="rounded-lg flex items-center justify-center bg-white/10 text-muted-foreground flex-shrink-0"
                style={{width: size, height: size}}
            >
                <Landmark style={{width: size * 0.55, height: size * 0.55}}/>
            </div>
        );
    }

    // Fallback: badge colorido com a sigla, caso o logo local não exista/falhe
    if (imgFailed) {
        return (
            <div
                className="rounded-lg flex items-center justify-center font-black flex-shrink-0"
                style={{
                    width: size,
                    height: size,
                    backgroundColor: found.cor,
                    color: found.texto,
                    fontSize: size * 0.3,
                    letterSpacing: "-0.02em",
                }}
                title={found.nome}
            >
                {found.sigla}
            </div>
        );
    }

    return (
        <div
            className="rounded-lg overflow-hidden bg-white flex items-center justify-center flex-shrink-0"
            style={{width: size, height: size}}
            title={found.nome}
        >
            <img
                src={found.logo}
                alt={found.nome}
                className="w-full h-full object-contain p-0.5"
                onError={() => setImgFailed(true)}
                loading="lazy"
            />
        </div>
    );
}

// ─── Step Panel (accordion) ───────────────────────────────────────────────────
function StepPanel({
                       stepNumber,
                       title,
                       status,
                       summary,
                       onEdit,
                       children,
                   }: {
    stepNumber: number;
    title: string;
    status: StepStatus;
    summary?: string;
    onEdit?: () => void;
    children?: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "border rounded-xl overflow-hidden transition-all",
                status === "active" ? "border-white/20" : "border-white/10",
                status === "pending" && "opacity-40 pointer-events-none",
            )}
        >
            {/* Step header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03]">
                <div className="flex items-center gap-3">
                    {status === "completed" ? (
                        <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0"/>
                    ) : (
                        <div
                            className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                                status === "active"
                                    ? "border-primary text-primary"
                                    : "border-white/20 text-white/20",
                            )}
                        >
                            {stepNumber}
                        </div>
                    )}
                    <div>
                        <p
                            className={cn(
                                "text-sm font-semibold leading-tight",
                                status === "pending" ? "text-white/40" : "text-white",
                            )}
                        >
                            {title}
                            {status !== "pending" && (
                                <span className="text-destructive ml-0.5">*</span>
                            )}
                        </p>
                        {status === "completed" && summary && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                {summary}
                            </p>
                        )}
                    </div>
                </div>
                {status === "completed" && onEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                        Editar
                    </button>
                )}
            </div>

            {/* Step body — visível apenas quando ativo */}
            {status === "active" && (
                <div className="p-5 border-t border-white/5 space-y-4">{children}</div>
            )}
        </div>
    );
}

// ─── Campo de texto padrão ─────────────────────────────────────────────────
function Field({
                   label,
                   required,
                   error,
                   hint,
                   children,
               }: {
    label: string;
    required?: boolean;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                {label}
                {required && <span className="text-destructive ml-0.5">*</span>}
            </label>
            {children}
            {hint && !error && (
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">{hint}</p>
            )}
            {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
        </div>
    );
}

const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors";
const monoInputClass = `${inputClass} font-mono`;
const selectClass = `${inputClass} appearance-none pr-10 cursor-pointer`;

const continueBtnClass =
    "mt-1 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary";

// ─── Select de Banco (dropdown customizado, tema escuro, com logo real) ───
function BancoSelect({
                         value,
                         onChange,
                     }: {
    value: string;
    onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedBanco = BANCOS_BR.find((b) => b.nome === value);

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(selectClass, "flex items-center gap-2.5")}
            >
                <BancoLogo banco={value} size={22}/>
                <span
                    className={cn(
                        "truncate",
                        value ? "text-white" : "text-muted-foreground",
                    )}
                >
          {selectedBanco
              ? `${selectedBanco.codigo} - ${selectedBanco.nome}`
              : "Selecione"}
        </span>
            </button>
            <ChevronDown
                className={cn(
                    "absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none transition-transform",
                    open && "rotate-180",
                )}
            />

            {open && (
                <div
                    className="absolute z-50 mt-1.5 w-full max-h-64 overflow-y-auto bg-[#1a1b23] border border-white/10 rounded-xl shadow-2xl py-1.5">
                    {BANCOS_BR.map((b) => (
                        <button
                            key={b.codigo}
                            type="button"
                            onClick={() => {
                                onChange(b.nome);
                                setOpen(false);
                            }}
                            className={cn(
                                "w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm transition-colors",
                                value === b.nome
                                    ? "bg-primary/15 text-primary font-medium"
                                    : "text-white/80 hover:bg-white/5 hover:text-white",
                            )}
                        >
                            <BancoLogo banco={b.nome} size={24}/>
                            <span className="truncate">
                {b.codigo} - {b.nome}
              </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Wizard / Modal ───────────────────────────────────────────────────────────
interface ModalProps {
    onClose: () => void;
    initialData?: ContaBancaria | null;
}

function NovaContaModal({onClose, initialData}: ModalProps) {
    const queryClient = useQueryClient();
    const {toast} = useToast();

    // activeStep: passo aberto; maxReached: até onde o usuário avançou
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
    const [maxReached, setMaxReached] = useState<number>(initialData ? 3 : 1);

    const defaultValues = useMemo<ContaBancariaFormValues>(
        () => ({
            tipo: initialData?.tipo ?? "",
            nome: initialData?.nome ?? "",
            banco: initialData?.banco ?? "",
            agencia: initialData?.agencia ?? "",
            conta: initialData?.conta ?? "",
            saldo_inicial_br: initialData
                ? apiValorToValorBr(initialData.saldo_inicial)
                : "",
            data_inicio: initialData?.data_inicio ?? "",
            cor: initialData?.cor?.match(/^#[0-9A-Fa-f]{6}$/i)
                ? initialData.cor
                : "#3BA8DC",
        }),
        [initialData],
    );

    const {
        register,
        control,
        trigger,
        reset,
        watch,
        setValue,
        getValues,
        formState: {errors},
    } = useForm<ContaBancariaFormValues>({
        resolver: zodResolver(contaBancariaFormSchema),
        defaultValues,
    });

    useEffect(() => {
        reset(defaultValues);
        setActiveStep(1);
        setMaxReached(initialData ? 3 : 1);
    }, [defaultValues, reset, initialData]);

    // Observa todos os campos do form reativamente, para habilitar/desabilitar os
    // botões "Continuar" / "Salvar" em tempo real conforme os obrigatórios (*) do
    // passo atual forem preenchidos.
    const formValues = watch();
    const {tipo, cor, nome, banco, agencia, conta, saldo_inicial_br, data_inicio} =
        formValues;

    // ── Status de cada passo ──
    function getStatus(s: 1 | 2 | 3): StepStatus {
        if (s === activeStep) return "active";
        if (s <= maxReached) return "completed";
        return "pending";
    }

    // Campos obrigatórios do passo 2 variam conforme o tipo
    function getStep2RequiredFields(): (keyof ContaBancariaFormValues)[] {
        if (tipo === TIPO_SEM_BANCO) return ["nome"];
        return ["nome", "banco", "agencia", "conta"];
    }

    // Validade "ao vivo" de cada passo (controla se os botões ficam habilitados)
    const step1Valid = !!tipo;

    const step2Valid = useMemo(() => {
        if (!tipo) return false;
        return getStep2RequiredFields().every((field) => {
            const value = formValues[field];
            return typeof value === "string" ? value.trim().length > 0 : !!value;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipo, nome, banco, agencia, conta]);

    const step3Valid = !!data_inicio && !!saldo_inicial_br?.trim();

    // Ghost Data Prevention: limpa campos ao trocar tipo
    const handleSelectTipo = (newTipo: string) => {
        const prevTipo = getValues("tipo");
        if (prevTipo !== newTipo && newTipo === TIPO_SEM_BANCO) {
            // Ao selecionar Conta Movimento, zera dados bancários para não enviar lixo
            setValue("banco", "");
            setValue("agencia", "");
            setValue("conta", "");
        }
        setValue("tipo", newTipo, {shouldValidate: false});
    };

    // ── Avançar passo 1 -> 2 ──
    const handleStep1Continue = () => {
        if (!step1Valid) {
            toast({
                description: "Selecione o tipo de conta para continuar.",
                variant: "destructive",
            });
            return;
        }
        setMaxReached((m) => Math.max(m, 2));
        setActiveStep(2);
    };

    // ── Avançar passo 2 -> 3 ──
    const handleStep2Continue = async () => {
        const fields = getStep2RequiredFields();
        const ok = await trigger(fields);
        if (!ok || !step2Valid) return;
        setMaxReached((m) => Math.max(m, 3));
        setActiveStep(3);
    };

    // ── Mutation ──
    const mutation = useMutation({
        mutationFn: (values: ContaBancariaFormValues) => {
            const isEdit = !!initialData;
            const saldoApi =
                brMoneyDisplayToApiString(values.saldo_inicial_br) || "0.00";
            const body = {
                nome: values.nome.trim(),
                banco: values.banco?.trim() || null,
                agencia: values.agencia?.trim() || null,
                conta: values.conta?.trim() || null,
                tipo: values.tipo,
                saldo_inicial: saldoApi,
                data_inicio: values.data_inicio || new Date().toISOString().split("T")[0],
                cor: values.cor,
                ...(isEdit && initialData ? {status: initialData.status} : {}),
            };
            const path = isEdit
                ? `/contas-bancarias/${initialData.id}`
                : "/contas-bancarias";
            return fetchApiData<ContaBancaria>(path, {
                method: isEdit ? "PUT" : "POST",
                body: JSON.stringify(body),
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["contas-bancarias"]});
            toast({
                title: initialData ? "Conta atualizada" : "Conta cadastrada",
                description: "As informações foram salvas com sucesso.",
            });
            onClose();
        },
        onError: (e: unknown) => {
            toast({
                title: "Erro",
                description: e instanceof Error ? e.message : String(e),
                variant: "destructive",
            });
        },
    });

    // ── Salvar (passo 3) ──
    const handleSave = async () => {
        const requiredFields: (keyof ContaBancariaFormValues)[] = [
            "nome",
            "saldo_inicial_br",
            "data_inicio",
            ...(tipo === TIPO_SEM_BANCO
                ? []
                : (["banco", "agencia", "conta"] as (keyof ContaBancariaFormValues)[])),
        ];
        const isValid = await trigger(requiredFields);

        if (!tipo || !isValid || !step3Valid) {
            toast({
                title: "Campos obrigatórios não preenchidos",
                description: "Há campos obrigatórios não preenchidos, volte e conclua!",
                variant: "destructive",
            });
            return;
        }

        mutation.mutate(getValues());
    };

    // Sumários para passos colapsados
    const step1Summary = ACCOUNT_TYPES.find((t) => t.value === tipo)?.label ?? tipo;
    const step2Summary = nome || "";

    // Placeholder do campo "Nome da conta" conforme o tipo selecionado
    function getNomePlaceholder() {
        switch (tipo) {
            case "Conta Poupança":
                return "Ex: Poupança Caixa";
            case "Conta Movimento":
                return "Ex: Caixa Operacional";
            default:
                return "Ex: Itaú PJ Principal";
        }
    }

    // Data máxima permitida no campo "Início dos lançamentos" (hoje)
    const maxDataInicio = getTodayIso();

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start pt-24 overflow-y-auto justify-center px-4 pb-10">
            <div className="bg-card border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                {/* Header fixo */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 flex-shrink-0">
                    <h2 className="text-lg font-bold text-white">
                        {initialData ? "Editar Conta Bancária" : "Cadastrar conta bancária"}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                {/* Accordion com scroll */}
                <div className="overflow-y-auto flex-1">
                    <form
                        noValidate
                        onSubmit={(e) => e.preventDefault()}
                        className="p-5 space-y-3"
                    >
                        {/* ── Passo 1: Tipo de Conta ── */}
                        <StepPanel
                            stepNumber={1}
                            title="Escolha o tipo de conta"
                            status={getStatus(1)}
                            summary={step1Summary}
                            onEdit={() => setActiveStep(1)}
                        >
                            <div className="flex flex-col gap-2">
                                {ACCOUNT_TYPES.map(({value, label, Icon}) => {
                                    const selected = tipo === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => handleSelectTipo(value)}
                                            className={cn(
                                                "w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all",
                                                selected
                                                    ? "border-primary bg-primary/5 text-white"
                                                    : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-white",
                                            )}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                        <span
                            className={cn(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                selected ? "border-primary" : "border-white/20",
                            )}
                        >
                          {selected && (
                              <span className="w-2 h-2 rounded-full bg-primary"/>
                          )}
                        </span>
                                                <span className="text-sm font-medium truncate">
                          {label}
                        </span>
                                            </div>
                                            <Icon
                                                className={cn(
                                                    "w-5 h-5 flex-shrink-0",
                                                    selected ? "text-primary" : "text-muted-foreground/60",
                                                )}
                                            />
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                disabled={!step1Valid}
                                onClick={handleStep1Continue}
                                className={continueBtnClass}
                            >
                                Continuar
                            </button>
                        </StepPanel>

                        {/* ── Passo 2: Preencha os dados ── */}
                        <StepPanel
                            stepNumber={2}
                            title="Preencha os dados"
                            status={getStatus(2)}
                            summary={step2Summary}
                            onEdit={() => setActiveStep(2)}
                        >
                            {tipo !== TIPO_SEM_BANCO ? (
                                /* Conta Corrente e Conta Poupança: Banco + Agência + Conta + Nome */
                                <div className="space-y-4">
                                    <Field label="Banco" required error={errors.banco?.message}>
                                        <Controller
                                            name="banco"
                                            control={control}
                                            render={({field}) => (
                                                <BancoSelect
                                                    value={field.value ?? ""}
                                                    onChange={field.onChange}
                                                />
                                            )}
                                        />
                                    </Field>

                                    <Field
                                        label="Agência (sem dígito)"
                                        required
                                        error={errors.agencia?.message}
                                    >
                                        <Controller
                                            name="agencia"
                                            control={control}
                                            render={({field}) => (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    value={field.value ?? ""}
                                                    onChange={(e) =>
                                                        field.onChange(maskAgencia(e.target.value))
                                                    }
                                                    className={monoInputClass}
                                                    placeholder="0000"
                                                    maxLength={4}
                                                />
                                            )}
                                        />
                                    </Field>

                                    <Field
                                        label="Conta (com dígito)"
                                        required
                                        error={errors.conta?.message}
                                    >
                                        <Controller
                                            name="conta"
                                            control={control}
                                            render={({field}) => (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    value={field.value ?? ""}
                                                    onChange={(e) =>
                                                        field.onChange(maskConta(e.target.value))
                                                    }
                                                    className={monoInputClass}
                                                    placeholder="00000-0"
                                                    maxLength={9}
                                                />
                                            )}
                                        />
                                    </Field>

                                    <Field
                                        label="Nome da conta"
                                        required
                                        error={errors.nome?.message}
                                        hint="Dê um nome para identificar esta conta depois."
                                    >
                                        <input
                                            {...register("nome")}
                                            className={inputClass}
                                            placeholder={getNomePlaceholder()}
                                        />
                                    </Field>
                                </div>
                            ) : (
                                /* Conta Movimento (Caixinha): apenas Nome */
                                <Field
                                    label="Nome da conta movimento"
                                    required
                                    error={errors.nome?.message}
                                    hint="Dê um nome para identificar esta conta depois."
                                >
                                    <input
                                        {...register("nome")}
                                        className={inputClass}
                                        placeholder={getNomePlaceholder()}
                                    />
                                </Field>
                            )}

                            {/* Cor (opcional) */}
                            <div>
                                <label
                                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                    Cor de Identificação
                                </label>
                                <div className="flex flex-wrap gap-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                                    {COLOR_PALETTE.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() =>
                                                setValue("cor", c, {shouldValidate: true})
                                            }
                                            title={
                                                BANCOS_BR.find((b) => b.cor === c)?.nome ??
                                                CORES_EXTRAS.find((e) => e.cor === c)?.nome ??
                                                "Cor padrão"
                                            }
                                            className={cn(
                                                "w-8 h-8 rounded-lg border-2 transition-all",
                                                cor === c
                                                    ? "border-white scale-110"
                                                    : "border-transparent opacity-50 hover:opacity-100",
                                            )}
                                            style={{backgroundColor: c}}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="border-t border-white/5 pt-4">
                                <button
                                    type="button"
                                    disabled={!step2Valid}
                                    onClick={() => void handleStep2Continue()}
                                    className={continueBtnClass}
                                >
                                    Continuar
                                </button>
                            </div>
                        </StepPanel>

                        {/* ── Passo 3: Defina a forma de cadastro ── */}
                        <StepPanel
                            stepNumber={3}
                            title="Dados Iniciais da Conta"
                            status={getStatus(3)}
                            onEdit={() => setActiveStep(3)}
                        >
                            {/* Caixa de instrução */}
                            <div className="border border-primary/30 bg-primary/5 rounded-xl p-4 space-y-4">
                                <p className="flex items-start gap-2 text-xs text-primary/90 font-medium">
                                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5"/>
                                    Informe uma data de início e o saldo do dia anterior:
                                </p>

                                {/* Data de início */}
                                <Field
                                    label="Início dos lançamentos"
                                    required
                                    error={errors.data_inicio?.message}
                                >
                                    <input
                                        type="date"
                                        {...register("data_inicio")}
                                        max={maxDataInicio}
                                        className={inputClass}
                                    />
                                </Field>

                                {/* Saldo do dia anterior */}
                                <Field
                                    label="Saldo final da conta no dia anterior"
                                    required
                                    error={errors.saldo_inicial_br?.message}
                                >
                                    <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">
                      R$
                    </span>
                                        <Controller
                                            name="saldo_inicial_br"
                                            control={control}
                                            render={({field}) => (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                    value={field.value}
                                                    onChange={(e) =>
                                                        field.onChange(formatValorBrInput(e.target.value))
                                                    }
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors font-bold"
                                                    placeholder="0,00"
                                                />
                                            )}
                                        />
                                    </div>
                                </Field>
                            </div>

                            {/* Ações */}
                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={mutation.isPending || !step3Valid}
                                    onClick={() => void handleSave()}
                                    className="px-6 py-2.5 bg-success hover:bg-success/90 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-success flex items-center gap-2"
                                >
                                    {mutation.isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin"/>
                                    ) : initialData ? (
                                        "Salvar Alterações"
                                    ) : (
                                        "Salvar"
                                    )}
                                </button>
                            </div>
                        </StepPanel>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ─── Tela Principal ────────────────────────────────────────────────────────────
export default function ContasBancarias() {
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const [showSaldos, setShowSaldos] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingConta, setEditingConta] = useState<ContaBancaria | null>(null);
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    const {data: contas = [], isLoading} = useQuery<ContaBancaria[]>({
        queryKey: ["contas-bancarias"],
        queryFn: () => fetchApiData<ContaBancaria[]>("/contas-bancarias"),
    });

    const blockMutation = useMutation({
        mutationFn: ({id, status}: { id: number; status: string }) =>
            fetchApiData<ContaBancaria>(`/contas-bancarias/${id}`, {
                method: "PUT",
                body: JSON.stringify({status}),
            }),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({queryKey: ["contas-bancarias"]});
            toast({
                title:
                    variables.status === "ativo" ? "Conta desbloqueada" : "Conta bloqueada",
                description: `O status da conta foi alterado para ${variables.status}.`,
            });
        },
        onError: (e: unknown) => {
            toast({
                variant: "destructive",
                title: "Erro",
                description: e instanceof Error ? e.message : String(e),
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) =>
            fetchApiData<{ deleted?: boolean }>(`/contas-bancarias/${id}`, {
                method: "DELETE",
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: ["contas-bancarias"]});
            toast({
                title: "Conta removida",
                description: "A conta foi deletada com sucesso.",
            });
        },
        onError: async (e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            const vinculada =
                /vincul|em uso|associad|relacionad|lançament/i.test(message);
            if (vinculada) {
                await confirm({
                    title: "Não é possível excluir",
                    description:
                        "Contas com lançamentos ou movimentações vinculadas não podem ser removidas.",
                    confirmLabel: "Entendi",
                    variant: "default",
                });
                return;
            }
            toast({variant: "destructive", title: "Erro", description: message});
        },
    });

    const handleDelete = async (conta: ContaBancaria) => {
        const ok = await confirm({
            title: `Excluir "${conta.nome.toUpperCase()}"?`,
            description:
                "Esta ação não pode ser desfeita. A conta bancária será removida permanentemente.",
            confirmLabel: "Excluir",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(conta.id);
    };

    // ── Filtro por nome (busca) ──
    const filteredContas = useMemo(() => {
        const term = normalizeSearch(search);
        if (!term) return contas;
        return contas.filter((c) => normalizeSearch(c.nome).includes(term));
    }, [contas, search]);

    // ── Paginação ──
    const totalPages = Math.max(
        1,
        Math.ceil(filteredContas.length / ITEMS_PER_PAGE),
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [search]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const paginatedContas = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredContas.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredContas, currentPage]);

    const rangeStart =
        filteredContas.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const rangeEnd = Math.min(
        currentPage * ITEMS_PER_PAGE,
        filteredContas.length,
    );

    const totalSaldoCents = contas
        .filter((c) => c.status === "ativo")
        .reduce((acc, c) => acc + toCents(c.saldo_atual), 0);

    if (isLoading)
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary"/>
            </div>
        );

    return (
        <div className="space-y-6">
            <ConfirmDialog {...ConfirmDialogProps} />

            {(showModal || editingConta) && (
                <NovaContaModal
                    key={editingConta?.id ?? "new"}
                    initialData={editingConta}
                    onClose={() => {
                        setShowModal(false);
                        setEditingConta(null);
                    }}
                />
            )}

            <PageHeader
                title="Contas Bancárias"
                description="Gerencie as contas bancárias reais da empresa. O saldo é atualizado automaticamente via conciliação."
                actions={
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setShowSaldos((v) => !v)}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
                        >
                            {showSaldos ? (
                                <EyeOff className="w-4 h-4"/>
                            ) : (
                                <Eye className="w-4 h-4"/>
                            )}
                            {showSaldos ? "Ocultar" : "Mostrar"} Saldos
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                        >
                            <Plus className="w-4 h-4"/> Cadastrar Novo
                        </button>
                    </div>
                }
            />

            {/* Saldo consolidado */}
            <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            Saldo Consolidado (contas ativas)
                        </p>
                        <p className="text-3xl font-bold text-white mt-1">
                            {showSaldos
                                ? formatCurrency(totalSaldoCents / 100)
                                : "R$ ••••••"}
                        </p>
                    </div>
                    <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center">
                        <Landmark className="w-7 h-7 text-primary"/>
                    </div>
                </div>
            </div>

            {/* Busca */}
            <div className="glass-panel rounded-2xl p-4">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Pesquisar por nome"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                    />
                </div>
            </div>

            {/* Listagem em tabela */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                {filteredContas.length === 0 ? (
                    <div className="py-16 text-center border-dashed border-2 border-white/10 rounded-2xl">
                        <Landmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4"/>
                        <p className="text-muted-foreground text-sm font-medium">
                            {contas.length === 0
                                ? "Nenhuma conta cadastrada ainda."
                                : "Nenhuma conta encontrada para essa busca."}
                        </p>
                        {contas.length === 0 && (
                            <button
                                type="button"
                                onClick={() => setShowModal(true)}
                                className="text-primary text-sm font-bold hover:underline mt-2"
                            >
                                Clique aqui para criar sua primeira conta
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="border-b border-white/10 bg-white/[0.03]">
                                <th className="text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground px-5 py-3">
                                    Empresas
                                </th>
                                <th className="text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground px-5 py-3">
                                    Nome
                                </th>
                                <th className="text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground px-5 py-3">
                                    Tipo
                                </th>
                                <th className="text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground px-5 py-3">
                                    Informações
                                </th>
                                <th className="text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground px-5 py-3">
                                    Saldo Atual
                                </th>
                                <th className="text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground px-5 py-3">
                                    Status
                                </th>
                                <th className="text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground px-5 py-3">
                                    Ações
                                </th>
                            </tr>
                            </thead>
                            <tbody>
                            {paginatedContas.map((conta) => {
                                const temAgenciaConta = conta.agencia || conta.conta;
                                return (
                                    <tr
                                        key={conta.id}
                                        className={cn(
                                            "border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.03]",
                                            conta.status === "bloqueado" && "opacity-60",
                                        )}
                                    >
                                        {/* Empresas (logo do banco) */}
                                        <td className="px-5 py-4">
                                            {conta.banco ? (
                                                <BancoLogo banco={conta.banco} size={36}/>
                                            ) : (
                                                <div
                                                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                                    style={{backgroundColor: `${conta.cor}20`}}
                                                >
                                                    <Landmark
                                                        className="w-4.5 h-4.5"
                                                        style={{color: conta.cor}}
                                                    />
                                                </div>
                                            )}
                                        </td>

                                        {/* Nome */}
                                        <td className="px-5 py-4">
                                            <div className="min-w-0">
                                                <p className="font-bold text-white leading-tight truncate">
                                                    {conta.nome}
                                                </p>
                                                {conta.banco && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                        {conta.banco}
                                                    </p>
                                                )}
                                            </div>
                                        </td>

                                        {/* Tipo */}
                                        <td className="px-5 py-4">
                        <span className="text-white/80 font-medium">
                          {conta.tipo}
                        </span>
                                        </td>

                                        {/* Informações */}
                                        <td className="px-5 py-4">
                                            <p className="text-white/80 font-mono text-xs">
                                                {temAgenciaConta
                                                    ? `Agência: ${conta.agencia || "—"} | Conta: ${conta.conta || "—"}`
                                                    : "Sem agência/conta cadastrada"}
                                            </p>
                                            {conta.data_inicio && (
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    Início:{" "}
                                                    {new Date(
                                                        `${conta.data_inicio}T00:00:00`,
                                                    ).toLocaleDateString("pt-BR")}
                                                </p>
                                            )}
                                        </td>

                                        {/* Saldo Atual */}
                                        <td className="px-5 py-4 text-right">
                        <span
                            className="font-bold"
                            style={{color: conta.cor}}
                        >
                          {showSaldos
                              ? formatCurrency(toCents(conta.saldo_atual) / 100)
                              : "R$ ••••••"}
                        </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-5 py-4 text-center">
                        <span
                            className={cn(
                                "inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-1 rounded-lg",
                                conta.status === "ativo"
                                    ? "bg-success/20 text-success"
                                    : "bg-destructive/20 text-destructive",
                            )}
                        >
                          {conta.status === "ativo" ? (
                              <CheckCircle className="w-3 h-3"/>
                          ) : (
                              <AlertCircle className="w-3 h-3"/>
                          )}
                            {conta.status}
                        </span>
                                        </td>

                                        {/* Ações */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingConta(conta)}
                                                    title="Editar"
                                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                                                >
                                                    <Pencil className="w-4 h-4"/>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        blockMutation.mutate({
                                                            id: conta.id,
                                                            status:
                                                                conta.status === "ativo"
                                                                    ? "bloqueado"
                                                                    : "ativo",
                                                        })
                                                    }
                                                    title={
                                                        conta.status === "ativo"
                                                            ? "Bloquear"
                                                            : "Desbloquear"
                                                    }
                                                    className={cn(
                                                        "p-2 rounded-lg transition-colors",
                                                        conta.status === "ativo"
                                                            ? "bg-white/5 hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400"
                                                            : "bg-success/20 text-success hover:bg-success/30",
                                                    )}
                                                >
                                                    {conta.status === "ativo" ? (
                                                        <Lock className="w-4 h-4"/>
                                                    ) : (
                                                        <Unlock className="w-4 h-4"/>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(conta)}
                                                    title="Excluir"
                                                    className="p-2 bg-white/5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                                                >
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
                )}

                {/* Paginação */}
                {filteredContas.length > 0 && (
                    <div
                        className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-white/[0.02]">
                        <p className="text-xs text-muted-foreground">
                            {rangeStart} a {rangeEnd} de {filteredContas.length}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(1)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                title="Primeiro"
                            >
                                <ChevronsLeft className="w-4 h-4"/>
                            </button>
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                title="Anterior"
                            >
                                <ChevronLeft className="w-4 h-4"/>
                            </button>
                            <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                Página {currentPage} de {totalPages}
              </span>
                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() =>
                                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                                }
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                title="Próxima"
                            >
                                <ChevronRight className="w-4 h-4"/>
                            </button>
                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(totalPages)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                title="Última"
                            >
                                <ChevronsRight className="w-4 h-4"/>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}