import {EyeOff} from "lucide-react";
import {cn} from "@/lib/utils";

type Props = {
    /** Nome do gráfico como aparece na frase, ex.: "Gráfico Orçado × Realizado". */
    titulo: string;
    /** Concordância da frase quando o aviso substitui mais de um gráfico. */
    plural?: boolean;
    className?: string;
};

/**
 * Fica no lugar de um gráfico enquanto os saldos estão ocultos: altura de barra,
 * fatia de pizza e forma de linha contam a proporção entre os valores, mesmo com
 * o eixo mascarado.
 */
export function GraficoOculto({titulo, plural = false, className}: Props) {
    return (
        <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
            <EyeOff className="w-5 h-5 shrink-0" aria-hidden="true"/>
            <p>
                {titulo} {plural ? "ocultos" : "oculto"} porque os saldos estão ocultos. Mostre os
                saldos para ver {plural ? "os gráficos" : "o gráfico"}.
            </p>
        </div>
    );
}
