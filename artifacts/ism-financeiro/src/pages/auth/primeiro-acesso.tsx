import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { fetchApi } from "@/lib/api-config";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, KeyRound, Lock } from "lucide-react";

export default function PrimeiroAcesso() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  
  // Etapas: 1 = Validar OTP, 2 = Definir Senha
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  
  // Estado Etapa 1
  const searchParams = new URLSearchParams(searchString);
  const initialEmail = searchParams.get("email") || "";
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [setupToken, setSetupToken] = useState("");

  // Estado Etapa 2
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetchApi<{ data: { setupToken: string } }>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });

      if (res.data?.setupToken) {
        setSetupToken(res.data.setupToken);
        setStep(2);
        toast({ title: "Código Válido", description: "Agora crie sua senha permanente." });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao validar o código.";
      toast({
        variant: "destructive",
        title: "Erro na Validação",
        description: message,
      });
    } finally {
      setLoading(false);
    }
  }

  const validatePassword = (password: string) => {
    if (password.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
    if (!/[A-Z]/.test(password)) return "A senha deve conter ao menos 1 letra maiúscula.";
    if (!/[0-9]/.test(password)) return "A senha deve conter ao menos 1 número.";
    return null;
  };

  async function handleSetupPassword(e: React.FormEvent) {
    e.preventDefault();
    
    if (novaSenha !== confirmarSenha) {
      toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem." });
      return;
    }

    const passError = validatePassword(novaSenha);
    if (passError) {
      toast({ variant: "destructive", title: "Senha Fraca", description: passError });
      return;
    }

    setLoading(true);
    try {
      await fetchApi("/auth/setup-password", {
        method: "POST",
        body: JSON.stringify({ email, setupToken, novaSenha }),
      });

      toast({ 
        title: "Senha Definida", 
        description: "Sua senha foi cadastrada com sucesso! Faça login para continuar." 
      });
      setTimeout(() => setLocation("/login"), 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao cadastrar senha.";
      toast({
        variant: "destructive",
        title: "Erro",
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
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Primeiro Acesso</h1>
          <p className="text-muted-foreground text-sm">
            {step === 1 ? "Valide o código recebido por e-mail" : "Defina sua senha permanente"}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Seu E-mail (Login)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    required
                    disabled
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white/70 outline-none focus:border-primary/50 transition-all cursor-not-allowed"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Código Inicial
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    required
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.toUpperCase())}
                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all font-mono tracking-widest"
                    placeholder="ABCD12"
                    maxLength={8}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Validar Código"}
            </button>
            <div className="text-center mt-4">
              <a href="/login" className="text-xs text-muted-foreground hover:text-white transition-colors">Voltar para o Login</a>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSetupPassword} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    required
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Confirme a Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    required
                    type="password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Salvar e Acessar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
