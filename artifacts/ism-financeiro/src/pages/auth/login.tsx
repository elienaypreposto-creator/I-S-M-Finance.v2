import {useState} from "react";
import {useLocation} from "wouter";
import {fetchApi} from "@/lib/api-config";
import { useAuth, type User } from "@/contexts/auth-context";
import {useToast} from "@/hooks/use-toast";
import {Loader2, Lock, Mail} from "lucide-react";

type LoginResponse = {
    data: {
        accessToken: string;
        refreshToken: string;
        user: User;
    };
};

export default function Login() {
    const [, setLocation] = useLocation();
    const {toast} = useToast();
    const {login} = useAuth();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetchApi<LoginResponse>("/auth/login", {
                method: "POST",
                body: JSON.stringify({email: email.trim(), senha}),
            });

            const {accessToken, refreshToken, user} = res.data;

            if (!accessToken || !refreshToken || !user) {
                throw new Error("Resposta do servidor inválida.");
            }

            login(accessToken, refreshToken, user);
            toast({title: "Sucesso", description: "Login realizado com sucesso!"});
            setTimeout(() => setLocation("/"), 100);
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

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
            <div className="w-full max-w-md space-y-8 bg-[#121417] p-8 rounded-2xl border border-white/5 shadow-2xl">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-black text-white tracking-tighter uppercase">ISM Finance</h1>
                    <p className="text-muted-foreground text-sm">Acesse sua conta para gerenciar o fluxo de caixa</p>
                </div>

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
                </form>
            </div>
        </div>
    );
}
