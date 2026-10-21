import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from "react";
import {useAuth} from "@/hooks/use-auth";
import {gravarPreferencias, lerPreferencias} from "@/lib/preferencias-usuario";
import {formatCurrency} from "@/lib/utils";

type SaldosVisiveis = {
    visivel: boolean;
    alternar: () => void;
    texto: (valor: string) => string;
};

const Ctx = createContext<SaldosVisiveis | null>(null);

/**
 * Um único interruptor para o sistema inteiro.
 * A escolha fica no navegador, por usuário. O padrão é ocultar até a pessoa mostrar.
 */
export function SaldosVisiveisProvider({children}: { children: ReactNode }) {
    const {user} = useAuth();
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        const atualizar = () => setVersao((v) => v + 1);
        window.addEventListener("ism-preferencias", atualizar);
        window.addEventListener("storage", atualizar);
        return () => {
            window.removeEventListener("ism-preferencias", atualizar);
            window.removeEventListener("storage", atualizar);
        };
    }, []);

    const visivel = useMemo(() => !lerPreferencias(user?.id).ocultarSaldos, [user?.id, versao]);

    const alternar = useCallback(() => {
        if (!user?.id) return;
        const atual = lerPreferencias(user.id);
        const gravou = gravarPreferencias(user.id, {...atual, ocultarSaldos: visivel});
        if (gravou) window.dispatchEvent(new Event("ism-preferencias"));
    }, [user?.id, visivel]);

    const value = useMemo<SaldosVisiveis>(
        () => ({
            visivel,
            alternar,
            texto: (valor) => (visivel ? valor : "••••••"),
        }),
        [visivel, alternar],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSaldosVisiveis(): SaldosVisiveis {
    const ctx = useContext(Ctx);
    if (!ctx) {
        return {visivel: false, alternar: () => undefined, texto: () => "••••••"};
    }
    return ctx;
}

export function useDinheiro(): (valor: number) => string {
    const {texto} = useSaldosVisiveis();
    return useCallback((valor: number) => texto(formatCurrency(valor)), [texto]);
}
