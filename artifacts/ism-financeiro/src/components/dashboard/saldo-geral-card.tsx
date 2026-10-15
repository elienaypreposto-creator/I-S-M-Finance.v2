import {useMemo, useState, type ReactNode} from "react";
import {useQuery} from "@tanstack/react-query";
import {Link} from "wouter";
import {AlertCircle, ChevronDown, Landmark, RotateCw} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {fetchApiData} from "@/lib/api-config";
import {tenantQueryKey} from "@/lib/tenant-query";
import {classeSaldo} from "@/lib/saldo";
import {
    descricaoConta,
    formatarSaldo,
    resumirSaldoGeral,
    rotuloQuantidadeContas,
    type ContaComSaldo,
} from "@/lib/saldo-geral";
import {cn} from "@/lib/utils";

const ROTA_CONTAS = "/cadastros/contas-bancarias";

/** Ocupa a linha inteira no celular (2+2+1) e uma coluna a partir do md. */
const CELULA = "col-span-2 md:col-span-1";

/** "BRB - Banco de Brasília" → BRB, "Banco C6" → C6, "Banco do Brasil" → BB, "Nubank" → NU. */
function siglaConta(conta: ContaComSaldo): string {
    const palavras = (conta.banco || conta.nome || "?")
        .split(/[\s\-–·.]+/)
        .filter((p) => p && !/^(de|do|da|dos|das|s|a)$/i.test(p));
    const acronimo = palavras.find((p) => /^[A-Z0-9]{2,3}$/.test(p) && /[A-Z]/.test(p));
    if (acronimo) return acronimo;
    if (palavras.length === 0) return "?";
    const sigla = palavras.length > 1 ? palavras[0][0] + palavras[1][0] : palavras[0].slice(0, 2);
    return sigla.toUpperCase();
}

/** Texto escuro sobre cores claras (amarelo etc.) para a sigla continuar legível. */
function corTextoSobre(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return "#FFFFFF";
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111827" : "#FFFFFF";
}

function CardBase({children, className}: { children: ReactNode; className?: string }) {
    return <div className={cn("glass-panel rounded-2xl p-5", CELULA, className)}>{children}</div>;
}

function Cabecalho() {
    return (
        <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">Saldo geral</p>
            <Landmark className="w-5 h-5 text-primary" aria-hidden="true"/>
        </div>
    );
}

export function SaldoGeralCard() {
    const [aberto, setAberto] = useState(false);
    // Mesma chave e mesma função da tela de Contas Bancárias: o cache é compartilhado.
    const {data, isLoading, isError, refetch, isFetching} = useQuery<ContaComSaldo[]>({
        queryKey: tenantQueryKey("contas-bancarias"),
        queryFn: () => fetchApiData<ContaComSaldo[]>("/contas-bancarias"),
    });

    const resumo = useMemo(() => resumirSaldoGeral(data ?? []), [data]);

    if (isLoading) {
        return (
            <div className={cn("glass-panel rounded-2xl p-5 animate-pulse", CELULA)} aria-busy="true"
                 aria-label="Carregando saldo geral">
                <div className="h-3 bg-white/10 rounded mb-3 w-3/4"/>
                <div className="h-6 bg-white/10 rounded w-1/2"/>
            </div>
        );
    }

    if (isError) {
        return (
            <CardBase>
                <Cabecalho/>
                <p className="text-sm text-destructive flex items-center gap-1.5" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true"/>
                    Não foi possível carregar os saldos
                </p>
                <button
                    type="button"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                    <RotateCw className={cn("w-3 h-3", isFetching && "animate-spin")} aria-hidden="true"/>
                    Tentar de novo
                </button>
            </CardBase>
        );
    }

    if (resumo.contas.length === 0) {
        return (
            <CardBase>
                <Cabecalho/>
                <p className="text-sm text-muted-foreground">
                    Nenhuma conta ativa ·{" "}
                    <Link href={ROTA_CONTAS} className="font-semibold text-primary hover:underline">
                        Cadastrar conta
                    </Link>
                </p>
            </CardBase>
        );
    }

    const totalFmt = formatarSaldo(resumo.totalCentavos);
    const corTotal = classeSaldo(resumo.totalCentavos);

    return (
        <Popover open={aberto} onOpenChange={setAberto}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Saldo geral ${totalFmt}. Ver saldo por conta`}
                    className={cn(
                        "glass-panel rounded-2xl p-5 text-left w-full transition-colors hover:border-primary/50",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        aberto && "border-primary/50",
                        CELULA,
                    )}
                >
                    <Cabecalho/>
                    <p className={cn("text-xl font-bold", corTotal)}>{totalFmt}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {rotuloQuantidadeContas(resumo.contas.length)} ·{" "}
                        <span className="text-primary font-semibold whitespace-nowrap">
                            ver por conta
                            <ChevronDown
                                className={cn("inline w-3 h-3 ml-0.5 transition-transform", aberto && "rotate-180")}
                                aria-hidden="true"
                            />
                        </span>
                    </p>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={8}
                collisionPadding={16}
                aria-label="Saldo por conta"
                className="w-[min(420px,calc(100vw-2rem))] p-2 rounded-xl border-white/10 bg-card shadow-2xl"
            >
                <h4 className="px-2.5 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Saldo por conta
                </h4>
                <ul className="max-h-[min(360px,60vh)] overflow-y-auto" aria-label="Contas ativas">
                    {resumo.contas.map((conta) => (
                        <li key={conta.id}>
                            <Link
                                href={ROTA_CONTAS}
                                onClick={() => setAberto(false)}
                                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                <span
                                    aria-hidden="true"
                                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[9px] font-extrabold ring-1 ring-inset ring-white/15"
                                    style={{
                                        backgroundColor: conta.cor || "#3BA8DC",
                                        color: corTextoSobre(conta.cor || "#3BA8DC"),
                                    }}
                                >
                                    {siglaConta(conta)}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block font-bold text-white truncate">{conta.nome}</span>
                                    <span className="block text-[10px] text-muted-foreground truncate">
                                        {descricaoConta(conta)}
                                    </span>
                                </span>
                                <span className={cn("font-bold whitespace-nowrap", classeSaldo(conta.saldoCentavos))}>
                                    {formatarSaldo(conta.saldoCentavos)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
                <div className="mt-1 flex items-center justify-between border-t border-white/10 px-2.5 py-2.5 text-xs font-bold">
                    <span>Saldo geral</span>
                    <span className={corTotal}>{totalFmt}</span>
                </div>
                <Link
                    href={ROTA_CONTAS}
                    onClick={() => setAberto(false)}
                    className="block rounded-lg py-2 text-center text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    Ver contas bancárias →
                </Link>
            </PopoverContent>
        </Popover>
    );
}
