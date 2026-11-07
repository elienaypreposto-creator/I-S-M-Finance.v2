import {tenantQueryKey} from "@/lib/tenant-query";
import {useEffect, useId, useMemo, useState, useRef} from "react";
import {useForm, Controller} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {PageHeader} from "@/components/shared/page-header";
import {BotaoBloquear, BotaoEditar, BotaoExcluir} from "@/components/shared/botoes-acao";
import {
    Plus,
    Landmark,
    CheckCircle,
    AlertCircle,
    Loader2,
    PiggyBank,
    PackageOpen,
    CheckCircle2,
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
    ChevronDown,
    Info,
    Search,
    TrendingUp,
    Calendar as CalendarIcon,
} from "lucide-react";
import {format as formatarDataFns, parseISO} from "date-fns";
import {ptBR} from "date-fns/locale";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Calendar as CalendarPicker} from "@/components/ui/calendar";
import {formatCurrency, cn} from "@/lib/utils";
import {
    AGENCIA_MAX_LENGTH,
    encontrarContaDuplicada,
    formatarSaldoComSinal,
    inverterSinalSaldo,
    mascararAgenciaConta,
    mensagemContaDuplicada,
    saldoApiParaBr,
    saldoBrParaApi,
} from "@/lib/conta-bancaria";
import {BANCOS_BR, BANCOS_PRINCIPAIS, bancoPorNome, filtrarBancos} from "@/lib/bancos-br";
import {useSaldosVisiveis} from "@/components/conta/saldos-visiveis";
import {classeSaldo} from "@/lib/saldo";
import {formatarData, hojeIsoLocal, parseDataCivil} from "@/lib/datas";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {ApiError, fetchApiData} from "@/lib/api-config";
import {
    contaBancariaFormSchema,
    type ContaBancariaFormValues,
    TIPOS_CONTA,
    type TipoConta,
} from "@/validations/cadastros.schema";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {DISCARD_PROMPT} from "@/hooks/use-escape-close";
import {
    Modal,
    ModalBody,
    ModalFooter,
    ModalForm,
    ModalHeader,
    ModalSpinner,
    focarPrimeiro,
    modalBtnPrimaryCls,
    modalBtnSecondaryCls,
    modalGrid2Cls,
    modalGridCls,
} from "@/components/ui/modal-responsivo";
import {
    CampoBusca,
    FiltrosAtivos,
    FiltrosPopover,
    FOCO_VISIVEL,
    casaMulti,
    contemBusca,
    patchDosValores,
    useFiltrosNaUrl,
    type DefinicaoFiltro,
    type OpcaoFiltro,
} from "@/components/shared/filtros";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ContaBancaria = {
    id: number;
    nome: string;
    banco: string | null;
    agencia: string | null;
    digito_agencia?: string | null;
    conta: string | null;
    digito_conta?: string | null;
    empresa?: string | null;
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

function maskConta(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 1) return digits;
    return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

const ROTULO_STATUS: Record<string, string> = {ativo: "Ativa", bloqueado: "Bloqueada"};

// ─── Tipos de conta disponíveis (derivados do schema canônico) ────────────────
const TIPO_ICONS: Record<string, React.ComponentType<{
    className?: string;
    "aria-hidden"?: React.AriaAttributes["aria-hidden"]
}>> = {
    "Conta Corrente": Landmark,
    "Conta Movimento": PackageOpen,
    "Conta Poupança": PiggyBank,
    "Conta Aplicação": TrendingUp,
};

// Ordem de exibição no Passo 1 (Corrente -> Poupança -> Movimento -> Aplicação).
// `satisfies` garante que todo valor existe em TIPOS_CONTA (a fonte canônica).
const TIPO_ROTULOS: Record<string, string> = {
    "Conta Movimento": "Conta Movimento (Caixinha)",
    "Conta Aplicação": "Conta de Aplicação / Investimento",
};

/** Rótulo do tipo para tela (passo 1, filtro e lista usam esta mesma função). */
function rotuloDoTipo(tipo: string): string {
    return TIPO_ROTULOS[tipo] ?? tipo;
}

const ACCOUNT_TYPES = (
    ["Conta Corrente", "Conta Poupança", "Conta Movimento", "Conta Aplicação"] as const satisfies readonly TipoConta[]
).map((value) => ({
    value,
    label: rotuloDoTipo(value),
    Icon: TIPO_ICONS[value] ?? Landmark,
}));

// Único tipo que não exige banco/agência/conta (renderiza apenas o campo Nome)
const TIPO_SEM_BANCO = "Conta Movimento" as const;

const ITEMS_PER_PAGE = 8;

// ─── Filtros da listagem (ISMF-33) ────────────────────────────────────────────
// A tela trata como ativa só a conta com status "ativo"; qualquer outro status
// (hoje "bloqueado") é exibido como inativa/bloqueada.
const STATUS_OPCOES: OpcaoFiltro[] = [
    {valor: "ativo", rotulo: "Ativa"},
    {valor: "bloqueado", rotulo: "Bloqueada (inativa)"},
];

const statusDoFiltro = (status: string) => (status === "ativo" ? "ativo" : "bloqueado");

/** Valor do filtro de banco para contas sem banco vinculado (ex.: Conta Movimento). */
const SEM_BANCO = "sem-banco";

const collatorBancos = new Intl.Collator("pt-BR", {sensitivity: "base"});

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
    for (const b of BANCOS_PRINCIPAIS) {
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
    const found = bancoPorNome(banco);
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
                title={banco ?? undefined}
            >
                <Landmark aria-hidden="true" style={{width: size * 0.55, height: size * 0.55}}/>
            </div>
        );
    }

    // Selo colorido com a sigla: bancos sem logo (lista do BCB) ou logo que falhou
    if (!found.logo || imgFailed) {
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
                "border rounded-xl transition-all",
                status === "active" ? "border-white/20" : "border-white/10",
                status === "pending" && "opacity-40 pointer-events-none",
            )}
        >
            {/* Step header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] rounded-t-xl">
                <div className="flex items-center gap-3">
                    {status === "completed" ? (
                        <CheckCircle2 aria-hidden="true" className="w-5 h-5 text-success flex-shrink-0"/>
                    ) : (
                        <div
                            aria-hidden="true"
                            className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0",
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
                            id={`conta-passo-${stepNumber}-titulo`}
                            className={cn(
                                "text-sm font-semibold leading-tight",
                                status === "pending" ? "text-white/40" : "text-white",
                            )}
                        >
                            <span className="sr-only">Passo {stepNumber}: </span>
                            {title}
                            {status !== "pending" && (
                                <span className="text-destructive ml-0.5">*</span>
                            )}
                            <span className="sr-only">
                                {status === "completed" ? " (concluído)" : status === "pending" ? " (pendente)" : ""}
                            </span>
                        </p>
                        {status === "completed" && summary && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {summary}
                            </p>
                        )}
                    </div>
                </div>
                {status === "completed" && onEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        aria-label={`Editar passo ${stepNumber}: ${title}`}
                        className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                        Editar
                    </button>
                )}
            </div>

            {/* Step body - visível apenas quando ativo */}
            {status === "active" && (
                <div data-passo-ativo="" className="p-5 border-t border-white/5 space-y-4">{children}</div>
            )}
        </div>
    );
}

// ─── Campo de texto padrão ─────────────────────────────────────────────────
function Field({
                   id,
                   label,
                   required,
                   error,
                   hint,
                   children,
               }: {
    /** id do campo (o `<label>` aponta para ele). */
    id: string;
    label: string;
    required?: boolean;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label htmlFor={id}
                   className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                {label}
                {required && <span className="text-destructive ml-0.5">*</span>}
            </label>
            {children}
            {hint && !error && (
                <p className="text-xs text-muted-foreground/70 mt-1.5">{hint}</p>
            )}
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
    );
}

const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors";
const monoInputClass = `${inputClass} font-mono`;
const selectClass = `${inputClass} appearance-none pr-10 cursor-pointer`;

const continueBtnClass =
    "mt-1 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary";

// ─── Select de Banco (dropdown customizado, tema escuro, com logo e busca) ───
// Lista completa do BCB com busca por código ("1", "001", "341") ou nome sem
// acento ("itau"). Setas navegam, Enter escolhe e Esc fecha só a lista.
function BancoSelect({
                         id,
                         value,
                         onChange,
                     }: {
    id?: string;
    value: string;
    onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [busca, setBusca] = useState("");
    const [ativo, setAtivo] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const botaoRef = useRef<HTMLButtonElement>(null);
    const buscaRef = useRef<HTMLInputElement>(null);
    const listaId = `${useId()}-bancos`;

    const filtrados = useMemo(() => filtrarBancos(BANCOS_BR, busca), [busca]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
                setBusca("");
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Foco no campo de busca ao abrir.
    useEffect(() => {
        if (open) buscaRef.current?.focus();
    }, [open]);

    // Mantém a opção destacada visível na lista com rolagem.
    useEffect(() => {
        if (!open) return;
        document.getElementById(`${listaId}-${ativo}`)?.scrollIntoView({block: "nearest"});
    }, [open, ativo, listaId]);

    const selectedBanco = bancoPorNome(value);

    const abrir = () => {
        setBusca("");
        setAtivo(Math.max(0, BANCOS_BR.findIndex((b) => b.nome === value)));
        setOpen(true);
    };

    const fechar = (devolverFoco: boolean) => {
        setOpen(false);
        setBusca("");
        if (devolverFoco) botaoRef.current?.focus();
    };

    const escolher = (nome: string) => {
        onChange(nome);
        fechar(true);
    };

    const aoTeclarBusca = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((a) => Math.min(a + 1, filtrados.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => Math.max(a - 1, 0));
        } else if (e.key === "Enter") {
            // Não deixa o Enter enviar o formulário do modal.
            e.preventDefault();
            const b = filtrados[ativo];
            if (b) escolher(b.nome);
        } else if (e.key === "Escape") {
            e.preventDefault();
            fechar(true);
        } else if (e.key === "Tab") {
            // Foco volta ao botão antes do Tab andar, para seguir até o próximo campo (Agência).
            fechar(true);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                ref={botaoRef}
                id={id}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => (open ? fechar(false) : abrir())}
                onKeyDown={(e) => {
                    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                        e.preventDefault();
                        abrir();
                    }
                }}
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
              : value || "Selecione"}
        </span>
            </button>
            <ChevronDown
                aria-hidden="true"
                className={cn(
                    "absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none transition-transform",
                    open && "rotate-180",
                )}
            />

            {open && (
                <div
                    className="absolute z-50 mt-1.5 w-full bg-[#1a1b23] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                    <div className="relative p-2 border-b border-white/10">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute left-4.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                        />
                        <input
                            ref={buscaRef}
                            type="text"
                            role="combobox"
                            autoComplete="off"
                            aria-label="Buscar banco por código ou nome"
                            aria-autocomplete="list"
                            aria-expanded={open}
                            aria-controls={listaId}
                            aria-activedescendant={filtrados[ativo] ? `${listaId}-${ativo}` : undefined}
                            placeholder="Buscar por código ou nome"
                            value={busca}
                            onChange={(e) => {
                                setBusca(e.target.value);
                                setAtivo(0);
                            }}
                            onKeyDown={aoTeclarBusca}
                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>
                    <ul
                        id={listaId}
                        role="listbox"
                        aria-label="Bancos"
                        className="max-h-64 overflow-y-auto py-1.5"
                    >
                        {filtrados.length === 0 ? (
                            <li role="presentation" className="px-4 py-2.5 text-sm text-muted-foreground">
                                Nenhum banco encontrado
                            </li>
                        ) : (
                            filtrados.map((b, i) => (
                                <li
                                    key={b.codigo}
                                    id={`${listaId}-${i}`}
                                    role="option"
                                    aria-selected={value === b.nome}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => escolher(b.nome)}
                                    onMouseEnter={() => setAtivo(i)}
                                    className={cn(
                                        "w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm cursor-pointer transition-colors",
                                        value === b.nome
                                            ? "bg-primary/15 text-primary font-medium"
                                            : i === ativo
                                                ? "bg-white/5 text-white"
                                                : "text-white/80",
                                        i === ativo && value === b.nome && "ring-1 ring-inset ring-primary/40",
                                    )}
                                >
                                    <BancoLogo banco={b.nome} size={24}/>
                                    <span className="truncate">
                {b.codigo} - {b.nome}
              </span>
                                </li>
                            ))
                        )}
                    </ul>
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
    const {confirm, ConfirmDialogProps} = useConfirm();

    // activeStep: passo aberto; maxReached: até onde o usuário avançou
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
    const [maxReached, setMaxReached] = useState<number>(initialData ? 3 : 1);

    const defaultValues = useMemo<ContaBancariaFormValues>(
        () => ({
            tipo: initialData?.tipo ?? "",
            nome: initialData?.nome ?? "",
            banco: initialData?.banco ?? "",
            agencia: initialData?.agencia ?? "",
            digito_agencia: initialData?.digito_agencia ?? "",
            conta: initialData?.conta ?? "",
            digito_conta: initialData?.digito_conta ?? "",
            empresa: initialData?.empresa ?? "",
            saldo_inicial_br: initialData
                ? saldoApiParaBr(initialData.saldo_inicial)
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
        setError,
        clearErrors,
        formState: {errors, isDirty},
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

    // Conta duplicada (mesmo banco + agência + conta): avisa já no passo 2 com a lista
    // carregada na tela. A API confere de novo ao salvar.
    function contaDuplicada(): string | null {
        if (getValues("tipo") === TIPO_SEM_BANCO) return null;
        const existentes = queryClient.getQueryData<ContaBancaria[]>(tenantQueryKey("contas-bancarias")) ?? [];
        const dup = encontrarContaDuplicada(
            {banco: getValues("banco"), agencia: getValues("agencia"), conta: getValues("conta")},
            existentes,
            initialData?.id,
        );
        if (!dup) return null;
        const msg = mensagemContaDuplicada(dup.nome);
        setError("conta", {type: "duplicada", message: msg});
        return msg;
    }

    // ── Avançar passo 2 -> 3 ──
    const handleStep2Continue = async () => {
        const fields = getStep2RequiredFields();
        const ok = await trigger(fields);
        if (!ok || !step2Valid) return;
        if (contaDuplicada()) return;
        setMaxReached((m) => Math.max(m, 3));
        setActiveStep(3);
    };

    // ── Mutation ──
    const mutation = useMutation({
        mutationFn: (values: ContaBancariaFormValues) => {
            const isEdit = !!initialData;
            const saldoApi = saldoBrParaApi(values.saldo_inicial_br) || "0.00";
            const body = {
                nome: values.nome.trim(),
                banco: values.banco?.trim() || null,
                agencia: values.agencia?.trim() || null,
                conta: values.conta?.trim() || null,
                tipo: values.tipo,
                saldo_inicial: saldoApi,
                data_inicio: values.data_inicio || hojeIsoLocal(),
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
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("contas-bancarias")});
            toast({
                title: initialData ? "Conta atualizada" : "Conta cadastrada",
                description: "As informações foram salvas com sucesso.",
            });
            onClose();
        },
        onError: (e: unknown) => {
            if (e instanceof ApiError && e.code === "CONTA_DUPLICADA") {
                setError("conta", {type: "duplicada", message: e.message});
                setActiveStep(2);
            }
            toast({
                title: e instanceof ApiError && e.code === "CONTA_DUPLICADA" ? "Conta já cadastrada" : "Erro ao salvar",
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
                description: "Confira os campos destacados antes de salvar.",
                variant: "destructive",
            });
            return;
        }

        const duplicada = contaDuplicada();
        if (duplicada) {
            setActiveStep(2);
            toast({title: "Conta já cadastrada", description: duplicada, variant: "destructive"});
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
                return "Ex.: Poupança Caixa";
            case "Conta Movimento":
                return "Ex.: Caixa Operacional";
            case "Conta Aplicação":
                return "Ex.: CDB Itaú 2027";
            default:
                return "Ex.: Itaú PJ Principal";
        }
    }

    // Data máxima permitida no campo "Início dos lançamentos" (hoje)
    const maxDataInicio = parseDataCivil(hojeIsoLocal()) ?? new Date();

    async function handleRequestClose() {
        if (isDirty) {
            const ok = await confirm(DISCARD_PROMPT);
            if (!ok) return;
        }
        onClose();
    }

    // Ao trocar de passo o conteúdo do passo anterior some: leva o foco ao
    // primeiro campo do passo aberto (na abertura, quem foca é o Modal).
    const bodyRef = useRef<HTMLDivElement>(null);
    const primeiroPassoRef = useRef(true);
    useEffect(() => {
        if (primeiroPassoRef.current) {
            primeiroPassoRef.current = false;
            return;
        }
        focarPrimeiro(bodyRef.current?.querySelector<HTMLElement>("[data-passo-ativo]"));
    }, [activeStep]);

    return (
        <Modal
            onClose={() => void handleRequestClose()}
            onEscapeKeyDown={(e) => {
                // Esc na busca do banco (combobox aberto) fecha só a lista, não o modal.
                const alvo = document.activeElement as HTMLElement | null;
                if (alvo?.getAttribute("role") === "combobox" && alvo.getAttribute("aria-expanded") === "true") {
                    e.preventDefault();
                }
            }}
        >
            <ModalHeader title={initialData ? "Editar Conta Bancária" : "Cadastrar conta bancária"}/>

            <ModalForm noValidate onSubmit={(e) => e.preventDefault()}>
                {/* Accordion com scroll */}
                <ModalBody ref={bodyRef} className="space-y-3">
                    {/* ── Passo 1: Tipo de Conta ── */}
                    <StepPanel
                        stepNumber={1}
                        title="Escolha o tipo de conta"
                        status={getStatus(1)}
                        summary={step1Summary}
                        onEdit={() => setActiveStep(1)}
                    >
                        <div role="group" aria-labelledby="conta-passo-1-titulo"
                             className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                            {ACCOUNT_TYPES.map(({value, label, Icon}) => {
                                const selected = tipo === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={selected}
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
                                                aria-hidden="true"
                                                className={cn(
                                                    "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                                    selected ? "border-primary" : "border-white/20",
                                                )}
                                            >
                                                {selected && (
                                                    <span className="w-2 h-2 rounded-full bg-primary"/>
                                                )}
                                            </span>
                                            <span className="text-sm font-medium leading-tight break-words">
                                                {label}
                                            </span>
                                        </div>
                                        <Icon
                                            aria-hidden="true"
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
                            /* Conta Corrente, Poupança e Aplicação: Banco + Agência + Conta + Nome */
                            <div className={modalGridCls}>
                                <Field id="conta-banco" label="Banco" required error={errors.banco?.message}>
                                    <Controller
                                        name="banco"
                                        control={control}
                                        render={({field}) => (
                                            <BancoSelect
                                                id="conta-banco"
                                                value={field.value ?? ""}
                                                onChange={(v) => {
                                                    field.onChange(v);
                                                    if (errors.conta?.type === "duplicada") clearErrors("conta");
                                                }}
                                            />
                                        )}
                                    />
                                </Field>

                                <Field
                                    id="conta-agencia"
                                    label="Agência"
                                    required
                                    error={errors.agencia?.message}
                                    hint="Até 4 dígitos; o dígito verificador é opcional."
                                >
                                    <Controller
                                        name="agencia"
                                        control={control}
                                        render={({field}) => (
                                            <input
                                                id="conta-agencia"
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                aria-invalid={!!errors.agencia}
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                    field.onChange(mascararAgenciaConta(e.target.value));
                                                    if (errors.conta?.type === "duplicada") clearErrors("conta");
                                                }}
                                                className={monoInputClass}
                                                placeholder="0000-0"
                                                maxLength={AGENCIA_MAX_LENGTH}
                                            />
                                        )}
                                    />
                                </Field>

                                <Field
                                    id="conta-conta"
                                    label="Conta (com dígito)"
                                    required
                                    error={errors.conta?.message}
                                >
                                    <Controller
                                        name="conta"
                                        control={control}
                                        render={({field}) => (
                                            <input
                                                id="conta-conta"
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                aria-invalid={!!errors.conta}
                                                value={field.value ?? ""}
                                                onChange={(e) => {
                                                    field.onChange(maskConta(e.target.value));
                                                    if (errors.conta?.type === "duplicada") clearErrors("conta");
                                                }}
                                                className={monoInputClass}
                                                placeholder="00000-0"
                                                maxLength={9}
                                            />
                                        )}
                                    />
                                </Field>

                                <Field
                                    id="conta-nome"
                                    label="Nome da conta"
                                    required
                                    error={errors.nome?.message}
                                    hint="Dê um nome para identificar esta conta depois."
                                >
                                    <input
                                        id="conta-nome"
                                        {...register("nome")}
                                        aria-invalid={!!errors.nome}
                                        className={inputClass}
                                        placeholder={getNomePlaceholder()}
                                    />
                                </Field>
                            </div>
                        ) : (
                            /* Conta Movimento (Caixinha): apenas Nome */
                            <div className={modalGridCls}>
                                <Field
                                    id="conta-nome"
                                    label="Nome da conta movimento"
                                    required
                                    error={errors.nome?.message}
                                    hint="Dê um nome para identificar esta conta depois."
                                >
                                    <input
                                        id="conta-nome"
                                        {...register("nome")}
                                        aria-invalid={!!errors.nome}
                                        className={inputClass}
                                        placeholder={getNomePlaceholder()}
                                    />
                                </Field>
                            </div>
                        )}

                        {/* Cor (opcional) */}
                        <div>
                            <p id="conta-cor-rotulo"
                               className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                Cor de Identificação
                            </p>
                            <div role="group" aria-labelledby="conta-cor-rotulo"
                                 className="flex flex-wrap gap-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                                {COLOR_PALETTE.map((c) => {
                                    const nomeCor =
                                        BANCOS_PRINCIPAIS.find((b) => b.cor === c)?.nome ??
                                        CORES_EXTRAS.find((e) => e.cor === c)?.nome ??
                                        "Cor padrão";
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() =>
                                                setValue("cor", c, {shouldValidate: true})
                                            }
                                            title={nomeCor}
                                            aria-label={nomeCor}
                                            aria-pressed={cor === c}
                                            className={cn(
                                                "w-8 h-8 rounded-lg border-2 transition-all",
                                                cor === c
                                                    ? "border-white scale-110"
                                                    : "border-transparent opacity-50 hover:opacity-100",
                                            )}
                                            style={{backgroundColor: c}}
                                        />
                                    );
                                })}
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
                        <div className="border border-primary/30 bg-primary/5 rounded-xl p-4">
                            <div className={modalGrid2Cls}>
                                <p className="col-span-full flex items-start gap-2 text-xs text-primary/90 font-medium">
                                    <Info aria-hidden="true" className="w-4 h-4 flex-shrink-0 mt-0.5"/>
                                    Informe uma data de início e o saldo do dia anterior:
                                </p>

                                {/* Data de início */}
                                <Field
                                    id="conta-data-inicio"
                                    label="Início dos lançamentos"
                                    required
                                    error={errors.data_inicio?.message}
                                >
                                    {/* Seletor com exibição dd/mm/aaaa (o input nativo segue o idioma do
                                        navegador e mostrava mm/dd/aaaa). Datas futuras ficam desabilitadas. */}
                                    <Controller
                                        name="data_inicio"
                                        control={control}
                                        render={({field}) => (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <button
                                                        type="button"
                                                        id="conta-data-inicio"
                                                        aria-invalid={!!errors.data_inicio}
                                                        aria-haspopup="dialog"
                                                        className={cn(
                                                            inputClass,
                                                            "flex items-center justify-between text-left",
                                                            !field.value && "text-muted-foreground",
                                                        )}
                                                    >
                                                        {field.value ? formatarData(field.value) : "dd/mm/aaaa"}
                                                        <CalendarIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0"/>
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 border border-white/10" align="start">
                                                    <CalendarPicker
                                                        mode="single"
                                                        selected={field.value ? parseISO(field.value) : undefined}
                                                        defaultMonth={field.value ? parseISO(field.value) : maxDataInicio}
                                                        onSelect={(date) => {
                                                            field.onChange(date ? formatarDataFns(date, "yyyy-MM-dd") : "");
                                                            void trigger("data_inicio");
                                                        }}
                                                        disabled={{after: maxDataInicio}}
                                                        locale={ptBR}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                    />
                                </Field>

                                {/* Saldo do dia anterior */}
                                <Field
                                    id="conta-saldo-inicial"
                                    label="Saldo final da conta no dia anterior"
                                    required
                                    error={errors.saldo_inicial_br?.message}
                                    hint="Saldo negativo (cheque especial): digite o sinal de menos ou use o botão ±."
                                >
                                    <div className="relative">
                                        <span aria-hidden="true"
                                              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">
                                            R$
                                        </span>
                                        <Controller
                                            name="saldo_inicial_br"
                                            control={control}
                                            render={({field}) => (
                                                <>
                                                    <input
                                                        id="conta-saldo-inicial"
                                                        type="text"
                                                        inputMode="decimal"
                                                        autoComplete="off"
                                                        aria-invalid={!!errors.saldo_inicial_br}
                                                        value={field.value}
                                                        onChange={(e) =>
                                                            field.onChange(formatarSaldoComSinal(e.target.value))
                                                        }
                                                        className={cn(
                                                            "w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-3 text-sm outline-none focus:border-primary/50 transition-colors font-bold",
                                                            field.value?.startsWith("-") ? "text-destructive" : "text-white",
                                                        )}
                                                        placeholder="0,00"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => field.onChange(inverterSinalSaldo(field.value ?? ""))}
                                                        aria-label="Inverter sinal do saldo (positivo/negativo)"
                                                        title="Inverter sinal (positivo/negativo)"
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-sm font-bold text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
                                                    >
                                                        ±
                                                    </button>
                                                </>
                                            )}
                                        />
                                    </div>
                                </Field>
                            </div>
                        </div>
                    </StepPanel>
                </ModalBody>

                <ModalFooter hint="* Campos obrigatórios · Esc fecha">
                    <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
                        Cancelar
                    </button>
                    {/* Salvar só no passo 3, como antes da migração. */}
                    {activeStep === 3 && (
                        <button
                            type="button"
                            disabled={mutation.isPending || !step3Valid}
                            onClick={() => void handleSave()}
                            className={modalBtnPrimaryCls}
                        >
                            {mutation.isPending ? (
                                <ModalSpinner/>
                            ) : initialData ? (
                                "Salvar Alterações"
                            ) : (
                                "Salvar"
                            )}
                        </button>
                    )}
                </ModalFooter>
            </ModalForm>
            <ConfirmDialog {...ConfirmDialogProps} />
        </Modal>
    );
}

// ─── Tela Principal ────────────────────────────────────────────────────────────
export default function ContasBancarias() {
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const saldos = useSaldosVisiveis();
    const [showModal, setShowModal] = useState(false);
    const [editingConta, setEditingConta] = useState<ContaBancaria | null>(null);

    const {data: contas = [], isLoading} = useQuery<ContaBancaria[]>({
        queryKey: tenantQueryKey("contas-bancarias"),
        queryFn: () => fetchApiData<ContaBancaria[]>("/contas-bancarias"),
    });

    // ── Filtros (estado na URL: ?status=&tipo=&banco=&q=&pagina=) ──
    const definicoes: DefinicaoFiltro[] = useMemo(() => {
        const tiposCarregados = Array.from(new Set(contas.map((c) => c.tipo).filter(Boolean)));
        const ordemTipos = ACCOUNT_TYPES.map((t) => t.value as string);
        tiposCarregados.sort((a, b) => {
            const ia = ordemTipos.indexOf(a);
            const ib = ordemTipos.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || collatorBancos.compare(a, b);
        });
        const bancosCarregados = Array.from(
            new Set(contas.map((c) => c.banco?.trim() ?? "").filter(Boolean)),
        ).sort(collatorBancos.compare);
        const temSemBanco = contas.some((c) => !c.banco?.trim());
        return [
            {chave: "status", rotulo: "Status", tipo: "multi", opcoes: STATUS_OPCOES},
            {
                chave: "tipo",
                rotulo: "Tipo de conta",
                tipo: "multi",
                opcoes: tiposCarregados.map((t) => ({
                    valor: t,
                    rotulo: rotuloDoTipo(t),
                })),
            },
            {
                chave: "banco",
                rotulo: "Banco",
                tipo: "select",
                placeholder: "Todos os bancos",
                opcoes: [
                    ...bancosCarregados.map((b) => ({valor: b, rotulo: b})),
                    ...(temSemBanco ? [{valor: SEM_BANCO, rotulo: "Sem banco vinculado"}] : []),
                ],
            },
        ];
    }, [contas]);

    const filtros = useFiltrosNaUrl(definicoes);
    const busca = filtros.ler("q");
    const temFiltroOuBusca = filtros.contagem > 0 || Boolean(busca);

    const limparFiltrosEBusca = () => filtros.atualizar({...patchDosValores(definicoes, {}), q: null});

    const blockMutation = useMutation({
        mutationFn: ({id, status}: { id: number; status: string }) =>
            fetchApiData<ContaBancaria>(`/contas-bancarias/${id}`, {
                method: "PUT",
                body: JSON.stringify({status}),
            }),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("contas-bancarias")});
            toast({
                title:
                    variables.status === "ativo" ? "Conta desbloqueada" : "Conta bloqueada",
                description: `O status da conta foi alterado para ${(ROTULO_STATUS[variables.status] ?? variables.status).toLowerCase()}.`,
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
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("contas-bancarias")});
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

    const handleToggleBloqueio = async (conta: ContaBancaria) => {
        const bloquear = conta.status === "ativo";
        const ok = await confirm({
            title: bloquear ? `Bloquear "${conta.nome}"?` : `Desbloquear "${conta.nome}"?`,
            description: bloquear
                ? "A conta fica bloqueada (inativa). O histórico é preservado e você pode desbloquear depois."
                : "A conta volta a ficar ativa.",
            confirmLabel: bloquear ? "Bloquear" : "Desbloquear",
            cancelLabel: "Cancelar",
            variant: bloquear ? "destructive" : "default",
        });
        if (ok) blockMutation.mutate({id: conta.id, status: bloquear ? "bloqueado" : "ativo"});
    };

    // ── Filtros + busca por nome (no navegador) ──
    const {status: filtroStatus, tipo: filtroTipo, banco: filtroBanco} = filtros.valores;
    const filteredContas = useMemo(
        () =>
            contas.filter((c) => {
                if (!casaMulti(filtroStatus, statusDoFiltro(c.status))) return false;
                if (!casaMulti(filtroTipo, c.tipo)) return false;
                if (filtroBanco) {
                    const banco = c.banco?.trim() ?? "";
                    if (filtroBanco === SEM_BANCO ? banco !== "" : banco !== filtroBanco) return false;
                }
                return contemBusca(busca, c.nome);
            }),
        [contas, filtroStatus, filtroTipo, filtroBanco, busca],
    );

    const anuncio = isLoading
        ? ""
        : `${filteredContas.length} ${filteredContas.length === 1 ? "conta encontrada" : "contas encontradas"}`;

    // ── Paginação (página na URL; qualquer mudança de filtro/busca volta à 1) ──
    const totalPages = Math.max(
        1,
        Math.ceil(filteredContas.length / ITEMS_PER_PAGE),
    );
    const currentPage = Math.min(filtros.pagina, totalPages);
    const setCurrentPage = filtros.irParaPagina;

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
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                    >
                        <Plus className="w-4 h-4"/> Cadastrar Novo
                    </button>
                }
            />

            {/* Listagem em tabela */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                {/* Barra de filtros: painel à esquerda, busca à direita */}
                <div
                    className="px-4 py-2.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
                    <div className="flex flex-wrap items-center gap-2">
                        <FiltrosPopover
                            definicoes={definicoes}
                            valores={filtros.valores}
                            contagem={filtros.contagem}
                            onAplicar={filtros.aplicar}
                        />
                    </div>
                    <CampoBusca
                        valor={busca}
                        onBuscar={(termo) => filtros.atualizar({q: termo || null})}
                        placeholder="Buscar por nome…"
                        rotulo="Buscar contas bancárias por nome"
                    />
                </div>

                <FiltrosAtivos
                    chips={filtros.chips}
                    onRemover={filtros.remover}
                    onLimparTodos={filtros.limpar}
                    anuncio={anuncio}
                />

                {filteredContas.length === 0 ? (
                    <div className="py-16 text-center border-dashed border-2 border-white/10 rounded-2xl">
                        <Landmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" aria-hidden="true"/>
                        <p className="text-muted-foreground text-sm font-medium">
                            {contas.length === 0
                                ? "Nenhuma conta cadastrada ainda."
                                : "Nenhum resultado para os filtros aplicados."}
                        </p>
                        {contas.length > 0 && temFiltroOuBusca && (
                            <button
                                type="button"
                                onClick={limparFiltrosEBusca}
                                className={cn("text-primary text-sm font-bold hover:underline mt-2 rounded px-1", FOCO_VISIVEL)}
                            >
                                Limpar filtros e busca
                            </button>
                        )}
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
                                    Banco
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
                                        {/* Banco (logo) */}
                                        <td className="px-5 py-4">
                                            {conta.banco ? (
                                                <BancoLogo banco={conta.banco} size={36}/>
                                            ) : (
                                                <div
                                                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                                    style={{backgroundColor: `${conta.cor}20`}}
                                                >
                                                    <Landmark
                                                        aria-hidden="true"
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
                          {rotuloDoTipo(conta.tipo)}
                        </span>
                                        </td>

                                        {/* Informações */}
                                        <td className="px-5 py-4">
                                            <p className="text-white/80 font-mono text-xs">
                                                {temAgenciaConta
                                                    ? `Agência: ${conta.agencia || "-"} | Conta: ${conta.conta || "-"}`
                                                    : "Sem agência/conta cadastrada"}
                                            </p>
                                            {conta.data_inicio && (
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    Início: {formatarData(conta.data_inicio)}
                                                </p>
                                            )}
                                        </td>

                                        {/* Saldo Atual */}
                                        <td className="px-5 py-4 text-right">
                                            {saldos.visivel ? (
                                                <span
                                                    className={cn("font-bold whitespace-nowrap", classeSaldo(toCents(conta.saldo_atual) / 100))}>
                                {formatCurrency(toCents(conta.saldo_atual) / 100)}
                            </span>
                                            ) : (
                                                <span className="font-bold text-muted-foreground">
                                <span className="sr-only">Saldo oculto</span>
                                <span aria-hidden="true">R$ ••••••</span>
                            </span>
                                            )}
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
                              <CheckCircle aria-hidden="true" className="w-3 h-3"/>
                          ) : (
                              <AlertCircle aria-hidden="true" className="w-3 h-3"/>
                          )}
                            {ROTULO_STATUS[conta.status] ?? conta.status}
                        </span>
                                        </td>

                                        {/* Ações */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <BotaoEditar
                                                    onClick={() => setEditingConta(conta)}
                                                    title={`Editar ${conta.nome}`}
                                                />
                                                <BotaoBloquear
                                                    bloqueado={conta.status !== "ativo"}
                                                    title={`${conta.status === "ativo" ? "Bloquear" : "Desbloquear"} ${conta.nome}`}
                                                    onClick={() => void handleToggleBloqueio(conta)}
                                                />
                                                <BotaoExcluir
                                                    onClick={() => handleDelete(conta)}
                                                    title={`Excluir ${conta.nome}`}
                                                />
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
                                className={cn("p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors", FOCO_VISIVEL)}
                                title="Primeiro"
                                aria-label="Primeira página"
                            >
                                <ChevronsLeft className="w-4 h-4" aria-hidden="true"/>
                            </button>
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                className={cn("p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors", FOCO_VISIVEL)}
                                title="Anterior"
                                aria-label="Página anterior"
                            >
                                <ChevronLeft className="w-4 h-4" aria-hidden="true"/>
                            </button>
                            <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                Página {currentPage} de {totalPages}
              </span>
                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                className={cn("p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors", FOCO_VISIVEL)}
                                title="Próxima"
                                aria-label="Próxima página"
                            >
                                <ChevronRight className="w-4 h-4" aria-hidden="true"/>
                            </button>
                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(totalPages)}
                                className={cn("p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors", FOCO_VISIVEL)}
                                title="Última"
                                aria-label="Última página"
                            >
                                <ChevronsRight className="w-4 h-4" aria-hidden="true"/>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}