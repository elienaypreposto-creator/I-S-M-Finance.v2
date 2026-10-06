import {useState} from "react";
import {useLocation, useSearch} from "wouter";
import {fetchApi} from "@/lib/api-config";
import {useToast} from "@/hooks/use-toast";
import {SenhaForca} from "@/components/auth/senha-forca";
import {avaliarSenha} from "@/lib/senha-policy";
import {CheckCircle, Loader2, Lock, ShieldCheck} from "lucide-react";

/** O e-mail vai no payload do JWT (não é segredo); serve só para a checagem "contém o e-mail" no front. */
function emailDoToken(token: string): string | null {
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return (JSON.parse(atob(payload)) as { email?: string }).email ?? null;
    } catch {
        return null;
    }
}

const inputCls =
    "w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all disabled:opacity-50";

export default function RedefinirSenhaPage() {
    const [, setLocation] = useLocation();
    const searchString = useSearch();
    const {toast} = useToast();

    const token = new URLSearchParams(searchString).get("token") ?? "";
    const email = emailDoToken(token);

    const [novaSenha, setNovaSenha] = useState("");
    const [confirmarSenha, setConfirmarSenha] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    if (!token) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
                <div className="w-full max-w-md bg-[#121417] p-8 rounded-2xl border border-white/5 text-center space-y-4">
                    <ShieldCheck className="w-12 h-12 text-destructive mx-auto"/>
                    <h2 className="text-xl font-bold text-white">Link inválido</h2>
                    <p className="text-sm text-muted-foreground">Este link é inválido ou expirou.</p>
                    <a href="/esqueci-senha" className="inline-block text-sm text-primary hover:text-primary/80">
                        Solicitar um novo link
                    </a>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
                <div className="w-full max-w-md bg-[#121417] p-8 rounded-2xl border border-white/5 text-center space-y-4">
                    <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto"/>
                    <h2 className="text-xl font-bold text-white">Senha redefinida!</h2>
                    <p className="text-sm text-muted-foreground">Redirecionando para o login…</p>
                </div>
            </div>
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const r = avaliarSenha(novaSenha, {email});
        const erro = !r.valida ? r.erro : novaSenha !== confirmarSenha ? "As senhas não coincidem." : null;
        if (erro) {
            toast({variant: "destructive", title: "Dados inválidos", description: erro});
            return;
        }

        setLoading(true);
        try {
            await fetchApi("/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({resetToken: token, novaSenha}),
            });
            setDone(true);
            setTimeout(() => setLocation("/login"), 2000);
        } catch (err: unknown) {
            toast({
                variant: "destructive",
                title: "Não foi possível redefinir",
                description: err instanceof Error ? err.message : "Erro ao redefinir senha.",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
            <div className="w-full max-w-md bg-[#121417] p-8 rounded-2xl border border-white/5 shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Nova senha</h1>
                    {email && (
                        <p className="text-xs text-muted-foreground/60 bg-white/5 rounded-lg px-3 py-1.5 inline-block">{email}</p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nova senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                            <input
                                required
                                type="password"
                                autoComplete="new-password"
                                value={novaSenha}
                                onChange={(e) => setNovaSenha(e.target.value)}
                                disabled={loading}
                                className={inputCls}
                            />
                        </div>
                        <SenhaForca senha={novaSenha} email={email}/>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Confirmar senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                            <input
                                required
                                type="password"
                                autoComplete="new-password"
                                value={confirmarSenha}
                                onChange={(e) => setConfirmarSenha(e.target.value)}
                                disabled={loading}
                                className={inputCls}
                            />
                        </div>
                        {confirmarSenha && novaSenha !== confirmarSenha && (
                            <p className="text-xs text-destructive">As senhas não coincidem.</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <><ShieldCheck className="w-4 h-4"/> Salvar nova senha</>}
                    </button>
                </form>
            </div>
        </div>
    );
}