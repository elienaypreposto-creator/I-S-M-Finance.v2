/**
 * DefinirSenhaPage - suporta dois modos de entrada:
 *
 * Modo A - Ativação por e-mail (Fluxo OTP):
 *   URL: /definir-senha?email=<email>&token=<otp>
 *   Endpoint: POST /auth/definir-senha
 *   Válido quando o admin criou a conta sem senha.
 *
 * Modo B - Primeiro acesso com senha de admin (Fluxo setupToken):
 *   URL: /definir-senha?email=<email>&setupToken=<jwt>
 *   Endpoint: POST /auth/setup-password
 *   Válido quando o admin definiu uma senha temporária e o utilizador
 *   está a fazer o primeiro login.
 */

import {useState} from "react";
import {useLocation, useSearch} from "wouter";
import {fetchApi} from "@/lib/api-config";
import {useToast} from "@/hooks/use-toast";
import {CheckCircle, Eye, EyeOff, Lock, Loader2, ShieldCheck} from "lucide-react";

function PasswordInput({
                           id,
                           value,
                           onChange,
                           placeholder,
                           disabled,
                       }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [show, setShow] = useState(false);

    return (
        <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
            <input
                id={id}
                required
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={placeholder ?? "••••••••"}
                className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
                type="button"
                tabIndex={-1}
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
            >
                {show ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
            </button>
        </div>
    );
}

function PasswordStrengthHints({senha}: { senha: string }) {
    const rules = [
        {label: "Mínimo de 8 caracteres", ok: senha.length >= 8},
        {label: "Ao menos 1 letra maiúscula", ok: /[A-Z]/.test(senha)},
        {label: "Ao menos 1 número", ok: /[0-9]/.test(senha)},
    ];

    if (!senha) return null;

    return (
        <ul className="mt-2 space-y-1">
            {rules.map((r) => (
                <li key={r.label}
                    className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-400" : "text-muted-foreground"}`}>
                    <CheckCircle
                        className={`w-3.5 h-3.5 flex-shrink-0 ${r.ok ? "text-emerald-400" : "text-white/20"}`}/>
                    {r.label}
                </li>
            ))}
        </ul>
    );
}

export default function DefinirSenhaPage() {
    const [, setLocation] = useLocation();
    const searchString = useSearch();
    const {toast} = useToast();

    const searchParams = new URLSearchParams(searchString);
    const email = searchParams.get("email") ?? "";
    const token = searchParams.get("token") ?? "";
    const setupToken = searchParams.get("setupToken") ?? "";

    const modoAtivacao = !!token;
    const modoPrimeiroAcesso = !!setupToken;

    const [novaSenha, setNovaSenha] = useState("");
    const [confirmarSenha, setConfirmarSenha] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    // Link inválido - nenhum token presente
    if (!email || (!token && !setupToken)) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
                <div
                    className="w-full max-w-md bg-[#121417] p-8 rounded-2xl border border-white/5 shadow-2xl text-center space-y-4">
                    <ShieldCheck className="w-12 h-12 text-destructive mx-auto"/>
                    <h2 className="text-xl font-bold text-white">Link inválido</h2>
                    <p className="text-sm text-muted-foreground">
                        Este link de ativação é inválido ou expirou.<br/>
                        Solicite um novo convite ao administrador do sistema.
                    </p>
                    <a
                        href="/login"
                        className="inline-block mt-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                        Voltar ao login
                    </a>
                </div>
            </div>
        );
    }

    // Tela de sucesso pós-submit
    if (done) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
                <div
                    className="w-full max-w-md bg-[#121417] p-8 rounded-2xl border border-white/5 shadow-2xl text-center space-y-4">
                    <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto"/>
                    <h2 className="text-xl font-bold text-white">
                        {modoPrimeiroAcesso ? "Senha alterada!" : "Conta ativada!"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {modoPrimeiroAcesso
                            ? "A sua senha foi atualizada com sucesso."
                            : "A sua senha foi definida com sucesso."
                        }<br/>
                        Redirecionando para o login…
                    </p>
                </div>
            </div>
        );
    }

    function validate(): string | null {
        if (novaSenha.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
        if (!/[A-Z]/.test(novaSenha)) return "A senha deve conter ao menos 1 letra maiúscula.";
        if (!/[0-9]/.test(novaSenha)) return "A senha deve conter ao menos 1 número.";
        if (novaSenha !== confirmarSenha) return "As senhas não coincidem.";
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const err = validate();
        if (err) {
            toast({variant: "destructive", title: "Dados inválidos", description: err});
            return;
        }

        setLoading(true);
        try {
            if (modoAtivacao) {
                // Fluxo A: valida OTP + define senha
                await fetchApi("/auth/definir-senha", {
                    method: "POST",
                    body: JSON.stringify({email, token, novaSenha}),
                });
            } else {
                // Fluxo B: usa setupToken (primeiro login com senha de admin)
                await fetchApi("/auth/setup-password", {
                    method: "POST",
                    body: JSON.stringify({email, setupToken, novaSenha}),
                });
            }

            setDone(true);
            toast({
                title: modoPrimeiroAcesso ? "Senha alterada com sucesso!" : "Conta ativada!",
                description: "Redirecionando para o login…",
            });
            setTimeout(() => setLocation("/login"), 2000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Erro ao definir senha.";
            toast({variant: "destructive", title: "Erro", description: message});
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0b0d] p-4">
            <div className="w-full max-w-md bg-[#121417] p-8 rounded-2xl border border-white/5 shadow-2xl space-y-8">

                <div className="text-center space-y-2">
                    <div
                        className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                        <ShieldCheck className="w-7 h-7 text-primary"/>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
                        {modoPrimeiroAcesso ? "Defina sua Senha" : "Ativar Conta"}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {modoPrimeiroAcesso
                            ? "Por segurança, crie uma senha pessoal antes de continuar."
                            : "Crie a sua senha de acesso ao ISM Finance."
                        }
                    </p>
                    <p className="text-xs text-muted-foreground/60 bg-white/5 rounded-lg px-3 py-1.5 inline-block">
                        {email}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label htmlFor="nova-senha"
                               className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Nova Senha
                        </label>
                        <PasswordInput
                            id="nova-senha"
                            value={novaSenha}
                            onChange={setNovaSenha}
                            disabled={loading}
                        />
                        <PasswordStrengthHints senha={novaSenha}/>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="confirmar-senha"
                               className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Confirmar Senha
                        </label>
                        <PasswordInput
                            id="confirmar-senha"
                            value={confirmarSenha}
                            onChange={setConfirmarSenha}
                            disabled={loading}
                            placeholder="Repita a senha"
                        />
                        {confirmarSenha && novaSenha !== confirmarSenha && (
                            <p className="text-xs text-destructive mt-1">As senhas não coincidem.</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                        {loading
                            ? <Loader2 className="w-5 h-5 animate-spin"/>
                            : <><ShieldCheck
                                className="w-4 h-4"/> {modoPrimeiroAcesso ? "Salvar Nova Senha" : "Ativar Conta"}</>
                        }
                    </button>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                    Já tem acesso?{" "}
                    <a href="/login" className="text-primary hover:text-primary/80 transition-colors">
                        Fazer login
                    </a>
                </p>
            </div>
        </div>
    );
}
