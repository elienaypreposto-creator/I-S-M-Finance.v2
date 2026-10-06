import {useState} from "react";
import {useSearch} from "wouter";
import {fetchApi} from "@/lib/api-config";
import {useToast} from "@/hooks/use-toast";
import {ArrowLeft, Loader2, Mail, MailCheck} from "lucide-react";

export default function EsqueciSenhaPage() {
    const searchString = useSearch();
    const {toast} = useToast();
    const [email, setEmail] = useState(new URLSearchParams(searchString).get("email") ?? "");
    const [loading, setLoading] = useState(false);
    const [enviado, setEnviado] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            await fetchApi("/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({email: email.trim()}),
            });
            setEnviado(true);
        } catch (err: unknown) {
            toast({
                variant: "destructive",
                title: "Erro",
                description: err instanceof Error ? err.message : "Não foi possível enviar o e-mail.",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
            <div className="w-full max-w-md bg-[#121417] p-8 rounded-2xl border border-white/5 shadow-2xl space-y-6">
                {enviado ? (
                    <div className="text-center space-y-4">
                        <MailCheck className="w-12 h-12 text-emerald-400 mx-auto"/>
                        <h1 className="text-xl font-bold text-white">Verifique seu e-mail</h1>
                        <p className="text-sm text-muted-foreground">
                            Se este e-mail estiver cadastrado, você receberá o link para criar uma nova senha em instantes.
                            O link vale por 1 hora.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="text-center space-y-2">
                            <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Esqueci minha senha</h1>
                            <p className="text-sm text-muted-foreground">
                                Informe o seu e-mail e enviaremos um link para criar uma nova senha.
                            </p>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                                <input
                                    required
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    placeholder="seu@email.com"
                                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all disabled:opacity-50"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : "Enviar link"}
                            </button>
                        </form>
                    </>
                )}
                <a
                    href="/login"
                    className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5"/>
                    Voltar ao login
                </a>
            </div>
        </div>
    );
}