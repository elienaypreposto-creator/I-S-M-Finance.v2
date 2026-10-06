import {CheckCircle} from "lucide-react";
import {avaliarSenha, type NivelSenha, type SenhaContexto} from "@/lib/senha-policy";

const NIVEIS: Record<NivelSenha, { texto: string; cor: string; barras: number }> = {
    vazia: {texto: "", cor: "bg-white/10", barras: 0},
    fraca: {texto: "Fraca", cor: "bg-red-500", barras: 1},
    boa: {texto: "Boa", cor: "bg-amber-400", barras: 2},
    forte: {texto: "Forte", cor: "bg-emerald-400", barras: 3},
};

export function SenhaForca({senha, email, nome}: { senha: string } & SenhaContexto) {
    if (!senha) return null;

    const {regras, nivel} = avaliarSenha(senha, {email, nome});
    const n = NIVEIS[nivel];

    return (
        <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= n.barras ? n.cor : "bg-white/10"}`}/>
                    ))}
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">{n.texto}</span>
            </div>
            <ul className="space-y-1">
                {regras
                    .filter((r) => r.id !== "max" || !r.ok) // "máximo" só aparece quando estourou
                    .map((r) => (
                        <li
                            key={r.id}
                            className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-400" : "text-muted-foreground"}`}
                        >
                            <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${r.ok ? "text-emerald-400" : "text-white/20"}`}/>
                            {r.label}
                        </li>
                    ))}
            </ul>
            <p className="text-[11px] text-muted-foreground/70">
                Uma frase longa vale mais que símbolos. Também verificamos se a senha já vazou.
            </p>
        </div>
    );
}