import {useState} from "react";
import {useLocation} from "wouter";
import {fetchApi} from "@/lib/api-config";
import {useAuth, type AuthUser, type EmpresaVinculo} from "@/hooks/use-auth";
import {useToast} from "@/hooks/use-toast";
import {ArrowLeft, Building2, ChevronRight, KeyRound, Loader2, Lock, Mail} from "lucide-react";

type SessionPayload = {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    permissoes?: string[];
    empresa_id?: number;
};

type PrimeiroAcessoPayload = {
    primeiroAcesso: true;
    setupToken: string;
    email: string;
};

type SelecaoEmpresaPayload = {
    requiresEmpresaSelection: true;
    selectionToken: string;
    empresas: EmpresaVinculo[];
    user?: Pick<AuthUser, "id" | "nome" | "email">;
};

type LoginEnvelope = {
    data: SessionPayload | PrimeiroAcessoPayload | SelecaoEmpresaPayload;
};

function isPrimeiroAcesso(data: LoginEnvelope["data"]): data is PrimeiroAcessoPayload {
    return "primeiroAcesso" in data && data.primeiroAcesso === true;
}

function isSelecaoEmpresa(data: LoginEnvelope["data"]): data is SelecaoEmpresaPayload {
    return "requiresEmpresaSelection" in data && data.requiresEmpresaSelection === true;
}

function nomeEmpresa(empresa: EmpresaVinculo): string {
    const fantasia = empresa.nome_fantasia?.trim();
    return fantasia || empresa.razao_social;
}

function labelPapel(papel: string): string {
    if (papel === "admin") return "Admin";
    if (papel === "membro") return "Membro";
    return papel;
}

export default function Login() {
    const [, setLocation] = useLocation();
    const {toast} = useToast();
    const {login} = useAuth();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [selectionToken, setSelectionToken] = useState<string | null>(null);
    const [empresas, setEmpresas] = useState<EmpresaVinculo[]>([]);
    const [usuarioNome, setUsuarioNome] = useState<string | null>(null);
    const [empresaEmCurso, setEmpresaEmCurso] = useState<number | null>(null);

    const emSelecao = selectionToken !== null && empresas.length > 0;

    function concluirSessao(payload: SessionPayload) {
        const {accessToken, refreshToken, user, permissoes, empresa_id} = payload;
        if (!accessToken || !refreshToken || !user) {
            throw new Error("Resposta do servidor inválida.");
        }
        login(
            accessToken,
            refreshToken,
            {...user, empresa_id: user.empresa_id ?? empresa_id},
            Array.isArray(permissoes) ? permissoes : [],
        );
        toast({title: "Sucesso", description: "Login realizado com sucesso!"});
        setTimeout(() => setLocation("/"), 100);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetchApi<LoginEnvelope>("/auth/login", {
                method: "POST",
                body: JSON.stringify({email: email.trim(), senha}),
            });

            if (isPrimeiroAcesso(res.data)) {
                const params = new URLSearchParams({
                    email: res.data.email,
                    setupToken: res.data.setupToken,
                });
                toast({
                    title: "Primeiro acesso detectado",
                    description: "Por favor, defina uma nova senha antes de continuar.",
                });
                setTimeout(() => setLocation(`/definir-senha?${params.toString()}`), 100);
                return;
            }

            if (isSelecaoEmpresa(res.data)) {
                setSelectionToken(res.data.selectionToken);
                setEmpresas(res.data.empresas);
                setUsuarioNome(res.data.user?.nome ?? null);
                setSenha("");
                return;
            }

            concluirSessao(res.data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "E-mail ou senha incorretos.";
            toast({
                variant: "destructive",
                title: "Falha na autenticação",
                description: message,
            });
        } finally {
            setLoading(false);
        }
    }

    async function handleSelectEmpresa(empresaId: number) {
        if (!selectionToken || empresaEmCurso !== null) return;
        setEmpresaEmCurso(empresaId);

        try {
            const res = await fetchApi<{data: SessionPayload}>("/auth/select-empresa", {
                method: "POST",
                body: JSON.stringify({selectionToken, empresa_id: empresaId}),
            });
            concluirSessao(res.data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Não foi possível entrar na empresa.";
            toast({
                variant: "destructive",
                title: "Falha ao selecionar empresa",
                description: message,
            });
        } finally {
            setEmpresaEmCurso(null);
        }
    }

    function handleVoltar() {
        setSelectionToken(null);
        setEmpresas([]);
        setUsuarioNome(null);
        setEmpresaEmCurso(null);
        setSenha("");
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
            <div className="w-full max-w-md space-y-8 bg-[#121417] p-8 rounded-2xl border border-white/5 shadow-2xl">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-black text-white tracking-tighter uppercase">ISM Finance</h1>
                    <p className="text-muted-foreground text-sm">
                        {emSelecao
                            ? usuarioNome
                                ? `${usuarioNome}, escolha a empresa para continuar`
                                : "Escolha a empresa para continuar"
                            : "Acesse sua conta para gerenciar o fluxo de caixa"}
                    </p>
                </div>

                {emSelecao ? (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <ul className="space-y-3">
                            {empresas.map((empresa) => {
                                const emCurso = empresaEmCurso === empresa.id;
                                const bloqueado = empresaEmCurso !== null && !emCurso;
                                return (
                                    <li key={empresa.id}>
                                        <button
                                            type="button"
                                            disabled={empresaEmCurso !== null}
                                            onClick={() => void handleSelectEmpresa(empresa.id)}
                                            className="w-full text-left group flex items-center gap-3 bg-black/20 hover:bg-primary/10 border border-white/10 hover:border-primary/40 rounded-xl px-4 py-3.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                                                <Building2 className="w-5 h-5"/>
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-white truncate">
                                                    {nomeEmpresa(empresa)}
                                                </span>
                                                {empresa.nome_fantasia?.trim() &&
                                                empresa.nome_fantasia.trim() !== empresa.razao_social ? (
                                                    <span className="block text-xs text-muted-foreground truncate">
                                                        {empresa.razao_social}
                                                    </span>
                                                ) : null}
                                                <span className="mt-1 inline-flex text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                    {labelPapel(empresa.papel)}
                                                </span>
                                            </span>
                                            {emCurso ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0"/>
                                            ) : (
                                                <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${bloqueado ? "" : "group-hover:translate-x-0.5 group-hover:text-primary"}`}/>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        <button
                            type="button"
                            onClick={handleVoltar}
                            disabled={empresaEmCurso !== null}
                            className="w-full inline-flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
                        >
                            <ArrowLeft className="w-3.5 h-3.5"/>
                            Voltar e entrar com outra conta
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label
                                    className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email</label>
                                <div className="relative">
                                    <Mail
                                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                                    <input
                                        required
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all"
                                        placeholder="seu@email.com"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Senha</label>
                                <div className="relative">
                                    <Lock
                                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                                    <input
                                        required
                                        type="password"
                                        value={senha}
                                        onChange={(e) => setSenha(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all"
                                        placeholder="••••••"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : "Entrar no Sistema"}
                        </button>

                        <div className="pt-1 flex justify-center">
                            <a
                                href="/primeiro-acesso"
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                            >
                                <KeyRound className="w-3.5 h-3.5"/>
                                Primeiro acesso? Insira seu código aqui
                            </a>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
